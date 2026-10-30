# Milestones

A tiny, static anniversary calculator. It runs entirely in the browser and can be hosted with GitHub Pages.

## Features

- Add, edit and delete named dates, with optional time.
- Import CSV by file picker or drag-and-drop; export CSV.
- Stores entries in browser `localStorage`.
- Generates upcoming milestones from a curated sequence of nice numbers, across seconds, minutes, hours, days, weeks, calendar months and calendar years.
- Shows milestones from three calendar months ahead through 100 calendar years ahead.
- Sorts all people's milestones together by date.
- No backend, build step, framework, external dependency, analytics or cookies.

## Run locally

Open `index.html` in a modern browser. No server or build process is required.

## Publish with GitHub Pages

1. Create a GitHub repository, for example `milestones`.
2. Add `index.html`, `style.css`, `app.js` and this README to the repository root.
3. Push to GitHub.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select your default branch (usually `main`) and folder `/ (root)`, then save.
7. Wait for GitHub Pages to publish the site. The Pages settings screen will show its URL.

Every update is just a normal Git commit and push.

## CSV format

UTF-8 CSV with a header row:

```csv
name,date,time
Alice,2020-01-15,
Bob,2018-06-23,14:30
"Charlie, Jr.",1990-12-01,09:15:30
```

`name` and `date` are required. `time` is optional and accepts `HH:MM` or `HH:MM:SS`. Dates use `YYYY-MM-DD`. A date without a time is treated as midnight. On import, confirm **OK** to merge or **Cancel** to replace the current entries.

## Date/time semantics

All entered values are timezone-naive. The app does not attach a timezone, convert between timezones, or apply daylight-saving rules.

Fixed units (seconds through weeks) are elapsed durations. Months and years use calendar arithmetic. If the target day does not exist in the destination month, it is clamped to that month's final day (for example, one calendar month after January 31 is the final day of February).

The current clock is read from the browser and treated as a naive date/time. JavaScript UTC date getters/setters are used internally only as a stable Gregorian calendar arithmetic mechanism; no timezone conversion is performed.

## Adjusting the "nice numbers"

Edit `NICE_SIGNIFICANDS` near the top of `app.js`. Each value is scaled by powers of ten, and the resulting integer values form the nice-number sequence. A small explicit list adds familiar values such as 11, 22, 33, 111, 123, 666 and 1,234.

The generated number range is bounded by the number of seconds between now and 100 calendar years from now. The milestone date itself is separately filtered to the same 100-year horizon.
