// ===== Claude Code Session Monitor + TTS + Floating Notifications =====

let ttsEnabled = false;
let ttsVolume = 0.8;
let ttsMuted = false;
let monitorEnabled = false;
let monitorNotifyProgress = true;
let monitorNotifyComplete = true;

// Load settings
try {
  const saved = localStorage.getItem('wooni-settings');
  if (saved) {
    const s = JSON.parse(saved);
    if (s.ttsEnabled !== undefined) ttsEnabled = s.ttsEnabled;
    if (s.ttsVolume !== undefined) ttsVolume = s.ttsVolume;
    if (s.ttsMuted !== undefined) ttsMuted = s.ttsMuted;
    if (s.monitorEnabled !== undefined) monitorEnabled = s.monitorEnabled;
    if (s.monitorNotifyProgress !== undefined) monitorNotifyProgress = s.monitorNotifyProgress;
    if (s.monitorNotifyComplete !== undefined) monitorNotifyComplete = s.monitorNotifyComplete;
  }
} catch (e) {}

// ===== TTS Engine =====
function speakMeow(text) {
  if (ttsMuted || !ttsEnabled) return;
  if (!('speechSynthesis' in window)) return;

  speechSynthesis.cancel();

  const fullText = `Meow! ${text} Meow!`;
  const utterance = new SpeechSynthesisUtterance(fullText);
  utterance.volume = ttsVolume;
  utterance.rate = 1.0;
  utterance.pitch = 1.3;

  const voices = speechSynthesis.getVoices();
  const lang = getLanguage();
  const preferred = voices.find(v =>
    (lang === 'ko' && v.lang.startsWith('ko')) ||
    (lang === 'en' && v.lang.startsWith('en') && v.name.includes('Samantha'))
  ) || voices.find(v => v.lang.startsWith(lang === 'ko' ? 'ko' : 'en'));

  if (preferred) utterance.voice = preferred;

  speechSynthesis.speak(utterance);
}

// Ensure voices are loaded
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// ===== Session Monitor =====
let sessionCounter = 0;

function initMonitor() {
  if (monitorEnabled) {
    window.electronAPI.startSessionMonitor();
  }

  window.electronAPI.onSessionUpdate((data) => {
    if (!monitorEnabled) return;

    const taskId = `session-${sessionCounter++}`;

    if (data.isComplete && monitorNotifyComplete) {
      const msg = t('sessionComplete', { msg: data.message });

      // TTS announcement
      speakMeow(data.message);

      // If pet is in house or roaming, use floating notification
      if (window.isInHouse() || window.isRoaming()) {
        window.showFloatingNotification({
          message: msg,
          fullMessage: data.fullMessage || data.message,
          taskId,
          isComplete: true,
        });
      } else {
        // Normal mode: show speech bubble + dance
        window.showSpeech(msg, 15000, true);
        window.setState(window.PetState.DANCING);
        setTimeout(() => {
          window.setState(window.PetState.IDLE);
        }, 5000);
      }

    } else if (!data.isComplete && monitorNotifyProgress) {
      const msg = t('sessionProgress', { msg: data.message });

      speakMeow(data.message);

      if (window.isInHouse() || window.isRoaming()) {
        window.showFloatingNotification({
          message: msg,
          fullMessage: data.fullMessage || data.message,
          taskId,
          isComplete: false,
        });
      } else {
        window.showSpeech(msg, 8000);
      }
    }
  });
}

// Settings change listener
if (window.electronAPI.onSettingsChanged) {
  window.electronAPI.onSettingsChanged((settings) => {
    if (settings.ttsEnabled !== undefined) ttsEnabled = settings.ttsEnabled;
    if (settings.ttsVolume !== undefined) ttsVolume = settings.ttsVolume;
    if (settings.ttsMuted !== undefined) ttsMuted = settings.ttsMuted;

    if (settings.monitorEnabled !== undefined) {
      const wasEnabled = monitorEnabled;
      monitorEnabled = settings.monitorEnabled;
      if (monitorEnabled && !wasEnabled) {
        window.electronAPI.startSessionMonitor();
      } else if (!monitorEnabled && wasEnabled) {
        window.electronAPI.stopSessionMonitor();
      }
    }
    if (settings.monitorNotifyProgress !== undefined) monitorNotifyProgress = settings.monitorNotifyProgress;
    if (settings.monitorNotifyComplete !== undefined) monitorNotifyComplete = settings.monitorNotifyComplete;
  });
}

// Expose
window.speakMeow = speakMeow;
window.monitorControl = {
  enable: () => {
    monitorEnabled = true;
    window.electronAPI.startSessionMonitor();
  },
  disable: () => {
    monitorEnabled = false;
    window.electronAPI.stopSessionMonitor();
  },
  setTTS: (enabled) => { ttsEnabled = enabled; },
  setMuted: (muted) => { ttsMuted = muted; },
  setVolume: (vol) => { ttsVolume = vol; },
};

initMonitor();
