const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let settingsWindow;

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Make window click-through by default, but forward mouse events
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  // Prevent the window from being closed by Cmd+W
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Keep window level above everything
  mainWindow.setAlwaysOnTop(true, 'floating', 1);
}

// IPC: Toggle mouse events (clickable vs pass-through)
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// IPC: Get cursor position (from main process for accuracy)
ipcMain.handle('get-cursor-position', () => {
  return screen.getCursorScreenPoint();
});

// IPC: Ask Claude Code CLI
ipcMain.handle('ask-claude', async (event, question) => {
  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';

    const claude = spawn('claude', ['-p', question], {
      env: { ...process.env },
      shell: true,
    });

    claude.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      // Stream chunks to renderer
      mainWindow.webContents.send('claude-stream', chunk);
    });

    claude.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    claude.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        resolve(errorOutput || `Claude exited with code ${code}`);
      }
    });

    claude.on('error', (err) => {
      resolve(`Could not run Claude Code CLI: ${err.message}\nMake sure 'claude' is installed and in your PATH.`);
    });

    // Timeout after 60 seconds
    setTimeout(() => {
      claude.kill();
      resolve(output.trim() || 'Request timed out after 60 seconds.');
    }, 60000);
  });
});

// IPC: Open settings window
ipcMain.on('open-settings', () => {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 500,
    resizable: false,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
});

app.whenReady().then(() => {
  createWindow();

  // Global shortcut: Cmd+Shift+U to activate voice
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    mainWindow.webContents.send('activate-voice');
  });

  // Tray or dock behavior
  app.on('activate', () => {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
