// ─────────────────────────────────────────────────────────────
// migrate_winding_data.js
// Run on client terminal: node migrate_winding_data.js
//
// WHAT THIS DOES:
//   The old UI had two fields per phase row:
//     1. A main value input  → stored as  multimeter[recordId][field].value
//        e.g. field = "stator_res_1-2"  → value = 12.306   (measured at groupFreq, e.g. 120Hz)
//     2. A per-phase "Freq" input → stored as  multimeter[recordId][field].frequency
//        e.g. field = "stator_res_1-2_freq"  → frequency = "60.06"
//        BUT the user entered a MEASUREMENT VALUE there (at 10kHz), not a real frequency string.
//
//   The new UI uses a multi-frequency sweep grid with keys like:
//        "stator_res_1-2_120Hz"  = measurement at 120Hz
//        "stator_res_1-2_10kHz"  = measurement at 10kHz
//        "stator_ind_1-2_120Hz"  = inductance at 120Hz
//        "stator_ind_1-2_10kHz"  = inductance at 10kHz
//
//   MIGRATION RULES applied per record:
//     Rule 1: If  multimeter[id]["stator_res_1-2"].value  exists
//             AND multimeter[id]["stator_res_1-2_120Hz"]  does NOT exist
//             → copy value → "stator_res_1-2_120Hz"
//             (same for all RES_KEYS and IND_KEYS, for both stator_ and rotor_)
//
//     Rule 2: If  multimeter[id]["stator_res_1-2_freq"].frequency  exists
//             AND it is a NUMBER (not a frequency string like "1kHz")
//             AND multimeter[id]["stator_res_1-2_10kHz"]  does NOT exist
//             → copy that numeric value → "stator_res_1-2_10kHz"
//             (same for all RES_KEYS and IND_KEYS)
//
//   After migration:
//     - Old keys are KEPT (not deleted) so there is no data loss.
//     - A backup of the original file is created before any changes.
// ─────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Locate the data file ──────────────────────────────────────
const APP_DATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const DATA_FILE = 'testing_records_v1.json';

// Candidate locations the Electron app may have used (mirrors database.js)
const CANDIDATE_PATHS = [
  path.join(APP_DATA, 'Sarox Technology Inc.', DATA_FILE),
  path.join(APP_DATA, 'ElectricalTestingSuite',  DATA_FILE),
  path.join(APP_DATA, 'electrical-testing-suite', DATA_FILE),
  path.join(APP_DATA, 'Electrical Testing Suite', DATA_FILE),
  path.join(APP_DATA, 'sarox-technology-inc',     DATA_FILE),
  path.join(APP_DATA, 'Electron',                  DATA_FILE),
];

// ── Field configuration ───────────────────────────────────────
const RES_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
const IND_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
const WINDINGS = ['stator', 'rotor'];

// The main value was captured at the group's freq header (120Hz by default).
// Change this if you know the client used a different group frequency.
const PRIMARY_FREQ_COLUMN = '120Hz';

// The per-phase "Freq" field was used to store measurements at this frequency.
const SECONDARY_FREQ_COLUMN = '10kHz';

// ── Helpers ───────────────────────────────────────────────────
function isNumericValue(v) {
  if (v === undefined || v === null || v === '') return false;
  return !isNaN(parseFloat(String(v))) && isFinite(String(v));
}

function migrateRecord(mm) {
  let changes = 0;

  for (const winding of WINDINGS) {
    for (const type of ['res', 'ind']) {
      const keys = type === 'res' ? RES_KEYS : IND_KEYS;

      for (const k of keys) {
        const fKey        = `${winding}_${type}_${k}`;          // e.g. stator_res_1-2
        const phaseFreqKey = `${fKey}_freq`;                     // e.g. stator_res_1-2_freq
        const primaryKey   = `${fKey}_${PRIMARY_FREQ_COLUMN}`;  // e.g. stator_res_1-2_120Hz
        const secondaryKey = `${fKey}_${SECONDARY_FREQ_COLUMN}`; // e.g. stator_res_1-2_10kHz

        // ── Rule 1: main value → primary freq column ──────────
        const mainEntry = mm[fKey];
        const mainVal   = mainEntry && mainEntry.value !== undefined && mainEntry.value !== null
                          ? mainEntry.value : undefined;

        if (mainVal !== undefined && !mm[primaryKey]) {
          mm[primaryKey] = {
            value:       mainVal,
            temperature: mainEntry.temperature || 0,
            frequency:   PRIMARY_FREQ_COLUMN,
          };
          changes++;
          console.log(`  + Migrated ${fKey}.value (${mainVal}) → ${primaryKey}`);
        }

        // ── Rule 2: per-phase freq value → secondary freq column
        const freqEntry    = mm[phaseFreqKey];
        const storedFreqVal = freqEntry && freqEntry.frequency;

        if (isNumericValue(storedFreqVal) && !mm[secondaryKey]) {
          mm[secondaryKey] = {
            value:       parseFloat(storedFreqVal),
            temperature: freqEntry.temperature || (mainEntry && mainEntry.temperature) || 0,
            frequency:   SECONDARY_FREQ_COLUMN,
          };
          changes++;
          console.log(`  + Migrated ${phaseFreqKey}.frequency (${storedFreqVal}) → ${secondaryKey}`);
        }
      }
    }
  }

  return changes;
}

// ── Main ──────────────────────────────────────────────────────
function main() {
  console.log('');
  console.log('=== Winding Data Migration Script ===');
  console.log('');

  // Find the data file
  let dataPath = null;
  for (const p of CANDIDATE_PATHS) {
    if (fs.existsSync(p)) {
      dataPath = p;
      break;
    }
  }

  if (!dataPath) {
    console.error('ERROR: Could not find testing_records_v1.json in any of these locations:');
    CANDIDATE_PATHS.forEach(p => console.error('  -', p));
    console.error('');
    console.error('If the file is somewhere else, pass the path as an argument:');
    console.error('  node migrate_winding_data.js "C:\\path\\to\\testing_records_v1.json"');
    process.exit(1);
  }

  // Allow override via command-line argument
  if (process.argv[2]) {
    dataPath = process.argv[2];
    if (!fs.existsSync(dataPath)) {
      console.error('ERROR: File not found:', dataPath);
      process.exit(1);
    }
  }

  console.log('Data file found:', dataPath);

  // ── Backup ────────────────────────────────────────────────
  const backupPath = dataPath + '.pre-migration-' + Date.now() + '.bak';
  fs.copyFileSync(dataPath, backupPath);
  console.log('Backup created:', backupPath);
  console.log('');

  // ── Load ──────────────────────────────────────────────────
  let db;
  try {
    db = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    console.error('ERROR: Could not parse JSON file:', err.message);
    process.exit(1);
  }

  if (!db.multimeter) {
    console.log('No multimeter data found. Nothing to migrate.');
    process.exit(0);
  }

  const recordIds = Object.keys(db.multimeter);
  console.log(`Found ${recordIds.length} record(s) with multimeter data.`);
  console.log('');

  let totalChanges = 0;
  let recordsChanged = 0;

  for (const id of recordIds) {
    const mm = db.multimeter[id];
    console.log(`Record ID: ${id}`);
    const changes = migrateRecord(mm);
    if (changes > 0) {
      recordsChanged++;
      totalChanges += changes;
      console.log(`  → ${changes} field(s) migrated.`);
    } else {
      console.log('  → Nothing to migrate (already up-to-date or no data).');
    }
    console.log('');
  }

  if (totalChanges === 0) {
    console.log('No changes needed. All records are already in the new format.');
    process.exit(0);
  }

  // ── Save ──────────────────────────────────────────────────
  const tmpPath = dataPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, dataPath);

  console.log('═══════════════════════════════════════');
  console.log(`Migration complete.`);
  console.log(`  Records modified : ${recordsChanged}`);
  console.log(`  Fields migrated  : ${totalChanges}`);
  console.log(`  Backup saved at  : ${backupPath}`);
  console.log('');
  console.log('Old keys were KEPT — no data was deleted.');
  console.log('You can safely delete the .bak file once you verify the app.');
}

main();
