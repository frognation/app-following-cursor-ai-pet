// ===== Voice Recognition (Wake Word + STT) =====

const VoiceState = {
  IDLE: 'idle',           // Listening for wake word
  LISTENING: 'listening', // Actively recording question
  PROCESSING: 'processing',
};

let voiceState = VoiceState.IDLE;
let recognition = null;
let wakeWord = '우니야';
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
  recognition.lang = 'ko-KR';
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
  } catch (e) {
    // Already started
  }
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
      // Check for wake word
      if (containsWakeWord(transcript)) {
        voiceState = VoiceState.LISTENING;
        window.setState(window.PetState.LISTENING);
        window.showSpeech('듣고 있어! 말해봐~');

        // Extract question after wake word (if any in the same utterance)
        const question = extractAfterWakeWord(transcript);
        if (question && lastResult.isFinal) {
          processQuestion(question);
        }
        return;
      }
    } else if (voiceState === VoiceState.LISTENING) {
      // Show interim results
      if (!lastResult.isFinal) {
        const interim = lastResult[0].transcript.trim();
        if (interim) {
          window.updateSpeech(`🎤 ${interim}...`);
        }
      } else {
        // Final result - process as question
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
    || lower.includes('우니아') || lower.includes('우니') ;
}

function containsOnlyWakeWord(text) {
  const clean = text.replace(/\s/g, '').toLowerCase();
  return clean === wakeWord.replace(/\s/g, '').toLowerCase()
    || clean === wakeWordAlt.replace(/\s/g, '').toLowerCase()
    || clean === '우니야' || clean === '우니아' || clean === '우니';
}

function extractAfterWakeWord(text) {
  const patterns = [wakeWord, wakeWordAlt, '우니야', '우니아'];
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
  window.showSpeech(`🤔 "${question}" 생각 중...`);

  try {
    // Send to Claude Code CLI via IPC
    const response = await window.electronAPI.askClaude(question);
    window.showSpeech(response);
    // Auto-hide after reading time (min 5s, max 30s)
    const readTime = Math.min(30000, Math.max(5000, response.length * 80));
    setTimeout(() => {
      window.hideSpeech();
      window.setState(window.PetState.IDLE);
    }, readTime);
  } catch (e) {
    window.showSpeech('미안, 답을 못 찾겠어... 😿');
    setTimeout(() => {
      window.hideSpeech();
      window.setState(window.PetState.IDLE);
    }, 3000);
  }

  voiceState = VoiceState.IDLE;
}

function handleSpeechError(event) {
  if (event.error === 'no-speech' || event.error === 'aborted') {
    // These are normal, just restart
    return;
  }
  console.warn('Speech error:', event.error);
  if (voiceState === VoiceState.LISTENING) {
    voiceState = VoiceState.IDLE;
    window.setState(window.PetState.IDLE);
    window.hideSpeech();
  }
}

function handleSpeechEnd() {
  // Auto-restart recognition (it stops automatically after silence)
  if (isVoiceEnabled) {
    setTimeout(() => {
      startListening();
    }, 100);
  }
}

// Shortcut activation (Cmd+Shift+U)
window.electronAPI.onActivateVoice(() => {
  if (voiceState === VoiceState.IDLE) {
    voiceState = VoiceState.LISTENING;
    window.setState(window.PetState.LISTENING);
    window.showSpeech('듣고 있어! 말해봐~');
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

// Init
initVoice();
