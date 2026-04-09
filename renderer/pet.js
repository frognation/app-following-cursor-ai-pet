// ===== Pet State Machine & Cursor Following =====

const pet = document.getElementById('pet');
const petContainer = document.getElementById('pet-container');
const settingsBtn = document.getElementById('settings-btn');

const PetState = {
  IDLE: 'idle',
  WALKING: 'walking',
  SITTING: 'sitting',
  DANCING: 'dancing',
  LISTENING: 'listening',
  TALKING: 'talking',
  SLEEPING: 'sleeping',
  GRABBED: 'grabbed',
  FLUNG: 'flung',
};

let currentState = PetState.IDLE;
let petX = window.innerWidth / 2;
let petY = window.innerHeight / 2;
let velocityX = 0;
let velocityY = 0;
let lastMoveTime = Date.now();
let idleTimer = null;
let danceTimer = null;
let facingLeft = false;

// Offset
const OFFSET_X = 60;
const OFFSET_Y = 50;
const SCREEN_EDGE_MARGIN = 120;

// Hover
let isHovering = false;
let hoverTimer = null;
let isApproached = false;

// Spring physics
const SPRING = 0.012;
const DAMPING = 0.88;
const FOLLOW_DISTANCE = 80;
const STOP_DISTANCE = 30;
const SLEEP_TIMEOUT = 30000;

// ===== Grab & Fling =====
let isGrabbed = false;
let grabOffsetX = 0;  // offset from pet center to mouse at grab start
let grabOffsetY = 0;
let mouseHistory = []; // recent mouse positions for velocity calc
const FLING_SPEED_THRESHOLD = 8; // min velocity to trigger fling
const FLING_FRICTION = 0.97;
const FLING_GRAVITY = 0.3;
let flingReturnTimer = null;
let flingLanded = false; // true when flung pet has stopped moving but still dizzy

// ===== State Management =====
function setState(newState) {
  if (currentState === newState) return;
  // Don't interrupt these states unless forced
  if (currentState === PetState.DANCING && danceTimer &&
      newState !== PetState.LISTENING && newState !== PetState.TALKING &&
      newState !== PetState.GRABBED) return;
  if (currentState === PetState.FLUNG &&
      newState !== PetState.GRABBED && newState !== PetState.IDLE &&
      newState !== PetState.WALKING) return;

  currentState = newState;
  pet.className = `state-${newState}`;
  if (facingLeft) pet.classList.add('facing-left');

  const voiceIndicator = document.getElementById('voice-indicator');
  if (newState === PetState.LISTENING) {
    voiceIndicator.classList.remove('hidden');
  } else {
    voiceIndicator.classList.add('hidden');
  }

  if (newState !== PetState.SLEEPING && newState !== PetState.GRABBED && newState !== PetState.FLUNG) {
    resetSleepTimer();
  }
}

function resetSleepTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (currentState === PetState.IDLE || currentState === PetState.SITTING) {
      setState(PetState.SLEEPING);
    }
  }, SLEEP_TIMEOUT);
}

// ===== Compute offset target position =====
function getOffsetTarget(cursorX, cursorY) {
  const screenW = window.innerWidth;
  if (cursorX > screenW - SCREEN_EDGE_MARGIN) {
    return { x: cursorX - OFFSET_X, y: cursorY + OFFSET_Y };
  }
  return { x: cursorX + OFFSET_X, y: cursorY + OFFSET_Y };
}

// ===== Cursor Tracking =====
let rawCursorX = window.innerWidth / 2;
let rawCursorY = window.innerHeight / 2;

async function updateCursorPosition() {
  try {
    const pos = await window.electronAPI.getCursorPosition();
    rawCursorX = pos.x;
    rawCursorY = pos.y;
    lastMoveTime = Date.now();
    if (currentState === PetState.SLEEPING) setState(PetState.IDLE);
  } catch (e) {}
}

document.addEventListener('mousemove', (e) => {
  rawCursorX = e.clientX;
  rawCursorY = e.clientY;
  lastMoveTime = Date.now();

  if (currentState === PetState.SLEEPING) setState(PetState.IDLE);

  // Track mouse history for fling velocity
  if (isGrabbed) {
    const now = performance.now();
    mouseHistory.push({ x: e.clientX, y: e.clientY, t: now });
    // Keep only last 100ms of history
    while (mouseHistory.length > 1 && now - mouseHistory[0].t > 100) {
      mouseHistory.shift();
    }
  }
});

// ===== Physics & Animation Loop =====
function updatePosition() {
  // ---- GRABBED: pet sticks to cursor ----
  if (isGrabbed) {
    petX = rawCursorX + grabOffsetX;
    petY = rawCursorY + grabOffsetY;
    petContainer.style.left = `${petX - 40}px`;
    petContainer.style.top = `${petY - 40}px`;
    requestAnimationFrame(updatePosition);
    return;
  }

  // ---- FLUNG: fly with momentum ----
  if (currentState === PetState.FLUNG) {
    // If already stopped (dizzy on ground), just wait for timer
    if (flingLanded) {
      petContainer.style.left = `${petX - 40}px`;
      petContainer.style.top = `${petY - 40}px`;
      requestAnimationFrame(updatePosition);
      return;
    }

    velocityX *= FLING_FRICTION;
    velocityY *= FLING_FRICTION;
    velocityY += FLING_GRAVITY;
    petX += velocityX;
    petY += velocityY;

    // Bounce off screen edges
    if (petX < 50) { petX = 50; velocityX = Math.abs(velocityX) * 0.5; }
    if (petX > window.innerWidth - 50) { petX = window.innerWidth - 50; velocityX = -Math.abs(velocityX) * 0.5; }
    if (petY < 50) { petY = 50; velocityY = Math.abs(velocityY) * 0.5; }
    if (petY > window.innerHeight - 50) { petY = window.innerHeight - 50; velocityY = -Math.abs(velocityY) * 0.3; }

    // Spin while flying
    pet.style.transform = `rotate(${(performance.now() / 2) % 360}deg)`;

    petContainer.style.left = `${petX - 40}px`;
    petContainer.style.top = `${petY - 40}px`;

    // When slowed down enough, land and go dizzy
    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
    if (speed < 1.5) {
      flingLanded = true;
      pet.style.transform = '';
      velocityX = 0;
      velocityY = 0;

      // Dizzy for 1.5s, then recover and walk back
      clearTimeout(flingReturnTimer);
      flingReturnTimer = setTimeout(() => {
        flingLanded = false;
        currentState = null; // force setState to apply
        setState(PetState.IDLE);
        isApproached = false;
      }, 1500);
    }

    requestAnimationFrame(updatePosition);
    return;
  }

  // ---- Normal states ----
  if (currentState === PetState.DANCING || currentState === PetState.LISTENING || currentState === PetState.TALKING) {
    requestAnimationFrame(updatePosition);
    return;
  }

  let goal;
  if (isApproached) {
    goal = { x: rawCursorX, y: rawCursorY };
  } else {
    goal = getOffsetTarget(rawCursorX, rawCursorY);
  }

  const dx = goal.x - petX;
  const dy = goal.y - petY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (Math.abs(dx) > 5) {
    const shouldFaceLeft = dx < 0;
    if (shouldFaceLeft !== facingLeft) {
      facingLeft = shouldFaceLeft;
      if (facingLeft) pet.classList.add('facing-left');
      else pet.classList.remove('facing-left');
    }
  }

  if (distance > FOLLOW_DISTANCE) {
    const ax = dx * SPRING;
    const ay = dy * SPRING;
    velocityX = (velocityX + ax) * DAMPING;
    velocityY = (velocityY + ay) * DAMPING;
    petX += velocityX;
    petY += velocityY;
    if (currentState !== PetState.WALKING) setState(PetState.WALKING);
  } else if (distance < STOP_DISTANCE) {
    velocityX *= 0.9;
    velocityY *= 0.9;
    petX += velocityX;
    petY += velocityY;
    if (currentState === PetState.WALKING) {
      setState(PetState.SITTING);
      setTimeout(() => {
        if (currentState === PetState.SITTING) setState(PetState.IDLE);
      }, 2000);
    }
  } else {
    velocityX *= 0.95;
    velocityY *= 0.95;
    petX += velocityX;
    petY += velocityY;
    if (currentState === PetState.WALKING) setState(PetState.IDLE);
  }

  petX = Math.max(50, Math.min(window.innerWidth - 50, petX));
  petY = Math.max(50, Math.min(window.innerHeight - 50, petY));

  petContainer.style.left = `${petX - 40}px`;
  petContainer.style.top = `${petY - 40}px`;

  settingsBtn.style.left = `${petX + 45}px`;
  settingsBtn.style.top = `${petY + 25}px`;

  requestAnimationFrame(updatePosition);
}

// ===== Hover Behavior =====
pet.addEventListener('mouseenter', () => {
  if (currentState === PetState.FLUNG) return;
  isHovering = true;
  window.electronAPI.setIgnoreMouse(false);
  settingsBtn.classList.remove('hidden');
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (isHovering) isApproached = false;
  }, 2000);
});

pet.addEventListener('mouseleave', () => {
  if (isGrabbed) return; // don't retreat while grabbing
  isHovering = false;
  clearTimeout(hoverTimer);
  window.electronAPI.setIgnoreMouse(true);
  hoverTimer = setTimeout(() => { isApproached = false; }, 500);
  setTimeout(() => {
    if (!settingsBtn.matches(':hover')) settingsBtn.classList.add('hidden');
  }, 1000);
});

// ===== Grab & Fling Interactions =====
// Mousedown starts a 200ms grace period. During that time:
//   - If mouseup arrives quickly (tap), count taps for single/double click
//   - If mouse is held past 200ms, enter GRABBED state
let grabStartTime = 0;
let grabDelayTimer = null;   // the 200ms grace timer
let pendingGrabEvent = null; // stashed mousedown event

let tapCount = 0;
let tapTimer = null;
const GRAB_DELAY = 200;      // ms before grab kicks in
const DOUBLE_TAP_WINDOW = 350;

pet.addEventListener('mousedown', (e) => {
  e.stopPropagation();
  e.preventDefault();

  if (currentState === PetState.FLUNG) {
    clearTimeout(flingReturnTimer);
    flingLanded = false;
    pet.style.transform = '';
  }

  isApproached = true;
  clearTimeout(hoverTimer);
  window.electronAPI.setIgnoreMouse(false);

  // Stash event info for potential grab
  grabStartTime = Date.now();
  pendingGrabEvent = { x: e.clientX, y: e.clientY };
  mouseHistory = [{ x: e.clientX, y: e.clientY, t: performance.now() }];

  // Start grace period — if held long enough, begin grab
  clearTimeout(grabDelayTimer);
  grabDelayTimer = setTimeout(() => {
    if (pendingGrabEvent) {
      isGrabbed = true;
      grabOffsetX = petX - pendingGrabEvent.x;
      grabOffsetY = petY - pendingGrabEvent.y;
      setState(PetState.GRABBED);
      pendingGrabEvent = null;
    }
  }, GRAB_DELAY);
});

document.addEventListener('mouseup', (e) => {
  // Case 1: Released before grab started (tap)
  if (pendingGrabEvent && !isGrabbed) {
    clearTimeout(grabDelayTimer);
    pendingGrabEvent = null;
    mouseHistory = [];
    handleTap();
    return;
  }

  // Case 2: Released after grab started (fling or gentle release)
  if (!isGrabbed) return;
  isGrabbed = false;

  let flingVX = 0;
  let flingVY = 0;

  if (mouseHistory.length >= 2) {
    const recent = mouseHistory[mouseHistory.length - 1];
    const old = mouseHistory[0];
    const dt = (recent.t - old.t) || 1;
    flingVX = (recent.x - old.x) / dt * 16;
    flingVY = (recent.y - old.y) / dt * 16;
  }

  const flingSpeed = Math.sqrt(flingVX * flingVX + flingVY * flingVY);

  if (flingSpeed > FLING_SPEED_THRESHOLD) {
    velocityX = flingVX * 1.5;
    velocityY = flingVY * 1.5;
    setState(PetState.FLUNG);
    showSpeech('우와아아~!!! ><', 2000);
  } else {
    setState(PetState.IDLE);
    isApproached = false;
  }

  mouseHistory = [];
});

function handleTap() {
  tapCount++;
  if (tapCount === 1) {
    tapTimer = setTimeout(() => {
      if (tapCount === 1) triggerDance();
      tapCount = 0;
    }, DOUBLE_TAP_WINDOW);
  } else if (tapCount >= 2) {
    clearTimeout(tapTimer);
    tapCount = 0;
    toggleChat();
  }
}

settingsBtn.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false);
});

settingsBtn.addEventListener('mouseleave', () => {
  window.electronAPI.setIgnoreMouse(true);
  settingsBtn.classList.add('hidden');
});

settingsBtn.addEventListener('click', () => {
  window.electronAPI.openSettings();
});

function triggerDance() {
  setState(PetState.DANCING);
  clearTimeout(danceTimer);
  danceTimer = setTimeout(() => {
    danceTimer = null;
    setState(PetState.IDLE);
    isApproached = false;
  }, 3000);
}

// ===== Speech Bubble =====
const speechBubble = document.getElementById('speech-bubble');
const speechText = document.getElementById('speech-text');
let speechTimer = null;

function showSpeech(text, duration = 0) {
  speechText.textContent = text;
  speechBubble.classList.remove('hidden');
  clearTimeout(speechTimer);
  if (duration > 0) {
    speechTimer = setTimeout(hideSpeech, duration);
  }
}

function updateSpeech(text) {
  speechText.textContent = text;
}

function hideSpeech() {
  speechBubble.classList.add('hidden');
  clearTimeout(speechTimer);
}

// ===== Initialize =====
function initPet() {
  petX = window.innerWidth / 2;
  petY = window.innerHeight - 150;

  petContainer.style.left = `${petX - 40}px`;
  petContainer.style.top = `${petY - 40}px`;

  requestAnimationFrame(updatePosition);
  setInterval(updateCursorPosition, 50);
  resetSleepTimer();

  setTimeout(() => showSpeech('안녕! 나는 우니야~ 🐾', 4000), 1000);
}

window.PetState = PetState;
window.setState = setState;
window.showSpeech = showSpeech;
window.updateSpeech = updateSpeech;
window.hideSpeech = hideSpeech;

initPet();
