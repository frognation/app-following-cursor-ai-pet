const { app, BrowserWindow, ipcMain, globalShortcut, screen, Menu } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let settingsWindow;

// ===== Single Instance Lock =====
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ===== Dual Monitor: track current display and move window =====
let currentDisplay = null;

function moveWindowToDisplay(display) {
  if (!mainWindow || currentDisplay === display.id) return;
  currentDisplay = display.id;
  const { width, height } = display.workAreaSize;
  const { x, y } = display.workArea;
  mainWindow.setBounds({ x, y, width, height });
}

function getDisplayForCursor() {
  const cursor = screen.getCursorScreenPoint();
  return screen.getDisplayNearestPoint(cursor);
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  currentDisplay = primaryDisplay.id;

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

  // Uncomment to debug:
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  // Keep window level above everything
  mainWindow.setAlwaysOnTop(true, 'floating', 1);

  // Poll cursor position to move window across monitors
  setInterval(() => {
    if (!mainWindow) return;
    const display = getDisplayForCursor();
    if (display.id !== currentDisplay) {
      moveWindowToDisplay(display);
      mainWindow.webContents.send('displays-changed', {
        bounds: display.workArea,
        displays: screen.getAllDisplays().map(d => d.workArea),
      });
    }
  }, 500);

  // Debug: log window bounds
  console.log('[Wooni] Window created:', width, 'x', height);
}

// ===== IPC: Toggle mouse events =====
ipcMain.on('set-ignore-mouse', (event, ignore) => {
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

// ===== IPC: Get cursor position =====
ipcMain.handle('get-cursor-position', () => {
  return screen.getCursorScreenPoint();
});

// ===== IPC: Get display bounds (for dual monitor support) =====
ipcMain.handle('get-display-bounds', () => {
  const display = getDisplayForCursor();
  return {
    bounds: display.workArea,
    displays: screen.getAllDisplays().map(d => d.workArea),
    primary: screen.getPrimaryDisplay().workArea,
  };
});

// ===== IPC: Show context menu (right-click) =====
ipcMain.on('show-context-menu', (event, menuData) => {
  const template = [
    {
      label: menuData.settingsLabel || 'Settings',
      click: () => { openSettingsWindow(); },
    },
    {
      label: menuData.usageEnabled
        ? (menuData.hideUsageLabel || 'Hide AI usage')
        : (menuData.showUsageLabel || 'Show AI usage'),
      click: () => { mainWindow.webContents.send('pet-action', 'toggle-usage'); },
    },
    { type: 'separator' },
    {
      label: menuData.danceLabel || 'Dance!',
      click: () => { mainWindow.webContents.send('pet-action', 'dance'); },
    },
    {
      label: menuData.sleepLabel || 'Sleep',
      click: () => { mainWindow.webContents.send('pet-action', 'sleep'); },
    },
    {
      label: menuData.wakeLabel || 'Wake up',
      click: () => { mainWindow.webContents.send('pet-action', 'wake'); },
    },
    { type: 'separator' },
  ];

  // Cat house: Send home / Let out
  if (menuData.isInHouse) {
    template.push({
      label: menuData.letOutLabel || 'Let out',
      click: () => { mainWindow.webContents.send('pet-action', 'let-out'); },
    });
  } else {
    template.push({
      label: menuData.sendHomeLabel || 'Send home',
      click: () => { mainWindow.webContents.send('pet-action', 'send-home'); },
    });
  }

  // Free roam toggle
  template.push({
    label: menuData.isRoaming
      ? (menuData.stopRoamLabel || 'Stop roaming')
      : (menuData.roamLabel || 'Free roam'),
    click: () => { mainWindow.webContents.send('pet-action', 'roam'); },
  });

  template.push({ type: 'separator' });
  template.push({
    label: 'Quit Wooni',
    click: () => {
      app.isQuitting = true;
      app.quit();
    },
  });

  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

// ===== IPC: Ask Claude Code CLI =====
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

    setTimeout(() => {
      claude.kill();
      resolve(output.trim() || 'Request timed out after 60 seconds.');
    }, 60000);
  });
});

// ===== IPC: Open new Claude Code session with context =====
ipcMain.handle('open-claude-session', async (event, context) => {
  return new Promise((resolve) => {
    // Open a new terminal window with claude and the context
    const escaped = context.replace(/'/g, "'\\''");
    const cmd = process.platform === 'darwin'
      ? `osascript -e 'tell application "Terminal" to do script "claude -p '"'"'${escaped}'"'"'"'`
      : `x-terminal-emulator -e claude -p '${escaped}'`;

    const child = spawn('sh', ['-c', cmd], { env: { ...process.env } });
    child.on('close', () => resolve(true));
    child.on('error', () => resolve(false));
  });
});

// ===== IPC: Copy to clipboard =====
ipcMain.on('copy-to-clipboard', (event, text) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
});

// ===== IPC: Settings =====
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'wooni-settings.json');
}

ipcMain.handle('get-settings', () => {
  try {
    const data = fs.readFileSync(getSettingsPath(), 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null;
  }
});

ipcMain.handle('save-settings', (event, settings) => {
  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2));
    // Notify main window of settings change
    if (mainWindow) {
      mainWindow.webContents.send('settings-changed', settings);
    }
    return true;
  } catch (e) {
    return false;
  }
});

// ===== IPC: Open settings window =====
function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 450,
    height: 650,
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
}

ipcMain.on('open-settings', () => {
  openSettingsWindow();
});

// ===== Paid AI CLI Usage =====
// Usage is read through each vendor's own CLI. Wooni never reads auth files or
// Keychain credentials directly.
const AI_USAGE_CACHE_MS = 45000;
const aiUsageCache = new Map();
const aiUsagePending = new Map();
const resolvedBinaries = new Map();

function resolveCliBinary(name) {
  if (!['claude', 'codex', 'node'].includes(name)) return null;
  if (resolvedBinaries.has(name)) return resolvedBinaries.get(name);

  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', name),
    path.join(home, '.claude', 'local', name),
    path.join(home, '.npm-global', 'bin', name),
    path.join('/opt/homebrew/bin', name),
    path.join('/usr/local/bin', name),
  ];

  const pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const dir of pathDirs) candidates.push(path.join(dir, name));

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      resolvedBinaries.set(name, candidate);
      return candidate;
    } catch (e) {}
  }

  // Apps opened from Finder often receive a minimal PATH. Ask the login shell
  // as a final fallback so fnm/nvm/Homebrew installs can still be discovered.
  try {
    const result = spawnSync('/bin/zsh', ['-lic', `command -v ${name}`], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const resolved = (result.stdout || '').trim().split('\n').pop();
    if (resolved) {
      fs.accessSync(resolved, fs.constants.X_OK);
      resolvedBinaries.set(name, resolved);
      return resolved;
    }
  } catch (e) {}

  resolvedBinaries.set(name, null);
  return null;
}

function getCliEnvironment(binary) {
  const nodeBinary = resolveCliBinary('node');
  const pathEntries = [
    path.dirname(binary),
    nodeBinary ? path.dirname(nodeBinary) : null,
    process.env.PATH,
  ].filter(Boolean);
  return { ...process.env, PATH: pathEntries.join(path.delimiter) };
}

function runCommand(binary, args, timeoutMs) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(binary, args, {
      env: getCliEnvironment(binary),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    child.stdout.on('data', (data) => {
      if (stdout.length < 1024 * 1024) stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      if (stderr.length < 256 * 1024) stderr += data.toString();
    });
    child.on('error', (error) => finish({ code: -1, stdout, stderr, error }));
    child.on('close', (code) => finish({ code, stdout, stderr }));

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ code: -1, stdout, stderr, timedOut: true });
    }, timeoutMs);
  });
}

function parseClaudeResetTime(text) {
  if (!text) return null;
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const match = text.match(/(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+at\s+)?(\d{1,2}):(\d{2})(am|pm)/i);
  if (!match) return null;

  const now = new Date();
  const month = match[1] ? months[match[1].toLowerCase()] : now.getMonth();
  const day = match[2] ? Number(match[2]) : now.getDate();
  let hour = Number(match[3]) % 12;
  if (match[5].toLowerCase() === 'pm') hour += 12;

  const reset = new Date(now.getFullYear(), month, day, hour, Number(match[4]), 0, 0);
  if (reset.getTime() < now.getTime() - 24 * 60 * 60 * 1000) {
    reset.setFullYear(reset.getFullYear() + 1);
  }
  return Math.floor(reset.getTime() / 1000);
}

async function fetchClaudeUsage() {
  const binary = resolveCliBinary('claude');
  if (!binary) return { available: false, reason: 'cli_not_found', windows: [] };

  const result = await runCommand(
    binary,
    ['-p', '/usage', '--safe-mode', '--output-format', 'text'],
    12000,
  );
  if (result.code !== 0) {
    return {
      available: false,
      reason: result.timedOut ? 'timeout' : 'cli_error',
      windows: [],
    };
  }

  const session = result.stdout.match(/Current session:\s*(\d+(?:\.\d+)?)%\s*used\s*[·-]\s*resets\s+([^\r\n]+)/i);
  const weekly = result.stdout.match(/Current week\s*\(all models\):\s*(\d+(?:\.\d+)?)%\s*used\s*[·-]\s*resets\s+([^\r\n]+)/i);
  const windows = [];

  if (session) {
    windows.push({
      label: '5h',
      usedPercent: Number(session[1]),
      resetsAt: parseClaudeResetTime(session[2]),
      resetText: session[2].trim(),
    });
  }
  if (weekly) {
    windows.push({
      label: '7d',
      usedPercent: Number(weekly[1]),
      resetsAt: parseClaudeResetTime(weekly[2]),
      resetText: weekly[2].trim(),
    });
  }

  return {
    available: windows.length > 0,
    reason: windows.length > 0 ? null : 'usage_unavailable',
    windows,
  };
}

function codexWindowLabel(minutes) {
  if (minutes === 300) return '5h';
  if (minutes === 10080) return '7d';
  if (!Number.isFinite(minutes)) return 'limit';
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

async function fetchCodexUsage() {
  const binary = resolveCliBinary('codex');
  if (!binary) return { available: false, reason: 'cli_not_found', windows: [] };

  return new Promise((resolve) => {
    const child = spawn(binary, ['app-server', '--stdio'], {
      env: getCliEnvironment(binary),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let settled = false;
    let initialized = false;

    const finish = (data) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve(data);
    };

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        let message;
        try {
          message = JSON.parse(line);
        } catch (e) {
          continue;
        }

        if (message.id === 1 && !initialized) {
          initialized = true;
          child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
          child.stdin.write(`${JSON.stringify({ method: 'account/rateLimits/read', id: 2, params: {} })}\n`);
        }

        if (message.id === 2) {
          if (message.error || !message.result?.rateLimits) {
            finish({ available: false, reason: 'usage_unavailable', windows: [] });
            return;
          }

          const limits = message.result.rateLimits;
          const windows = [limits.primary, limits.secondary]
            .filter(Boolean)
            .map((window) => ({
              label: codexWindowLabel(window.windowDurationMins),
              usedPercent: Number(window.usedPercent),
              resetsAt: window.resetsAt || null,
            }));

          finish({
            available: windows.length > 0,
            reason: windows.length > 0 ? null : 'usage_unavailable',
            windows,
            planType: limits.planType || null,
          });
          return;
        }
      }
    });

    child.on('error', () => finish({ available: false, reason: 'cli_error', windows: [] }));
    child.on('close', () => {
      if (!settled) finish({ available: false, reason: 'cli_error', windows: [] });
    });

    child.stdin.write(`${JSON.stringify({
      method: 'initialize',
      id: 1,
      params: {
        clientInfo: { name: 'wooni-pet', title: 'Wooni Pet', version: '1.0.0' },
        capabilities: {},
      },
    })}\n`);

    const timer = setTimeout(() => {
      finish({ available: false, reason: 'timeout', windows: [] });
    }, 10000);
  });
}

async function getProviderUsage(provider, force) {
  const cached = aiUsageCache.get(provider);
  if (!force && cached && Date.now() - cached.fetchedAt < AI_USAGE_CACHE_MS) {
    return cached.data;
  }
  if (aiUsagePending.has(provider)) return aiUsagePending.get(provider);

  const fetcher = provider === 'claude' ? fetchClaudeUsage : fetchCodexUsage;
  const pending = fetcher()
    .then((data) => {
      aiUsageCache.set(provider, { fetchedAt: Date.now(), data });
      return data;
    })
    .finally(() => aiUsagePending.delete(provider));
  aiUsagePending.set(provider, pending);
  return pending;
}

ipcMain.handle('get-ai-usage', async (event, options = {}) => {
  const allowed = ['claude', 'codex'];
  const requested = Array.isArray(options.providers)
    ? options.providers.filter((provider) => allowed.includes(provider))
    : allowed;
  const entries = await Promise.all(
    requested.map(async (provider) => [provider, await getProviderUsage(provider, Boolean(options.force))]),
  );
  return { providers: Object.fromEntries(entries), fetchedAt: Date.now() };
});

// ===== Claude Code Session Monitor =====
let sessionMonitorInterval = null;
let lastKnownSessionContent = '';

function getClaudeProjectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

function findRecentSessionFiles() {
  const projectsDir = getClaudeProjectsDir();
  if (!fs.existsSync(projectsDir)) return [];

  const files = [];
  try {
    const dirs = fs.readdirSync(projectsDir);
    for (const dir of dirs) {
      const dirPath = path.join(projectsDir, dir);
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) continue;

      const jsonlFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      for (const f of jsonlFiles) {
        const filePath = path.join(dirPath, f);
        const fstat = fs.statSync(filePath);
        // Only files modified in the last hour
        if (Date.now() - fstat.mtimeMs < 3600000) {
          files.push({ path: filePath, mtime: fstat.mtimeMs });
        }
      }
    }
  } catch (e) {}

  return files.sort((a, b) => b.mtime - a.mtime);
}

function getLastAssistantMessage(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');
    // Read from the end to find the last assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.role === 'assistant' && entry.content) {
          // Extract text content
          if (typeof entry.content === 'string') return entry.content;
          if (Array.isArray(entry.content)) {
            const textBlocks = entry.content.filter(b => b.type === 'text');
            if (textBlocks.length > 0) return textBlocks.map(b => b.text).join('\n');
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}

function startSessionMonitor() {
  if (sessionMonitorInterval) return;

  sessionMonitorInterval = setInterval(() => {
    const files = findRecentSessionFiles();
    if (files.length === 0) return;

    const mostRecent = files[0];
    const lastMsg = getLastAssistantMessage(mostRecent.path);

    if (lastMsg && lastMsg !== lastKnownSessionContent) {
      const oldContent = lastKnownSessionContent;
      lastKnownSessionContent = lastMsg;

      // Only notify if there was previous content (not first load)
      if (oldContent) {
        // Summarize - take first 200 chars
        const summary = lastMsg.length > 200 ? lastMsg.substring(0, 200) + '...' : lastMsg;

        // Detect completion patterns
        const isComplete = /(?:done|complete|finished|succeed|✅|implemented|created|fixed)/i.test(lastMsg);

        mainWindow.webContents.send('session-update', {
          message: summary,
          isComplete,
          fullMessage: lastMsg,
        });
      }
    }
  }, 5000); // Check every 5 seconds
}

function stopSessionMonitor() {
  if (sessionMonitorInterval) {
    clearInterval(sessionMonitorInterval);
    sessionMonitorInterval = null;
  }
}

ipcMain.on('start-session-monitor', () => {
  startSessionMonitor();
});

ipcMain.on('stop-session-monitor', () => {
  stopSessionMonitor();
});

// ===== App Lifecycle =====
app.whenReady().then(() => {
  createWindow();

  // Global shortcut: Cmd+Shift+U to activate voice
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    mainWindow.webContents.send('activate-voice');
  });

  app.on('activate', () => {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopSessionMonitor();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
