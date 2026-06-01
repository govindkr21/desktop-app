# ⚡ Sarox Technology Inc.
### Desktop App — Electron + React + SQLite

---

## 📋 WHAT THIS APP DOES
- Records insulation test data from Megger MIT 525 (simulated for now)
- Records LCR multimeter measurements
- Stores everything in a local SQLite database
- Exports professional Excel and PDF reports

---

## ✅ STEP 1 — INSTALL NODE.JS
Download and install Node.js v18 or above from:
👉 https://nodejs.org

After install, open Command Prompt and verify:
```
node -v
npm -v
```
Both should show version numbers.

---

## ✅ STEP 2 — OPEN PROJECT IN TERMINAL
Extract the ZIP file to a folder, then open Command Prompt in that folder.

Or open VS Code → File → Open Folder → select the extracted folder
Then open the integrated terminal (Ctrl + `)

---

## ✅ STEP 3 — INSTALL DEPENDENCIES
Run this command (only needed once):
```
npm install
```
This will download all required packages. Takes 2-5 minutes.

If you see errors about better-sqlite3 or serialport, run:
```
npm install --save-dev @electron/rebuild
npx electron-rebuild
```

---

## ✅ STEP 4 — RUN THE APP
```
npm start
```
The Electron window should open with the full app running.

---

## ✅ STEP 5 — USE THE APP

1. Click "New Record" on the Start Screen
2. Fill in project details on the Information Tab
3. Go to Insulation Test Tab → click "Start Capture" to simulate Megger data
4. Go to Multimeter Tab → click any field to capture the live simulated value
5. Go to Report Tab → click "Export Excel" or "Export PDF"
6. The file saves to your Documents folder

---

## 📦 STEP 6 — BUILD THE .EXE INSTALLER

### For Windows .exe:
```
npm run make
```

The installer will be created at:
```
out/make/squirrel.windows/x64/ElectricalTestingSuiteSetup.exe
```

Double-click that .exe to install the app on any Windows machine.

### For portable ZIP (no install needed):
```
npm run package
```
Output will be at: `out/ElectricalTestingSuite-win32-x64/`

---

## 🗂️ PROJECT STRUCTURE

```
electrical-testing-suite/
├── src/
│   ├── main/
│   │   ├── index.js        ← Electron main process (entry point)
│   │   ├── preload.js      ← Secure bridge between main and UI
│   │   ├── database.js     ← SQLite database (all data storage)
│   │   ├── serial.js       ← USB serial port (Phase 5 — needs real devices)
│   │   └── reports.js      ← Excel and PDF export
│   │
│   └── renderer/
│       ├── index.html      ← HTML shell
│       ├── index.jsx       ← React entry point
│       ├── App.jsx         ← Root component (manages screens)
│       └── components/
│           ├── StartScreen.jsx     ← Home page
│           ├── InfoTab.jsx         ← Project information form
│           ├── InsulationTab.jsx   ← PI/DAR/SV tables + graph
│           ├── MultimeterTab.jsx   ← LCR measurement fields
│           └── ReportScreen.jsx    ← Report preview + export
│
├── package.json            ← All dependencies and build config
├── webpack.main.config.js  ← Webpack config for main process
├── webpack.renderer.config.js  ← Webpack config for React UI
└── .babelrc               ← Babel config for JSX
```

---

## 🔌 PHASE 5 — CONNECTING REAL DEVICES

When you have the physical devices and their manuals:

1. Open `src/main/serial.js`
2. Replace `COM3` with the actual Megger COM port
3. Replace `COM4` with the actual Multimeter COM port
4. Update the baud rate, parity, stop bits from the device manual
5. Update `parseMeggerLine()` with the actual data format
6. Update `buildCommand()` with actual multimeter commands

In `src/main/index.js`, uncomment:
```js
const serial = require('./serial');
serial.setWindow(mainWindow);
serial.connectMegger('COM3');   // ← actual port
```

In `InsulationTab.jsx`, replace the simulator interval with:
```js
api.onMeggerData((row) => {
  setTableData(prev => ({ ...prev, [activeTab]: [...prev[activeTab], row] }));
  api.saveInsulationRow(record.id, activeTab, row);
});
```

---

## ❗ COMMON ERRORS AND FIXES

| Error | Fix |
|-------|-----|
| `better-sqlite3` native build error | Run `npx electron-rebuild` |
| `serialport` build error | Run `npx electron-rebuild` |
| `npm start` shows blank screen | Check terminal for errors, restart with `npm start` |
| Excel export fails | Make sure `Documents` folder exists and is writable |
| App won't open | Check Node.js version: must be v18+ |

---

## 📞 TOOLS USED
- Electron v29 — desktop window
- React v18 — UI
- better-sqlite3 — local database
- Recharts — graphs
- ExcelJS — Excel export
- PDFKit — PDF export
- serialport — device communication (Phase 5)
- electron-forge — building and packaging

---

Built with ⚡ by Claude AI — Anthropic
