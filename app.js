/* Milestones — timezone-naive date/time arithmetic.
   Date's UTC getters/setters are used only as a timezone-neutral Gregorian
   arithmetic engine. No local timezone or UTC conversion is applied. */

"use strict";

const STORAGE_KEY = "milestones.entries.v1";
const MIN_HORIZON_MONTHS = 3;
const MAX_HORIZON_YEARS = 100;
const SECONDS_PER_DAY = 86400;

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
const rows = $("milestone-rows");
let entries = loadEntries();
let milestones = [];

function makeUtcDate(year, monthIndex, day, hour = 0, minute = 0, second = 0) {
  const d = new Date(0);
  d.setUTCHours(hour, minute, second, 0);
  d.setUTCFullYear(year, monthIndex, day);
  return d;
}

function parseNaiveDate(dateText, timeText = "") {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText || "");
  if (!dm) throw new Error("Date must use YYYY-MM-DD.");
  const tm = timeText ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeText) : ["", "0", "0", "0"];
  if (!tm) throw new Error("Time must use HH:MM or HH:MM:SS.");
  const [year, month, day] = dm.slice(1).map(Number);
  const [hour, minute, second] = tm.slice(1).map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) throw new Error("Invalid date or time.");
  const d = makeUtcDate(year, month - 1, day, hour, minute, second);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    throw new Error("That calendar date does not exist.");
  }
  return d.getTime();
}

function formatNaive(ms, includeSeconds = false) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}${includeSeconds ? ":" + pad(d.getUTCSeconds()) : ""}`;
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

function generateMilestones(nowMs) {
  const minMs = addCalendarMonths(nowMs, MIN_HORIZON_MONTHS);
  const maxMs = addCalendarYears(nowMs, MAX_HORIZON_YEARS);
  const maxSeconds = Math.floor((maxMs - nowMs) / 1000);
  const result = [];

  for (const entry of entries) {
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
        if (targetMs >= minMs && targetMs <= maxMs) {
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

function formatCountdown(deltaMs) {
  const totalSeconds = Math.max(0, Math.floor(deltaMs / 1000));
  const days = Math.floor(totalSeconds / SECONDS_PER_DAY);
  if (days >= 1) return `${days.toLocaleString("en-US")}d`;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours >= 1) return `${hours}h`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes >= 1) return `${minutes}m`;
  return `${totalSeconds}s`;
}

function renderMilestones() {
  const now = getNaiveNowMs(); // current local wall-clock fields, kept timezone-naive
  milestones = generateMilestones(now);
  const horizon = $("horizon").value;
  const nameFilter = $("name-filter").value.trim().toLocaleLowerCase();

  const visible = milestones.filter(m =>
    (horizon === "all" ||
     m.targetMs <= now + Number(horizon) * SECONDS_PER_DAY * 1000) &&
    (!nameFilter || m.name.toLocaleLowerCase().includes(nameFilter))
  );

  if (!visible.length) {
    rows.innerHTML = `<tr><td colspan="5" class="empty">${entries.length ? "No milestones in this time window." : "Add someone to see upcoming milestones."}</td></tr>`;
    return;
  }
  rows.innerHTML = visible.map(m => `
    <tr>
      <td>${formatNaive(m.targetMs, true)}</td>
      <td>${formatCountdown(m.targetMs - now)}</td>
      <td>${escapeHtml(m.name)}</td>
      <td class="milestone">${escapeHtml(m.label)}</td>
    </tr>`).join("");
}

function renderEntries() {
  $("entry-count").textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  const list = $("entry-list");
  list.innerHTML = "";
  for (const entry of entries) {
    const item = $("entry-template").content.firstElementChild.cloneNode(true);
    item.querySelector(".entry-person").textContent = entry.name;
    item.querySelector(".entry-start").textContent = formatNaive(entry.startMs, true);
    item.querySelector(".edit-entry").addEventListener("click", () => editEntry(entry.id));
    item.querySelector(".delete-entry").addEventListener("click", () => deleteEntry(entry.id));
    list.appendChild(item);
  }
}

function render() {
  renderMilestones();
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
$("horizon").addEventListener("change", renderMilestones);
$("name-filter").addEventListener("input", renderMilestones);

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
  a.download = "milestones.csv";
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

render();

// Keep the countdowns current without requiring a page reload.
window.setInterval(renderMilestones, 60 * 1000);
