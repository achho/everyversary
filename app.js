/* Everyversary - timezone-naive date/time arithmetic.
   Date's UTC getters/setters are used only as a timezone-neutral Gregorian
   arithmetic engine. No local timezone or UTC conversion is applied. */

"use strict";

const STORAGE_KEY = "everyversary.entries.v1";
const MIN_HORIZON_MONTHS = 3;
const MAX_HORIZON_YEARS = 100;
const SECONDS_PER_DAY = 86400;
const SHARE_SEPARATOR = ",";

const NICE_NUMBERS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 11, 20, 22, 30, 33, 40, 44, 50, 55, 60, 66, 70, 77, 80, 88, 90, 99,
  100, 111, 200, 222, 300, 333, 400, 444, 500, 555, 600, 666, 700, 777, 800, 888, 900, 999,
  1000, 1111, 2000, 2222, 3000, 3333, 4000, 4444, 5000, 5555, 6000, 6666, 7000, 7777, 8000, 8888, 9000, 9999,
  10000, 11111, 20000, 22222, 30000, 33333, 40000, 44444, 50000, 55555, 60000, 66666, 70000, 77777, 80000, 88888, 90000, 99999,
  100000, 111111, 200000, 222222, 300000, 333333, 400000, 444444, 500000, 555555, 600000, 666666, 700000, 777777, 800000, 888888, 900000, 999999,
  1000000, 1111111, 2000000, 2222222, 3000000, 3333333, 4000000, 4444444, 5000000, 5555555, 6000000, 6666666, 7000000, 7777777, 8000000, 8888888, 9000000, 9999999,
  10000000, 11111111, 20000000, 22222222, 30000000, 33333333, 40000000, 44444444, 50000000, 55555555, 60000000, 66666666, 70000000, 77777777, 80000000, 88888888, 90000000, 99999999,
  100000000, 111111111, 200000000, 222222222, 300000000, 333333333, 400000000, 444444444, 500000000, 555555555, 600000000, 666666666, 700000000, 777777777, 800000000, 888888888, 900000000, 999999999,
  1000000000, 1111111111, 2000000000, 2222222222, 3000000000, 3333333333
];

const UNITS = [
  { key: "seconds", label: "seconds", kind: "fixed", factor: 1 },
  { key: "minutes", label: "minutes", kind: "fixed", factor: 60 },
  { key: "hours", label: "hours", kind: "fixed", factor: 3600 },
  { key: "days", label: "days", kind: "fixed", factor: SECONDS_PER_DAY },
  { key: "weeks", label: "weeks", kind: "fixed", factor: 7 * SECONDS_PER_DAY },
  { key: "months", label: "months", kind: "months" },
  { key: "years", label: "years", kind: "years" }
];

const $ = (id) => document.getElementById(id);
const form = $("entry-form");
const editor = $("editor");
const rows = $("everyversary-rows");
let entries = loadEntries();
let Everyversaries = [];
let sharedEntries = [];
let selectedEntryIds = new Set();
const PAGE_SIZE = 20;
let currentPage = 0;

function getSharedEntriesFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const result = [];

  for (const raw of params.getAll("entry")) {
    const [namePart, date, compactTime = ""] = raw.split(SHARE_SEPARATOR);

    const name = (namePart || "").trim();
    const time = parseSharedTime(compactTime);
    if (!name || !date || time === null) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    try {
      const startMs = parseNaiveDate(date, time);

      result.push({
        id: `shared-${result.length}`,
        name,
        date,
        time,
        startMs,
        shared: true
      });
      
    } catch {
      // Ignore malformed entries.
    }
  }

  return result;
}

function getDisplayEntries() {
  const temporary = sharedEntries.filter(shared =>
    !entries.some(entry =>
      entry.name.toLocaleLowerCase() === shared.name.toLocaleLowerCase() &&
      entry.date === shared.date &&
      (entry.time || "") === shared.time
    )
  );

  return [...entries, ...temporary];
}

async function copyShareLink(entriesToShare) {
  const url = new URL(window.location.href);

  url.search = "";
  url.hash = "";

  for (const entry of entriesToShare) {
    const value = [
      entry.name,
      entry.date,
      (entry.time || "").replace(":", "")
    ].join(SHARE_SEPARATOR);

    url.searchParams.append("entry", value);
  }

  try {
    const shareUrl = url.toString().replace(/%2C/gi, ",");
    await navigator.clipboard.writeText(shareUrl);
    setStatus(
      `${entriesToShare.length} ${entriesToShare.length === 1 ? "entry" : "entries"} included in link.`
    );
  } catch {
    setStatus("Could not copy link. Check clipboard permissions.");
  }
}

function makeUtcDate(year, monthIndex, day, hour = 0, minute = 0, second = 0) {
  const d = new Date(0);
  d.setUTCHours(hour, minute, second, 0);
  d.setUTCFullYear(year, monthIndex, day);
  return d;
}

function parseSharedTime(value) {
  if (!value) return "";

  if (!/^\d{4}$/.test(value)) return null;

  const hours = Number(value.slice(0, 2));
  const minutes = Number(value.slice(2, 4));

  if (hours > 23 || minutes > 59) return null;

  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

function parseNaiveDate(dateText, timeText = "") {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText || "");
  if (!dm) throw new Error("Date must use YYYY-MM-DD.");

  const tm = timeText
    ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText)
    : null;

  if (timeText && !tm) {
    throw new Error("Time must use HH:MM or HH:MM:SS.");
  }

  const [year, month, day] = dm.slice(1).map(Number);
  const hour = tm ? Number(tm[1]) : 0;
  const minute = tm ? Number(tm[2]) : 0;
  const second = tm && tm[3] ? Number(tm[3]) : 0;

  if (
    month < 1 || month > 12 ||
    hour > 23 || minute > 59 || second > 59
  ) {
    throw new Error("Invalid date or time.");
  }

  const d = makeUtcDate(year, month - 1, day, hour, minute, second);

  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    throw new Error("That calendar date does not exist.");
  }

  return d.getTime();
}

function formatNaive(ms) {
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, "0");

  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

  return `${date} ${time}`;
}

function addCalendarMonths(ms, amount) {
  const d = new Date(ms);
  const year = d.getUTCFullYear();
  const monthIndex = d.getUTCMonth() + amount;
  const targetYear = year + Math.floor(monthIndex / 12);
  const targetMonth = ((monthIndex % 12) + 12) % 12;
  const lastDay = makeUtcDate(targetYear, targetMonth + 1, 0).getUTCDate();
  return makeUtcDate(
    targetYear, targetMonth, Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()
  ).getTime();
}

function addCalendarYears(ms, amount) {
  return addCalendarMonths(ms, amount * 12);
}

function getNaiveNowMs() {
  // Read the browser's displayed local calendar fields, then store them as a
  // timezone-free value. This deliberately does not use the absolute epoch.
  const d = new Date();
  return makeUtcDate(
    d.getFullYear(), d.getMonth(), d.getDate(),
    d.getHours(), d.getMinutes(), d.getSeconds()
  ).getTime();
}

function generateEveryversaries(nowMs, sourceEntries = entries) {
  const maxMs = addCalendarYears(nowMs, MAX_HORIZON_YEARS);
  const result = [];

  for (const entry of sourceEntries) {
    const minMs = addCalendarMonths(entry.startMs, MIN_HORIZON_MONTHS);

    for (const number of NICE_NUMBERS) {
      for (const unit of UNITS) {
        let targetMs;

        if (unit.kind === "fixed") {
          targetMs = entry.startMs + number * unit.factor * 1000;
        } else if (unit.kind === "months") {
          targetMs = addCalendarMonths(entry.startMs, number);
        } else {
          targetMs = addCalendarYears(entry.startMs, number);
        }

        if (targetMs >= nowMs && targetMs >= minMs && targetMs <= maxMs) {
          result.push({
            id: entry.id,
            name: entry.name,
            startMs: entry.startMs,
            targetMs,
            number,
            unit: unit.label,
            label: `${number.toLocaleString("en-US")} ${unit.label}`
          });
        }
      }
    }
  }

  result.sort((a, b) => a.targetMs - b.targetMs || a.name.localeCompare(b.name));
  return result;
}

function loadEntries() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return saved.filter(e => e && typeof e.id === "string" && typeof e.name === "string" &&
      typeof e.date === "string" && typeof e.startMs === "number");
  } catch { return []; }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function saveSharedEntry(id) {
  const shared = sharedEntries.find(entry => entry.id === id);
  if (!shared) return;

  const alreadySaved = entries.some(entry =>
    entry.name.toLocaleLowerCase() === shared.name.toLocaleLowerCase() &&
    entry.date === shared.date &&
    (entry.time || "") === shared.time
  );

  if (!alreadySaved) {
    entries.push({
      id: makeId(),
      name: shared.name,
      date: shared.date,
      time: shared.time,
      startMs: shared.startMs
    });

    persist();
  }

  sharedEntries = sharedEntries.filter(entry => entry.id !== id);
  render();
  setStatus("Entry saved.");
}

function dismissSharedEntry(id) {
  sharedEntries = sharedEntries.filter(entry => entry.id !== id);
  render();
}

function renderEveryversaries() {
  const now = getNaiveNowMs();

  Everyversaries = generateEveryversaries(now, getDisplayEntries());

  const nameFilter = $("name-filter").value.trim().toLocaleLowerCase();

  const filtered = Everyversaries.filter(m =>
    !nameFilter || m.name.toLocaleLowerCase().includes(nameFilter)
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages - 1);

  const start = currentPage * PAGE_SIZE;
  const visible = filtered.slice(start, start + PAGE_SIZE);

  $("page-indicator").textContent = filtered.length
    ? `${start + 1}–${start + visible.length} of ${filtered.length}`
    : "0 entries";

  $("previous-page").disabled = currentPage === 0;
  $("next-page").disabled = currentPage >= totalPages - 1;

  if (!visible.length) {
    rows.innerHTML = `<tr><td colspan="4" class="empty">${
      getDisplayEntries().length
        ? "No upcoming Everyversaries."
        : "Add someone to see upcoming Everyversaries."
    }</td></tr>`;
    return;
  }

  rows.innerHTML = visible.map(m => `
    <tr>
      <td>${formatNaive(m.targetMs)}</td>
      <td>${escapeHtml(m.name)}</td>
      <td class="everyversary">${escapeHtml(m.label)}</td>
      <td></td>
    </tr>`).join("");
}

function renderEntries() {
  const displayEntries = getDisplayEntries();

  $("entry-count").textContent =
    `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;

  // Remove selections for entries that no longer exist.
  selectedEntryIds = new Set(
    [...selectedEntryIds].filter(id =>
      entries.some(entry => entry.id === id)
    )
  );

  const list = $("entry-list");
  list.innerHTML = "";

  displayEntries.forEach(entry => {
    const item = $("entry-template").content.firstElementChild.cloneNode(true);

    item.querySelector(".entry-person").textContent = entry.name;
    item.querySelector(".entry-start").textContent = formatNaive(entry.startMs);

    if (entry.shared) {
      item.querySelector(".entry-source").textContent = "From link · temporary";

      item.querySelector(".save-shared").hidden = false;
      item.querySelector(".dismiss-shared").hidden = false;

      item.querySelector(".edit-entry").hidden = true;
      item.querySelector(".delete-entry").hidden = true;
      item.querySelector(".select-entry").hidden = true;

      item.querySelector(".save-shared").addEventListener(
        "click", () => saveSharedEntry(entry.id)
      );
      item.querySelector(".dismiss-shared").addEventListener(
        "click", () => dismissSharedEntry(entry.id)
      );
    } else {
      const selector = item.querySelector(".entry-share-select");
      const checkbox = item.querySelector(".select-entry");

      selector.hidden = false;
      checkbox.checked = selectedEntryIds.has(entry.id);

      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedEntryIds.add(entry.id);
        } else {
          selectedEntryIds.delete(entry.id);
        }
        updateSelectionControls();
      });

      item.querySelector(".copy-share").hidden = true;

      item.querySelector(".edit-entry").addEventListener(
        "click", () => editEntry(entry.id)
      );
      item.querySelector(".delete-entry").addEventListener(
        "click", () => deleteEntry(entry.id)
      );
    }

    list.appendChild(item);
  });

  updateSelectionControls();
}

function updateSelectionControls() {
  const selectAll = $("select-all-entries");
  const copyButton = $("copy-selected-link");

  const selectedCount = selectedEntryIds.size;
  const totalCount = entries.length;

  selectAll.checked = totalCount > 0 && selectedCount === totalCount;
  selectAll.indeterminate = selectedCount > 0 && selectedCount < totalCount;

  copyButton.hidden = selectedCount === 0;
  copyButton.textContent = `Copy link (${selectedCount})`;
}

function render() {
  currentPage = 0;
  renderEveryversaries();
  renderEntries();
}

function showEditor(entry = null) {
  editor.hidden = false;
  $("editor-title").textContent = entry ? "Edit entry" : "Add an entry";
  $("save-entry").textContent = entry ? "Save changes" : "Add entry";
  $("entry-id").value = entry?.id || "";
  $("entry-name").value = entry?.name || "";
  $("entry-date").value = entry?.date || "";
  $("entry-time").value = entry?.time || "";
  $("entry-name").focus();
  editor.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function closeEditor() {
  editor.hidden = true;
  form.reset();
  $("entry-id").value = "";
}

function editEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (entry) showEditor(entry);
}

function deleteEntry(id) {
  const entry = entries.find(e => e.id === id);
  if (!entry || !confirm(`Delete "${entry.name}"?`)) return;
  entries = entries.filter(e => e.id !== id);
  persist();
  render();
  setStatus("Entry deleted.");
}

form.addEventListener("submit", event => {
  event.preventDefault();
  try {
    const name = $("entry-name").value.trim();
    if (!name) throw new Error("Please enter a name.");
    if (name.includes(SHARE_SEPARATOR)) {
      throw new Error(`Names cannot contain "${SHARE_SEPARATOR}".`);
    }
    const date = $("entry-date").value;
    const time = $("entry-time").value;
    const startMs = parseNaiveDate(date, time);
    const id = $("entry-id").value;
    if (id) {
      const index = entries.findIndex(e => e.id === id);
      if (index >= 0) entries[index] = { id, name, date, time, startMs };
    } else {
      entries.push({ id: makeId(), name, date, time, startMs });
    }
    persist();
    closeEditor();
    render();
    setStatus("Saved.");
  } catch (error) {
    alert(error.message);
  }
});

$("add-toggle").addEventListener("click", () => showEditor());
$("cancel-edit").addEventListener("click", closeEditor);
$("cancel-entry").addEventListener("click", closeEditor);


$("previous-page").addEventListener("click", () => {
  if (currentPage > 0) {
    currentPage--;
    renderEveryversaries();
  }
});

$("next-page").addEventListener("click", () => {
  const nameFilter = $("name-filter").value.trim().toLocaleLowerCase();
  const filteredCount = Everyversaries.filter(m =>
    !nameFilter || m.name.toLocaleLowerCase().includes(nameFilter)
  ).length;

  if ((currentPage + 1) * PAGE_SIZE < filteredCount) {
    currentPage++;
    renderEveryversaries();
  }
});

$("name-filter").addEventListener("input", () => {
  currentPage = 0;
  renderEveryversaries();
});
$("select-all-entries").addEventListener("change", event => {
  if (event.target.checked) {
    selectedEntryIds = new Set(entries.map(entry => entry.id));
  } else {
    selectedEntryIds.clear();
  }

  renderEntries();
});

$("copy-selected-link").addEventListener("click", () => {
  const selected = entries.filter(entry => selectedEntryIds.has(entry.id));
  if (selected.length) copyShareLink(selected);
});

function setStatus(message) {
  $("status").textContent = message;
  window.setTimeout(() => { if ($("status").textContent === message) $("status").textContent = ""; }, 3500);
}

/* Small RFC-4180-style CSV parser supporting quoted fields and escaped quotes. */
function parseCsv(text) {
  const matrix = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quoted) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); matrix.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  row.push(field);
  if (row.some(v => v !== "") || matrix.length === 0) matrix.push(row);
  return matrix;
}

function csvCell(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function importCsvText(text) {
  const matrix = parseCsv(
    text.replace(/^\uFEFF/, "").trim()
  );
  if (matrix.length < 2) throw new Error("The CSV has no data rows.");
  const headers = matrix[0].map(h => h.trim().toLowerCase());
  const nameIndex = headers.indexOf("name");
  const dateIndex = headers.indexOf("date");
  const timeIndex = headers.indexOf("time");
  if (nameIndex < 0 || dateIndex < 0) throw new Error("CSV needs at least 'name' and 'date' columns.");
  const imported = [];
  for (let i = 1; i < matrix.length; i++) {
    const record = matrix[i];
    if (record.every(v => !v.trim())) continue;
    const name = (record[nameIndex] || "").trim();
    if (name.includes(SHARE_SEPARATOR)) {
      throw new Error(`Name on CSV row ${i + 1} cannot contain "${SHARE_SEPARATOR}".`);
    }
    const date = (record[dateIndex] || "").trim();
    const time = timeIndex >= 0 ? (record[timeIndex] || "").trim() : "";
    if (!name || !date) throw new Error(`Missing name or date on CSV row ${i + 1}.`);
    imported.push({ id: makeId(), name, date, time, startMs: parseNaiveDate(date, time) });
  }
  if (!imported.length) throw new Error("No valid entries found.");
  const mode = confirm(`Imported ${imported.length} entr${imported.length === 1 ? "y" : "ies"}.\n\nOK = merge with existing entries\nCancel = replace existing entries`);
  entries = mode ? entries.concat(imported) : imported;
  persist();
  render();
  setStatus(`${imported.length} entries imported.`);
}

function exportCsv() {
  const lines = [["name", "date", "time"], ...entries.map(e => [e.name, e.date, e.time || ""])]
    .map(row => row.map(csvCell).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Everyversaries.csv";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("CSV exported.");
}

$("import-button").addEventListener("click", () => $("csv-file").click());
$("csv-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  try { importCsvText(await file.text()); }
  catch (error) { alert(`Import failed: ${error.message}`); }
  event.target.value = "";
});
$("export-button").addEventListener("click", exportCsv);

const dropZone = $("drop-zone");
dropZone.addEventListener("click", () => $("csv-file").click());
dropZone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("csv-file").click(); }
});
["dragenter", "dragover"].forEach(type => dropZone.addEventListener(type, event => {
  event.preventDefault();
  dropZone.classList.add("dragover");
}));
["dragleave", "drop"].forEach(type => dropZone.addEventListener(type, event => {
  event.preventDefault();
  dropZone.classList.remove("dragover");
}));
dropZone.addEventListener("drop", async event => {
  const file = [...event.dataTransfer.files].find(f => f.name.toLowerCase().endsWith(".csv") || f.type === "text/csv");
  if (!file) { alert("Please drop a CSV file."); return; }
  try { importCsvText(await file.text()); }
  catch (error) { alert(`Import failed: ${error.message}`); }
});

sharedEntries = getSharedEntriesFromUrl();
render();

// Keep the countdowns current without requiring a page reload.
window.setInterval(renderEveryversaries, 60 * 1000);
