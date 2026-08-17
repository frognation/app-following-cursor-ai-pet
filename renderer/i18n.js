// ===== Internationalization (i18n) =====

const I18N = {
  en: {
    greeting: "Hi! I'm Wooni~ 🐾",
    listening: "I'm listening! Go ahead~",
    thinking: "Thinking...",
    thinkingAbout: '🤔 Thinking about "{q}"...',
    sorry: "Sorry, I couldn't find an answer... 😿",
    flung: "Wheeee~!!! ><",
    chatPlaceholder: "Ask Wooni something...",
    wooniThinking: "Wooni is thinking...",
    micListening: "🎤 {text}...",
    sessionProgress: "Meow! {msg} Meow!",
    sessionComplete: "Meow! Task complete: {msg} Meow!",
    copySuccess: "Copied! 📋",
    settingsTitle: "🐾 Wooni Settings",
    character: "Character",
    petName: "Pet Name",
    size: "Size",
    speed: "Walking Speed",
    speedSlow: "Slow",
    speedFast: "Fast",
    voice: "Voice & Sound",
    voiceRecognition: "Voice Recognition",
    wakeWord: "Wake Word",
    wakeWordAlt: "Alt Wake Word (English)",
    ttsEnabled: "Text-to-Speech (TTS)",
    ttsVolume: "TTS Volume",
    ttsMuted: "Mute All Sounds",
    language: "Language",
    languageLabel: "App Language",
    shortcutSection: "Shortcuts",
    voiceActivation: "Voice Activation",
    monitoring: "Session Monitoring",
    monitorEnabled: "Monitor Claude Code sessions",
    monitorNotifyProgress: "Notify on progress",
    monitorNotifyComplete: "Notify on completion",
    save: "Save",
    saved: "Settings saved!",
    contextMenuSettings: "Settings",
    contextMenuDance: "Dance!",
    contextMenuSleep: "Deep Sleep",
    contextMenuWake: "Wake up",
    contextMenuSendHome: "Send home",
    contextMenuLetOut: "Let out",
    contextMenuRoam: "Free roam",
    contextMenuStopRoam: "Stop roaming",
    contextMenuShowUsage: "Show AI usage",
    contextMenuHideUsage: "Hide AI usage",
    notifShow: "Show me",
    notifLater: "Later",
    notifDismiss: "Go away",
    snoozeDuration: "Snooze Duration (min)",
  },
  ko: {
    greeting: "안녕! 나는 우니야~ 🐾",
    listening: "듣고 있어! 말해봐~",
    thinking: "생각 중...",
    thinkingAbout: '🤔 "{q}" 생각 중...',
    sorry: "미안, 답을 못 찾겠어... 😿",
    flung: "우와아아~!!! ><",
    chatPlaceholder: "우니에게 물어보세요...",
    wooniThinking: "우니가 생각 중...",
    micListening: "🎤 {text}...",
    sessionProgress: "Meow! {msg} Meow!",
    sessionComplete: "Meow! 작업 완료: {msg} Meow!",
    copySuccess: "복사 완료! 📋",
    settingsTitle: "🐾 우니 설정",
    character: "캐릭터",
    petName: "펫 이름",
    size: "크기",
    speed: "걸어오는 속도",
    speedSlow: "느림",
    speedFast: "빠름",
    voice: "음성 & 소리",
    voiceRecognition: "음성 인식",
    wakeWord: "웨이크 워드",
    wakeWordAlt: "영문 웨이크 워드",
    ttsEnabled: "음성 안내 (TTS)",
    ttsVolume: "TTS 볼륨",
    ttsMuted: "모든 소리 끄기",
    language: "언어",
    languageLabel: "앱 언어",
    shortcutSection: "단축키",
    voiceActivation: "음성 활성화",
    monitoring: "세션 모니터링",
    monitorEnabled: "Claude Code 세션 모니터링",
    monitorNotifyProgress: "진행 상황 알림",
    monitorNotifyComplete: "완료 알림",
    save: "저장",
    saved: "설정이 저장되었습니다!",
    contextMenuSettings: "설정",
    contextMenuDance: "춤춰!",
    contextMenuSleep: "깊이 잠들기",
    contextMenuWake: "일어나",
    contextMenuSendHome: "집으로 보내기",
    contextMenuLetOut: "밖으로 나오기",
    contextMenuRoam: "자유 산책",
    contextMenuStopRoam: "산책 중지",
    contextMenuShowUsage: "AI 사용량 표시",
    contextMenuHideUsage: "AI 사용량 숨기기",
    notifShow: "보여줘",
    notifLater: "나중에",
    notifDismiss: "됐어",
    snoozeDuration: "스누즈 시간 (분)",
  },
};

let currentLang = 'en';

function initI18n() {
  try {
    const saved = localStorage.getItem('wooni-settings');
    if (saved) {
      const settings = JSON.parse(saved);
      if (settings.language) currentLang = settings.language;
    }
  } catch (e) {}
}

function t(key, params = {}) {
  const dict = I18N[currentLang] || I18N.en;
  let text = dict[key] || I18N.en[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}

function setLanguage(lang) {
  currentLang = lang;
}

function getLanguage() {
  return currentLang;
}

// Export
window.I18N = I18N;
window.t = t;
window.setLanguage = setLanguage;
window.getLanguage = getLanguage;
window.initI18n = initI18n;

initI18n();
