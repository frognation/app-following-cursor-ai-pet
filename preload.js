const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Mouse event control
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', ignore),

  // Cursor position
  getCursorPosition: () => ipcRenderer.invoke('get-cursor-position'),

  // Claude Code CLI
  askClaude: (question) => ipcRenderer.invoke('ask-claude', question),
  onClaudeStream: (callback) => {
    ipcRenderer.on('claude-stream', (event, chunk) => callback(chunk));
  },

  // Voice activation via shortcut
  onActivateVoice: (callback) => {
    ipcRenderer.on('activate-voice', () => callback());
  },

  // Settings
  openSettings: () => ipcRenderer.send('open-settings'),
});
