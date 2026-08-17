// ===== Chat UI & Claude Code Integration =====

const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

let isProcessing = false;

function toggleChat() {
  if (window.isChatOpen || chatContainer.classList.contains('hidden') === false) {
    closeChat();
  } else {
    openChat();
  }
}

function openChat() {
  window.setIsChatOpen(true);
  chatContainer.classList.remove('hidden');

  // Position chat below pet
  const petRect = document.getElementById('pet-container');
  const left = parseInt(petRect.style.left) || 400;
  const top = parseInt(petRect.style.top) || 400;

  chatContainer.style.left = `${Math.max(10, left - 100)}px`;
  chatContainer.style.top = `${top + 90}px`;

  window.electronAPI.setIgnoreMouse(false);
  chatInput.placeholder = t('chatPlaceholder');
  chatInput.focus();
}

function closeChat() {
  window.setIsChatOpen(false);
  chatContainer.classList.add('hidden');
  chatInput.value = '';
  window.electronAPI.setIgnoreMouse(true);
}

async function sendMessage() {
  const question = chatInput.value.trim();
  if (!question || isProcessing) return;

  isProcessing = true;
  chatInput.value = '';
  chatInput.placeholder = t('wooniThinking');
  chatInput.disabled = true;

  window.setState(window.PetState.TALKING);
  window.showSpeech(t('thinking'));

  let fullResponse = '';
  const streamHandler = (chunk) => {
    fullResponse += chunk;
    const display = fullResponse.length > 500
      ? '...' + fullResponse.substring(fullResponse.length - 500)
      : fullResponse;
    window.updateSpeech(display);
  };

  window.electronAPI.onClaudeStream(streamHandler);

  try {
    const response = await window.electronAPI.askClaude(question);
    // Show final response with action buttons (copy, send to Claude)
    window.showSpeech(response, 0, true);

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

  isProcessing = false;
  chatInput.disabled = false;
  chatInput.placeholder = t('chatPlaceholder');
  chatInput.focus();
}

// Event listeners
chatSend.addEventListener('click', sendMessage);

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  } else if (e.key === 'Escape') {
    closeChat();
  }
});

chatContainer.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false);
});

chatContainer.addEventListener('mouseleave', () => {
  if (!window.isChatOpen && chatContainer.classList.contains('hidden')) {
    window.electronAPI.setIgnoreMouse(true);
  }
});

document.addEventListener('click', (e) => {
  if (!chatContainer.classList.contains('hidden') &&
      !chatContainer.contains(e.target) && !pet.contains(e.target)) {
    closeChat();
  }
});

// Expose
window.toggleChat = toggleChat;
window.openChat = openChat;
window.closeChat = closeChat;
