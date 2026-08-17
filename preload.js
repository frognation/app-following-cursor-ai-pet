const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Mouse event control
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),

  // Cursor position
  getCursorPosition: () => ipcRenderer.invoke('get-cursor-position'),

  // Display bounds (dual monitor)
  getDisplayBounds: () => ipcRenderer.invoke('get-display-bounds'),
  onDisplaysChanged: (callback) => {
    ipcRenderer.on('displays-changed', (event, data) => callback(data));
  },

  // Claude Code CLI
  askClaude: (question) => ipcRenderer.invoke('ask-claude', question),
  onClaudeStream: (callback) => {
    ipcRenderer.on('claude-stream', (event, chunk) => callback(chunk));
  },

  // Open new Claude Code session with context
  openClaudeSession: (context) => ipcRenderer.invoke('open-claude-session', context),

  // Clipboard
  copyToClipboard: (text) => ipcRenderer.send('copy-to-clipboard', text),

  // Voice activation via shortcut
  onActivateVoice: (callback) => {
    ipcRenderer.on('activate-voice', () => callback());
  },

  // Context menu (right-click)
  showContextMenu: (menuData) => ipcRenderer.send('show-context-menu', menuData),

  // Pet actions from context menu
  onPetAction: (callback) => {
    ipcRenderer.on('pet-action', (event, action) => callback(action));
  },

  // Settings
  openSettings: () => ipcRenderer.send('open-settings'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  onSettingsChanged: (callback) => {
    ipcRenderer.on('settings-changed', (event, settings) => callback(settings));
  },

  // Paid AI CLI usage
  getAiUsage: (options) => ipcRenderer.invoke('get-ai-usage', options),

  // Session monitoring
  startSessionMonitor: () => ipcRenderer.send('start-session-monitor'),
  stopSessionMonitor: () => ipcRenderer.send('stop-session-monitor'),
  onSessionUpdate: (callback) => {
    ipcRenderer.on('session-update', (event, data) => callback(data));
  },
});
