// ===== Chat UI & Claude Code Integration =====

const chatContainer = document.getElementById('chat-container');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');

let isChatOpen = false;
let isProcessing = false;

function toggleChat() {
  if (isChatOpen) {
    closeChat();
  } else {
    openChat();
  }
}

function openChat() {
  isChatOpen = true;
  chatContainer.classList.remove('hidden');

  // Position chat below pet
  const petRect = document.getElementById('pet-container');
  const left = parseInt(petRect.style.left) || window.innerWidth / 2 - 40;
  const top = parseInt(petRect.style.top) || window.innerHeight - 150;

  chatContainer.style.left = `${Math.max(10, left - 100)}px`;
  chatContainer.style.top = `${top + 90}px`;

  // Make area clickable
  window.electronAPI.setIgnoreMouse(false);

  chatInput.focus();
}

function closeChat() {
  isChatOpen = false;
  chatContainer.classList.add('hidden');
  chatInput.value = '';
  window.electronAPI.setIgnoreMouse(true);
}

async function sendMessage() {
  const question = chatInput.value.trim();
  if (!question || isProcessing) return;

  isProcessing = true;
  chatInput.value = '';
  chatInput.placeholder = '우니가 생각 중...';
  chatInput.disabled = true;

  // Show thinking state
  window.setState(window.PetState.TALKING);
  window.showSpeech(`🤔 생각 중...`);

  // Stream response
  let fullResponse = '';
  const streamHandler = (chunk) => {
    fullResponse += chunk;
    // Show truncated response in speech bubble
    const display = fullResponse.length > 300
      ? fullResponse.substring(fullResponse.length - 300) + '...'
      : fullResponse;
    window.updateSpeech(display);
  };

  window.electronAPI.onClaudeStream(streamHandler);

  try {
    const response = await window.electronAPI.askClaude(question);
    // Show final response
    window.showSpeech(response);

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

  isProcessing = false;
  chatInput.disabled = false;
  chatInput.placeholder = '우니에게 물어보세요...';
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

// Keep chat area interactive
chatContainer.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false);
});

chatContainer.addEventListener('mouseleave', () => {
  if (!isChatOpen) {
    window.electronAPI.setIgnoreMouse(true);
  }
});

// Close chat when clicking elsewhere
document.addEventListener('click', (e) => {
  if (isChatOpen && !chatContainer.contains(e.target) && !pet.contains(e.target)) {
    closeChat();
  }
});

// Expose
window.toggleChat = toggleChat;
window.openChat = openChat;
window.closeChat = closeChat;
