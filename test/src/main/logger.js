const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let logFilePath = null;
let logStream = null;

function init() {
  try {
    const userDataPath = app.getPath('userData');
    const logsDir = path.join(userDataPath, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    logFilePath = path.join(logsDir, 'main.log');
    
    // Create write stream (append mode)
    logStream = fs.createWriteStream(logFilePath, { flags: 'a', encoding: 'utf8' });
    
    // Format helper
    const formatMessage = (level, args) => {
      const timestamp = new Date().toISOString();
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');
      return `[${timestamp}] [${level}] ${message}\n`;
    };

    // Override console.log
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog.apply(console, args);
      if (logStream) {
        logStream.write(formatMessage('INFO', args));
      }
    };

    // Override console.error
    const originalError = console.error;
    console.error = (...args) => {
      originalError.apply(console, args);
      if (logStream) {
        logStream.write(formatMessage('ERROR', args));
      }
    };

    // Override console.warn
    const originalWarn = console.warn;
    console.warn = (...args) => {
      originalWarn.apply(console, args);
      if (logStream) {
        logStream.write(formatMessage('WARN', args));
      }
    };

    console.log('Logger initialized successfully at:', logFilePath);
  } catch (err) {
    console.error('Failed to initialize logger:', err);
  }
}

function getLogPath() {
  return logFilePath;
}

module.exports = {
  init,
  getLogPath
};
