// ===== Voice Recognition (Wake Word + STT) =====

const VoiceState = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
};

let voiceState = VoiceState.IDLE;
let recognition = null;
let wakeWord = 'wooni';
let wakeWordAlt = 'wooniya';
let isVoiceEnabled = true;

// Load settings
try {
  const saved = localStorage.getItem('wooni-settings');
  if (saved) {
    const settings = JSON.parse(saved);
    if (settings.wakeWord) wakeWord = settings.wakeWord;
    if (settings.wakeWordAlt) wakeWordAlt = settings.wakeWordAlt;
    if (settings.voiceEnabled !== undefined) isVoiceEnabled = settings.voiceEnabled;
  }
} catch (e) {}

function initVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    console.warn('Speech Recognition not supported');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = getLanguage() === 'ko' ? 'ko-KR' : 'en-US';
  recognition.maxAlternatives = 3;

  recognition.onresult = handleSpeechResult;
  recognition.onerror = handleSpeechError;
  recognition.onend = handleSpeechEnd;

  if (isVoiceEnabled) {
    startListening();
  }
}

function startListening() {
  if (!recognition) return;
  try {
    recognition.start();
    voiceState = VoiceState.IDLE;
  } catch (e) {}
}

function stopListening() {
  if (!recognition) return;
  try {
    recognition.stop();
  } catch (e) {}
}

function handleSpeechResult(event) {
  const results = event.results;
  const lastResult = results[results.length - 1];

  for (let i = 0; i < lastResult.length; i++) {
    const transcript = lastResult[i].transcript.toLowerCase().trim();

    if (voiceState === VoiceState.IDLE) {
      if (containsWakeWord(transcript)) {
        voiceState = VoiceState.LISTENING;
        window.setState(window.PetState.LISTENING);
        window.showSpeech(t('listening'));

        const question = extractAfterWakeWord(transcript);
        if (question && lastResult.isFinal) {
          processQuestion(question);
        }
        return;
      }
    } else if (voiceState === VoiceState.LISTENING) {
      if (!lastResult.isFinal) {
        const interim = lastResult[0].transcript.trim();
        if (interim) {
          window.updateSpeech(t('micListening', { text: interim }));
        }
      } else {
        const question = lastResult[0].transcript.trim();
        if (question && !containsOnlyWakeWord(question)) {
          processQuestion(question);
        }
      }
      return;
    }
  }
}

function containsWakeWord(text) {
  const lower = text.toLowerCase().replace(/\s/g, '');
  const wake1 = wakeWord.toLowerCase().replace(/\s/g, '');
  const wake2 = wakeWordAlt.toLowerCase().replace(/\s/g, '');
  return lower.includes(wake1) || lower.includes(wake2)
    || lower.includes('우니아') || lower.includes('우니')
    || lower.includes('wooni') || lower.includes('hey wooni');
}

function containsOnlyWakeWord(text) {
  const clean = text.replace(/\s/g, '').toLowerCase();
  return clean === wakeWord.replace(/\s/g, '').toLowerCase()
    || clean === wakeWordAlt.replace(/\s/g, '').toLowerCase()
    || clean === '우니야' || clean === '우니아' || clean === '우니'
    || clean === 'wooni' || clean === 'heywooni';
}

function extractAfterWakeWord(text) {
  const patterns = [wakeWord, wakeWordAlt, '우니야', '우니아', 'hey wooni', 'wooni'];
  let remaining = text;
  for (const pattern of patterns) {
    const idx = remaining.toLowerCase().indexOf(pattern.toLowerCase());
    if (idx !== -1) {
      remaining = remaining.substring(idx + pattern.length).trim();
      break;
    }
  }
  return remaining || '';
}

async function processQuestion(question) {
  voiceState = VoiceState.PROCESSING;
  window.setState(window.PetState.TALKING);
  window.showSpeech(t('thinkingAbout', { q: question }));

  try {
    const response = await window.electronAPI.askClaude(question);
    window.showSpeech(response, 0, true); // show with action buttons
    const readTime = Math.min(30000, Math.max(5000, response.length * 80));
    setTimeout(() => {
      window.hideSpeech();
      window.setState(window.PetState.IDLE);
    }, readTime);
  } catch (e) {
    window.showSpeech(t('sorry'));
    setTimeout(() => {
      window.hideSpeech();
      window.setState(window.PetState.IDLE);
    }, 3000);
  }

  voiceState = VoiceState.IDLE;
}

function handleSpeechError(event) {
  if (event.error === 'no-speech' || event.error === 'aborted') return;
  console.warn('Speech error:', event.error);
  if (voiceState === VoiceState.LISTENING) {
    voiceState = VoiceState.IDLE;
    window.setState(window.PetState.IDLE);
    window.hideSpeech();
  }
}

function handleSpeechEnd() {
  if (isVoiceEnabled) {
    setTimeout(() => startListening(), 100);
  }
}

// Shortcut activation (Cmd+Shift+U)
window.electronAPI.onActivateVoice(() => {
  if (voiceState === VoiceState.IDLE) {
    voiceState = VoiceState.LISTENING;
    window.setState(window.PetState.LISTENING);
    window.showSpeech(t('listening'));
  }
});

// Export
window.voiceControl = {
  start: startListening,
  stop: stopListening,
  setEnabled: (enabled) => {
    isVoiceEnabled = enabled;
    if (enabled) startListening();
    else stopListening();
  },
  setWakeWord: (word, alt) => {
    wakeWord = word;
    wakeWordAlt = alt;
  },
};

initVoice();
