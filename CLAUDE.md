# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

This is a zero-build, static web app. Serve the `palantir-dashboard/` directory with any HTTP server:

```bash
python -m http.server 8000
# or
npx http-server palantir-dashboard/
```

Then open `http://localhost:8000` in a browser.

## Architecture

The app is a React SPA that runs without a build step — Babel transpiles JSX in-browser via CDN.

**Data flow:**
1. `index.html` loads CDN scripts (React 18, Recharts, Babel standalone) and defines global styles
2. `data.js` populates `window.CONTRACTS` (50+ contract records) and `window.COLORS`
3. `palantir-docs.js` populates `window.PALANTIR_OFFICIAL_DOCS` (earnings reports, SEC filings, letters)
4. `app.jsx` consumes those globals as a single large React component

**app.jsx structure:**
- All UI lives in one file (~78 KB) with multiple tab views: Overview, Explorer, By Country, Timeline, Deal Flow, Run Rate, PLTR Docs, Sources
- State is managed with `useState`/`useMemo`/`useCallback` hooks (no Redux or external state library)
- Filtering, sorting, and search are all client-side
- Charts use Recharts (Bar, Pie, Area)
- Styling is done entirely with inline styles referencing the `COLORS` object from `data.js`

**No backend, no API calls, no npm dependencies.** All data is embedded in the JS files.
