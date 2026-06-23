// ─────────────────────────────────────────────────────────────
// revert_winding_migration.js
// Run on terminal: node revert_winding_migration.js
//
// WHAT THIS DOES:
//   Reverts the migration that created the "_120Hz" and "_10kHz" sweep keys
//   in the multimeter test records. Since the original keys (without the suffix)
//   were kept in place during the migration, reverting is a clean process of
//   removing the added sweep keys.
// ─────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Locate the data file ──────────────────────────────────────
const APP_DATA = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const DATA_FILE = 'testing_records_v1.json';

const CANDIDATE_PATHS = [
  path.join(APP_DATA, 'Sarox Technology Inc.', DATA_FILE),
  path.join(APP_DATA, 'ElectricalTestingSuite',  DATA_FILE),
  path.join(APP_DATA, 'electrical-testing-suite', DATA_FILE),
  path.join(APP_DATA, 'Electrical Testing Suite', DATA_FILE),
  path.join(APP_DATA, 'sarox-technology-inc',     DATA_FILE),
  path.join(APP_DATA, 'Electron',                  DATA_FILE),
];

const RES_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
const IND_KEYS = ['1-2', '1-3', '2-3', '1-N', '2-N', '3-N'];
const WINDINGS = ['stator', 'rotor'];
const SUFFIXES = ['_120Hz', '_10kHz'];

function revertRecord(mm) {
  let changes = 0;

  for (const winding of WINDINGS) {
    for (const type of ['res', 'ind']) {
      const keys = type === 'res' ? RES_KEYS : IND_KEYS;

      for (const k of keys) {
        const fKey = `${winding}_${type}_${k}`; // e.g. stator_res_1-2
        
        for (const suffix of SUFFIXES) {
          const sweepKey = `${fKey}${suffix}`; // e.g. stator_res_1-2_120Hz
          if (mm[sweepKey] !== undefined) {
            delete mm[sweepKey];
            changes++;
            console.log(`  - Removed migrated key: ${sweepKey}`);
          }
        }
      }
    }
  }

  return changes;
}

function main() {
  console.log('');
  console.log('=== Winding Data Revert Migration Script ===');
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
    console.error('ERROR: Could not find testing_records_v1.json in any standard locations.');
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
  const backupPath = dataPath + '.pre-revert-' + Date.now() + '.bak';
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
    console.log('No multimeter data found. Nothing to revert.');
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
    const changes = revertRecord(mm);
    if (changes > 0) {
      recordsChanged++;
      totalChanges += changes;
      console.log(`  → ${changes} field(s) reverted.`);
    } else {
      console.log('  → Nothing to revert.');
    }
    console.log('');
  }

  if (totalChanges === 0) {
    console.log('No migrated fields found. Nothing to revert.');
    process.exit(0);
  }

  // ── Save ──────────────────────────────────────────────────
  const tmpPath = dataPath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, dataPath);

  console.log('═══════════════════════════════════════');
  console.log(`Reversion complete.`);
  console.log(`  Records modified : ${recordsChanged}`);
  console.log(`  Fields reverted  : ${totalChanges}`);
  console.log(`  Backup saved at  : ${backupPath}`);
  console.log('');
}

main();
