// ===== Pet State Machine & Cursor Following =====

const pet = document.getElementById('pet');
const petContainer = document.getElementById('pet-container');
const catHouse = document.getElementById('cat-house');
const houseSpeech = document.getElementById('house-speech');
const houseSpeechText = document.getElementById('house-speech-text');
const floatingNotif = document.getElementById('floating-notification');
const notifText = document.getElementById('notif-text');

const PetState = {
  IDLE: 'idle',
  WALKING: 'walking',
  RUNNING: 'running',
  SITTING: 'sitting',
  CROUCHING: 'crouching',
  LYING: 'lying',
  DANCING: 'dancing',
  LISTENING: 'listening',
  TALKING: 'talking',
  SLEEPING: 'sleeping',
  GRABBED: 'grabbed',
  FLUNG: 'flung',
  GOING_HOME: 'going-home',
  IN_HOUSE: 'in-house',
  ROAMING: 'roaming',
};

let currentState = PetState.IDLE;
let isDeepSleeping = false;
let petX = 400;
let petY = 400;
let velocityX = 0;
let velocityY = 0;
let lastMoveTime = 0;
let lastCursorMoveTime = 0;
let idleTimer = null;
let crouchTimer = null;
let lieTimer = null;
let danceTimer = null;
let facingLeft = false;

// ===== Follow delay & speed (configurable) =====
const FOLLOW_DELAY = 500;        // 0.5s delay before following cursor
let SPRING = 0.00156;            // 120% of previous 0.0013
let DAMPING = 0.88;
const FOLLOW_DISTANCE = 80;
const STOP_DISTANCE = 30;
const SLEEP_TIMEOUT = 30000;
const CROUCH_TIMEOUT = 7000;
const LIE_TIMEOUT = 16000;
const RUN_CURSOR_SPEED = 900;
const RUN_DISTANCE = 300;

// Offset
const OFFSET_X = 60;
const OFFSET_Y = 50;
const SCREEN_EDGE_MARGIN = 120;

// Hover
let isHovering = false;
let hoverTimer = null;
let isApproached = false;

// Display bounds (updates when window moves across monitors)
let displayBounds = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
let displayOffset = { x: 0, y: 0 }; // offset of current display from (0,0)

// ===== Grab & Fling =====
let isGrabbed = false;
let grabOffsetX = 0;
let grabOffsetY = 0;
let mouseHistory = [];
const FLING_SPEED_THRESHOLD = 8;
const FLING_FRICTION = 0.97;
const FLING_GRAVITY = 0.3;
let flingReturnTimer = null;
let flingLanded = false;

// ===== Cat House =====
let isInHouse = false;
let houseX = 0;
let houseY = 0;
const HOUSE_SPEED = 0.006;

// House absolute position (screen coords across all monitors)
// House stays on the display where this absolute position lives.
// Initialized when display bounds are first known.
let houseAbsX = null;
let houseAbsY = null;

// House dragging
let isHouseDragging = false;
let houseGrabOffsetX = 0;
let houseGrabOffsetY = 0;
let houseVelocityY = 0;
let houseFalling = false;
const HOUSE_GRAVITY = 0.8;

function renderPetPosition() {
  const styles = window.getComputedStyle(pet);
  const width = Number.parseFloat(styles.width) || 132;
  const height = Number.parseFloat(styles.height) || 92;
  petContainer.style.left = `${petX - width / 2}px`;
  petContainer.style.top = `${petY - height / 2}px`;
}

function getHouseDimensions() {
  const styles = window.getComputedStyle(catHouse);
  return {
    width: Number.parseFloat(styles.width) || 100,
    height: Number.parseFloat(styles.height) || 120,
  };
}

// House shake detection
let houseShakeHistory = [];
let houseShakeCount = 0;
let houseShakeTimer = null;
const SHAKE_THRESHOLD = 3; // need 3 shakes to let out

// House double-click
let houseClickCount = 0;
let houseClickTimer = null;

// ===== Free Roam =====
let isRoaming = false;
let roamTarget = null;
let roamTimer = null;
let roamActionTimer = null;
const ROAM_GRAVITY = 0.5;
const ROAM_SPEED = 0.001;
const ROAM_CHANGE_INTERVAL = 4000; // Change roam target every 4s

// ===== Floating Notification =====
let notifQueue = [];
let activeNotif = null;
let notifFollowInterval = null;
let snoozeDuration = 5 * 60 * 1000; // 5 min default
let dismissedTasks = new Set();

// ===== Load settings =====
function loadPetSettings() {
  try {
    const saved = localStorage.getItem('wooni-settings');
    if (saved) {
      const s = JSON.parse(saved);
      if (s.walkSpeed !== undefined) {
        SPRING = 0.0006 + (s.walkSpeed / 100) * 0.0138;
      }
      if (s.snoozeDuration !== undefined) {
        snoozeDuration = s.snoozeDuration * 60 * 1000;
      }
    }
  } catch (e) {}
}
loadPetSettings();

// ===== State Management =====
function setState(newState) {
  if (currentState === newState) {
    if (newState === PetState.SLEEPING) {
      pet.classList.toggle('deep-sleep', isDeepSleeping);
    }
    return;
  }
  if (currentState === PetState.SLEEPING && isDeepSleeping &&
      newState !== PetState.IDLE && newState !== PetState.GRABBED) return;
  if (currentState === PetState.DANCING && danceTimer &&
      newState !== PetState.LISTENING && newState !== PetState.TALKING &&
      newState !== PetState.GRABBED) return;
  if (currentState === PetState.FLUNG &&
      newState !== PetState.GRABBED && newState !== PetState.IDLE &&
      newState !== PetState.WALKING && newState !== PetState.RUNNING) return;
  if (currentState === PetState.IN_HOUSE &&
      newState !== PetState.IDLE && newState !== PetState.WALKING &&
      newState !== PetState.RUNNING && newState !== PetState.ROAMING) return;
  if (currentState === PetState.GOING_HOME && newState !== PetState.IN_HOUSE) return;

  if (newState !== PetState.SLEEPING) isDeepSleeping = false;
  currentState = newState;
  pet.className = `state-${newState}`;
  if (newState === PetState.SLEEPING && isDeepSleeping) pet.classList.add('deep-sleep');
  if (facingLeft) pet.classList.add('facing-left');

  // Preserve face shift class
  if (currentFaceShift) {
    pet.classList.add(currentFaceShift);
  }

  const voiceIndicator = document.getElementById('voice-indicator');
  if (newState === PetState.LISTENING) {
    voiceIndicator.classList.remove('hidden');
  } else {
    voiceIndicator.classList.add('hidden');
  }

  // Handle house state
  if (newState === PetState.IN_HOUSE) {
    isInHouse = true;
    catHouse.classList.add('has-pet');
    // Pet walks behind house — lower z-index then hide after animation
    petContainer.style.zIndex = '9997'; // behind cat house (9998)
    setTimeout(() => {
      if (currentState === PetState.IN_HOUSE) {
        petContainer.style.display = 'none';
      }
    }, 600);
  } else {
    if (isInHouse && newState !== PetState.GOING_HOME) {
      isInHouse = false;
      catHouse.classList.remove('has-pet');
      petContainer.style.display = '';
      petContainer.style.zIndex = '9999';
    }
  }

  if (newState !== PetState.SLEEPING && newState !== PetState.CROUCHING &&
      newState !== PetState.LYING && newState !== PetState.GRABBED &&
      newState !== PetState.FLUNG && newState !== PetState.IN_HOUSE) {
    resetSleepTimer();
  }
}

function resetSleepTimer() {
  clearTimeout(crouchTimer);
  clearTimeout(lieTimer);
  clearTimeout(idleTimer);

  crouchTimer = setTimeout(() => {
    if (currentState === PetState.IDLE || currentState === PetState.SITTING) {
      setState(PetState.CROUCHING);
    }
  }, CROUCH_TIMEOUT);

  lieTimer = setTimeout(() => {
    if (currentState === PetState.IDLE || currentState === PetState.SITTING ||
        currentState === PetState.CROUCHING) {
      setState(PetState.LYING);
    }
  }, LIE_TIMEOUT);

  idleTimer = setTimeout(() => {
    if (currentState === PetState.IDLE || currentState === PetState.SITTING ||
        currentState === PetState.CROUCHING || currentState === PetState.LYING) {
      isDeepSleeping = false;
      setState(PetState.SLEEPING);
    }
  }, SLEEP_TIMEOUT);
}

function enterDeepSleep() {
  isDeepSleeping = true;
  clearTimeout(crouchTimer);
  clearTimeout(lieTimer);
  clearTimeout(idleTimer);
  setState(PetState.SLEEPING);
}

function shouldWakeFromCursor() {
  return isRestingState() && !(currentState === PetState.SLEEPING && isDeepSleeping);
}

// ===== Face direction shift =====
let currentFaceShift = '';

function updateFaceShift(dx) {
  let newShift = '';
  if (currentState === PetState.WALKING || currentState === PetState.RUNNING ||
      currentState === PetState.GOING_HOME || currentState === PetState.ROAMING) {
    if (dx > 5) newShift = 'face-shift-right';
    else if (dx < -5) newShift = 'face-shift-left';
  }

  if (newShift !== currentFaceShift) {
    if (currentFaceShift) pet.classList.remove(currentFaceShift);
    currentFaceShift = newShift;
    if (newShift) pet.classList.add(newShift);
  }
}

// ===== Compute offset target =====
function getOffsetTarget(cursorX, cursorY) {
  const screenW = displayBounds.x + displayBounds.width;
  if (cursorX > screenW - SCREEN_EDGE_MARGIN) {
    return { x: cursorX - OFFSET_X, y: cursorY + OFFSET_Y };
  }
  return { x: cursorX + OFFSET_X, y: cursorY + OFFSET_Y };
}

// ===== Cursor Tracking =====
let rawCursorX = 400;
let rawCursorY = 400;
let cursorStoppedX = 400;
let cursorStoppedY = 400;
let cursorSpeed = 0;
let lastCursorSampleTime = performance.now();

function sampleCursorSpeed(nextX, nextY) {
  const now = performance.now();
  const elapsed = Math.max(8, now - lastCursorSampleTime);
  const distance = Math.hypot(nextX - rawCursorX, nextY - rawCursorY);
  const instantaneousSpeed = (distance / elapsed) * 1000;
  cursorSpeed = cursorSpeed * 0.68 + instantaneousSpeed * 0.32;
  lastCursorSampleTime = now;
}

function isRestingState(state = currentState) {
  return state === PetState.SITTING || state === PetState.CROUCHING ||
    state === PetState.LYING || state === PetState.SLEEPING;
}

function isLocomotionState(state = currentState) {
  return state === PetState.WALKING || state === PetState.RUNNING;
}

async function updateCursorPosition() {
  try {
    const pos = await window.electronAPI.getCursorPosition();
    const relX = pos.x - displayOffset.x;
    const relY = pos.y - displayOffset.y;
    const moved = Math.abs(relX - rawCursorX) > 2 || Math.abs(relY - rawCursorY) > 2;
    sampleCursorSpeed(relX, relY);
    rawCursorX = relX;
    rawCursorY = relY;

    if (moved) {
      lastCursorMoveTime = Date.now();
      cursorStoppedX = relX;
      cursorStoppedY = relY;
      if (shouldWakeFromCursor()) setState(PetState.IDLE);
    }
  } catch (e) {}
}



document.addEventListener('mousemove', (e) => {
  const moved = Math.abs(e.clientX - rawCursorX) > 2 || Math.abs(e.clientY - rawCursorY) > 2;
  sampleCursorSpeed(e.clientX, e.clientY);
  rawCursorX = e.clientX;
  rawCursorY = e.clientY;

  if (moved) {
    lastCursorMoveTime = Date.now();
    cursorStoppedX = e.clientX;
    cursorStoppedY = e.clientY;
    if (shouldWakeFromCursor()) setState(PetState.IDLE);
  }

  if (isGrabbed) {
    const now = performance.now();
    mouseHistory.push({ x: e.clientX, y: e.clientY, t: now });
    while (mouseHistory.length > 1 && now - mouseHistory[0].t > 100) {
      mouseHistory.shift();
    }
  }

  // Update floating notification position (follows cursor)
  if (activeNotif && !floatingNotif.classList.contains('hidden')) {
    floatingNotif.style.left = `${e.clientX + 20}px`;
    floatingNotif.style.top = `${e.clientY - 60}px`;
  }
});

// ===== Dual Monitor: initialize display bounds =====
async function initDisplayBounds() {
  try {
    const info = await window.electronAPI.getDisplayBounds();
    displayOffset = { x: info.bounds.x, y: info.bounds.y };
    displayBounds = { x: 0, y: 0, width: info.bounds.width, height: info.bounds.height };
  } catch (e) {
    displayBounds = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    displayOffset = { x: 0, y: 0 };
  }
}

if (window.electronAPI.onDisplaysChanged) {
  window.electronAPI.onDisplaysChanged((data) => {
    const previousRelX = houseAbsX === null ? null : houseAbsX - displayOffset.x;
    const previousRelY = houseAbsY === null ? null : houseAbsY - displayOffset.y;
    displayOffset = { x: data.bounds.x, y: data.bounds.y };
    displayBounds = { x: 0, y: 0, width: data.bounds.width, height: data.bounds.height };
    petX = displayBounds.width / 2;
    petY = displayBounds.height - 150;

    // Keep the house visible when the cursor/app moves to another monitor.
    if (previousRelX !== null && previousRelY !== null) {
      const { width, height } = getHouseDimensions();
      const relX = Math.max(20, Math.min(displayBounds.width - width - 20, previousRelX));
      const relY = Math.max(20, Math.min(displayBounds.height - height - 20, previousRelY));
      houseAbsX = displayOffset.x + relX;
      houseAbsY = displayOffset.y + relY;
    }
    renderHouseForCurrentDisplay();
  });
}

// ===== Cat House Position =====
// Initialize house at bottom-right of the current (primary) display, in absolute coords
function initHouseAbsolutePosition() {
  if (houseAbsX !== null) return;
  const { width, height } = getHouseDimensions();
  houseAbsX = displayOffset.x + displayBounds.width - width - 30;
  houseAbsY = displayOffset.y + displayBounds.height - height - 20;
}

// Render the house on the active display and recover it if stale coordinates put it off-screen.
function renderHouseForCurrentDisplay() {
  if (houseAbsX === null) initHouseAbsolutePosition();

  const { width, height } = getHouseDimensions();
  let relX = houseAbsX - displayOffset.x;
  let relY = houseAbsY - displayOffset.y;

  const isOffScreen = relX < 0 || relY < 0 ||
    relX + width > displayBounds.width || relY + height > displayBounds.height;
  if (isOffScreen) {
    relX = displayBounds.width - width - 30;
    relY = displayBounds.height - height - 20;
    houseAbsX = displayOffset.x + relX;
    houseAbsY = displayOffset.y + relY;
  }

  catHouse.style.left = `${relX}px`;
  catHouse.style.top = `${relY}px`;
  catHouse.style.right = 'auto';
  catHouse.style.bottom = 'auto';
  houseX = relX + width / 2; // center of house (window-relative)
  houseY = relY + height / 2;
  catHouse.classList.remove('hidden');
}

// Called when the user finishes dragging the house — saves the new anchor position
function saveHouseAbsolutePosition(relX, relY) {
  const { width, height } = getHouseDimensions();
  houseAbsX = relX + displayOffset.x;
  houseAbsY = relY + displayOffset.y;
  houseX = relX + width / 2;
  houseY = relY + height / 2;
}

// Backwards-compat alias used during init
function updateHousePosition() {
  initHouseAbsolutePosition();
  renderHouseForCurrentDisplay();
}

// ===== Physics & Animation Loop =====
function updatePosition() {
  // ---- GRABBED ----
  if (isGrabbed) {
    petX = rawCursorX + grabOffsetX;
    petY = rawCursorY + grabOffsetY;
    renderPetPosition();
    requestAnimationFrame(updatePosition);
    return;
  }

  // ---- FLUNG ----
  if (currentState === PetState.FLUNG) {
    if (flingLanded) {
      renderPetPosition();
      requestAnimationFrame(updatePosition);
      return;
    }

    velocityX *= FLING_FRICTION;
    velocityY *= FLING_FRICTION;
    velocityY += FLING_GRAVITY;
    petX += velocityX;
    petY += velocityY;

    const minX = displayBounds.x + 50;
    const maxX = displayBounds.x + displayBounds.width - 50;
    const minY = displayBounds.y + 50;
    const maxY = displayBounds.y + displayBounds.height - 50;

    if (petX < minX) { petX = minX; velocityX = Math.abs(velocityX) * 0.5; }
    if (petX > maxX) { petX = maxX; velocityX = -Math.abs(velocityX) * 0.5; }
    if (petY < minY) { petY = minY; velocityY = Math.abs(velocityY) * 0.5; }
    if (petY > maxY) { petY = maxY; velocityY = -Math.abs(velocityY) * 0.3; }

    pet.style.transform = `rotate(${(performance.now() / 2) % 360}deg)`;

    renderPetPosition();

    const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);
    if (speed < 1.5) {
      flingLanded = true;
      pet.style.transform = '';
      velocityX = 0;
      velocityY = 0;

      clearTimeout(flingReturnTimer);
      flingReturnTimer = setTimeout(() => {
        flingLanded = false;
        currentState = null;
        setState(PetState.IDLE);
        isApproached = false;
      }, 1500);
    }

    requestAnimationFrame(updatePosition);
    return;
  }

  // ---- GOING HOME ----
  if (currentState === PetState.GOING_HOME) {
    const dx = houseX - petX;
    const dy = houseY - petY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (Math.abs(dx) > 5) {
      const shouldFaceLeft = dx < 0;
      if (shouldFaceLeft !== facingLeft) {
        facingLeft = shouldFaceLeft;
        if (facingLeft) pet.classList.add('facing-left');
        else pet.classList.remove('facing-left');
      }
    }
    updateFaceShift(dx);

    if (dist < 20) {
      // Arrived at house
      velocityX = 0;
      velocityY = 0;
      petX = houseX;
      petY = houseY;
      setState(PetState.IN_HOUSE);
    } else {
      const ax = dx * HOUSE_SPEED;
      const ay = dy * HOUSE_SPEED;
      velocityX = (velocityX + ax) * 0.9;
      velocityY = (velocityY + ay) * 0.9;
      petX += velocityX;
      petY += velocityY;
    }

    renderPetPosition();
    requestAnimationFrame(updatePosition);
    return;
  }

  // ---- IN HOUSE ----
  if (currentState === PetState.IN_HOUSE) {
    requestAnimationFrame(updatePosition);
    return;
  }

  // ---- ROAMING ----
  if (currentState === PetState.ROAMING) {
    if (roamTarget) {
      const dx = roamTarget.x - petX;
      const dy = roamTarget.y - petY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (Math.abs(dx) > 5) {
        const shouldFaceLeft = dx < 0;
        if (shouldFaceLeft !== facingLeft) {
          facingLeft = shouldFaceLeft;
          if (facingLeft) pet.classList.add('facing-left');
          else pet.classList.remove('facing-left');
        }
      }
      updateFaceShift(dx);

      if (dist < 20) {
        roamTarget = null;
        velocityX *= 0.5;
        velocityY *= 0.5;
      } else {
        const ax = dx * ROAM_SPEED;
        const ay = dy * ROAM_SPEED;
        velocityX = (velocityX + ax) * DAMPING;
        velocityY = (velocityY + ay) * DAMPING;
      }
    } else {
      velocityX *= 0.95;
      velocityY *= 0.95;
      updateFaceShift(0);
    }

    petX += velocityX;
    petY += velocityY;

    // Clamp to screen
    const minX = displayBounds.x + 50;
    const maxX = displayBounds.x + displayBounds.width - 50;
    const maxY = displayBounds.y + displayBounds.height - 50;
    petX = Math.max(minX, Math.min(maxX, petX));
    petY = Math.min(maxY, petY);

    renderPetPosition();
    requestAnimationFrame(updatePosition);
    return;
  }

  // ---- Non-interactive states ----
  if (currentState === PetState.DANCING || currentState === PetState.LISTENING ||
      currentState === PetState.TALKING || currentState === PetState.CROUCHING ||
      currentState === PetState.LYING || currentState === PetState.SLEEPING) {
    requestAnimationFrame(updatePosition);
    return;
  }

  // ---- FOLLOW DELAY: 0.5s delay to START following, but once walking, track real-time ----
  const timeSinceCursorMove = Date.now() - lastCursorMoveTime;
  const isAlreadyMoving = isLocomotionState();
  const shouldFollow = isAlreadyMoving || timeSinceCursorMove >= FOLLOW_DELAY;

  let goal;
  if (isApproached) {
    goal = { x: rawCursorX, y: rawCursorY };
  } else if (shouldFollow) {
    const targetX = isAlreadyMoving ? rawCursorX : cursorStoppedX;
    const targetY = isAlreadyMoving ? rawCursorY : cursorStoppedY;
    goal = getOffsetTarget(targetX, targetY);
  } else {
    velocityX *= 0.95;
    velocityY *= 0.95;
    petX += velocityX;
    petY += velocityY;
    if (isLocomotionState()) {
      setState(PetState.IDLE);
      updateFaceShift(0);
    }
    renderPetPosition();
    requestAnimationFrame(updatePosition);
    return;
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

  updateFaceShift(dx);

  if (distance > FOLLOW_DISTANCE) {
    const ax = dx * SPRING;
    const ay = dy * SPRING;
    velocityX = (velocityX + ax) * DAMPING;
    velocityY = (velocityY + ay) * DAMPING;
    petX += velocityX;
    petY += velocityY;

    const movementSpeed = Math.hypot(velocityX, velocityY);
    const shouldRun = cursorSpeed >= RUN_CURSOR_SPEED || distance >= RUN_DISTANCE;
    const nextState = shouldRun ? PetState.RUNNING : PetState.WALKING;
    if (currentState !== nextState) setState(nextState);

    const walkCycle = Math.max(0.42, Math.min(0.82, 0.9 - movementSpeed * 0.055));
    const runCycle = Math.max(0.24, Math.min(0.4, 0.43 - movementSpeed * 0.018));
    pet.style.setProperty('--walk-cycle', `${walkCycle}s`);
    pet.style.setProperty('--run-cycle', `${runCycle}s`);
  } else if (distance < STOP_DISTANCE) {
    velocityX *= 0.9;
    velocityY *= 0.9;
    petX += velocityX;
    petY += velocityY;
    updateFaceShift(0);
    if (isLocomotionState()) {
      setState(PetState.IDLE);
    }
  } else {
    velocityX *= 0.95;
    velocityY *= 0.95;
    petX += velocityX;
    petY += velocityY;
    if (isLocomotionState()) {
      setState(PetState.IDLE);
      updateFaceShift(0);
    }
  }

  // Clamp to display bounds
  const minX = displayBounds.x + 50;
  const maxX = displayBounds.x + displayBounds.width - 50;
  const minY = displayBounds.y + 50;
  const maxY = displayBounds.y + displayBounds.height - 50;

  petX = Math.max(minX, Math.min(maxX, petX));
  petY = Math.max(minY, Math.min(maxY, petY));

  renderPetPosition();

  requestAnimationFrame(updatePosition);
}

// ===== Hover Behavior =====
pet.addEventListener('mouseenter', () => {
  if (currentState === PetState.FLUNG) return;
  isHovering = true;
  window.electronAPI.setIgnoreMouse(false);
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (isHovering) isApproached = false;
  }, 2000);
});

pet.addEventListener('mouseleave', () => {
  if (isGrabbed) return;
  isHovering = false;
  clearTimeout(hoverTimer);
  window.electronAPI.setIgnoreMouse(true);
  hoverTimer = setTimeout(() => { isApproached = false; }, 500);
});

// ===== RIGHT-CLICK: Context Menu for Settings =====
pet.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.electronAPI.showContextMenu({
    settingsLabel: t('contextMenuSettings'),
    danceLabel: t('contextMenuDance'),
    sleepLabel: t('contextMenuSleep'),
    wakeLabel: t('contextMenuWake'),
    sendHomeLabel: t('contextMenuSendHome'),
    letOutLabel: t('contextMenuLetOut'),
    roamLabel: t('contextMenuRoam'),
    showUsageLabel: t('contextMenuShowUsage'),
    hideUsageLabel: t('contextMenuHideUsage'),
    usageEnabled: window.isAiUsageEnabled ? window.isAiUsageEnabled() : true,
    isInHouse: isInHouse,
    isRoaming: isRoaming,
  });
});

// Also right-click on cat house
catHouse.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  e.stopPropagation();
  window.electronAPI.showContextMenu({
    settingsLabel: t('contextMenuSettings'),
    danceLabel: t('contextMenuDance'),
    sleepLabel: t('contextMenuSleep'),
    wakeLabel: t('contextMenuWake'),
    sendHomeLabel: t('contextMenuSendHome'),
    letOutLabel: t('contextMenuLetOut'),
    roamLabel: t('contextMenuRoam'),
    showUsageLabel: t('contextMenuShowUsage'),
    hideUsageLabel: t('contextMenuHideUsage'),
    usageEnabled: window.isAiUsageEnabled ? window.isAiUsageEnabled() : true,
    isInHouse: isInHouse,
    isRoaming: isRoaming,
  });
});

// ===== Cat House Interactions =====
catHouse.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false);
});
catHouse.addEventListener('mouseleave', () => {
  if (!isHouseDragging && !isChatOpen) window.electronAPI.setIgnoreMouse(true);
});

// House dragging
let houseMoveHistory = []; // for calculating fling velocity of house shake

catHouse.addEventListener('mousedown', (e) => {
  if (e.button === 2) return; // skip right-click
  e.preventDefault();
  e.stopPropagation();

  const houseRect = catHouse.getBoundingClientRect();
  houseGrabOffsetX = houseRect.left - e.clientX;
  houseGrabOffsetY = houseRect.top - e.clientY;

  isHouseDragging = true;
  houseFalling = false;
  catHouse.classList.add('dragging');
  window.electronAPI.setIgnoreMouse(false);

  // Track position for shake detection + velocity
  houseShakeHistory = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
  houseMoveHistory = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
  houseShakeCount = 0;
});

document.addEventListener('mousemove', (e) => {
  if (!isHouseDragging) return;

  const newX = e.clientX + houseGrabOffsetX;
  const newY = e.clientY + houseGrabOffsetY;
  catHouse.style.left = `${newX}px`;
  catHouse.style.top = `${newY}px`;
  catHouse.style.right = 'auto';
  catHouse.style.bottom = 'auto';

  // Continuously update absolute position during drag so the anchor follows the cursor across monitors
  saveHouseAbsolutePosition(newX, newY);

  // Track mouse velocity for fling strength
  const now = performance.now();
  houseMoveHistory.push({ x: e.clientX, y: e.clientY, t: now });
  while (houseMoveHistory.length > 1 && now - houseMoveHistory[0].t > 150) {
    houseMoveHistory.shift();
  }

  // Shake detection: track direction changes
  const nowMs = Date.now();
  const last = houseShakeHistory[houseShakeHistory.length - 1];
  if (last) {
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 12) {
      if (houseShakeHistory.length >= 2) {
        const prev = houseShakeHistory[houseShakeHistory.length - 2];
        const prevDx = last.x - prev.x;
        const prevDy = last.y - prev.y;
        // Direction reversal = one shake
        if ((dx * prevDx < 0) || (dy * prevDy < 0)) {
          houseShakeCount++;
          catHouse.classList.add('shaking');

          if (houseShakeCount >= SHAKE_THRESHOLD && isInHouse) {
            // Calculate shake intensity from recent mouse velocity
            const shakeIntensity = calculateShakeIntensity();
            flingPetFromHouse(shakeIntensity);
            houseShakeCount = 0;
          }
        }
      }
      houseShakeHistory.push({ x: e.clientX, y: e.clientY, t: nowMs });
      if (houseShakeHistory.length > 15) houseShakeHistory.shift();
    }
  }
});

// Calculate how hard the house is being shaken
function calculateShakeIntensity() {
  if (houseMoveHistory.length < 2) return 1.0;
  const recent = houseMoveHistory[houseMoveHistory.length - 1];
  const old = houseMoveHistory[0];
  const dt = (recent.t - old.t) || 1;

  // Calculate average speed over recent history
  let totalDist = 0;
  for (let i = 1; i < houseMoveHistory.length; i++) {
    const dx = houseMoveHistory[i].x - houseMoveHistory[i - 1].x;
    const dy = houseMoveHistory[i].y - houseMoveHistory[i - 1].y;
    totalDist += Math.sqrt(dx * dx + dy * dy);
  }
  const avgSpeed = totalDist / dt * 16; // normalize to per-frame

  // Map speed to intensity: gentle (1.0) to violent (4.0)
  return Math.max(1.0, Math.min(4.0, avgSpeed / 5));
}

// Fling pet out of house based on shake intensity
function flingPetFromHouse(intensity) {
  if (!isInHouse) return;

  // Let pet out first
  isInHouse = false;
  catHouse.classList.remove('has-pet');
  catHouse.classList.remove('shaking');
  petContainer.style.display = '';
  petContainer.style.zIndex = '9999';

  // Position at house center
  const houseRect = catHouse.getBoundingClientRect();
  petX = houseRect.left + houseRect.width / 2;
  petY = houseRect.top + houseRect.height / 2;
  renderPetPosition();

  // Fling direction: use last shake direction, with upward bias
  let flingVX = 0;
  let flingVY = 0;
  if (houseMoveHistory.length >= 2) {
    const recent = houseMoveHistory[houseMoveHistory.length - 1];
    const old = houseMoveHistory[Math.max(0, houseMoveHistory.length - 4)];
    const dt = (recent.t - old.t) || 1;
    flingVX = (recent.x - old.x) / dt * 16;
    flingVY = (recent.y - old.y) / dt * 16;
  }

  // Add random spread + upward kick based on intensity
  const angle = Math.atan2(flingVY, flingVX) + (Math.random() - 0.5) * 0.5;
  const baseSpeed = 8 * intensity;
  const speed = Math.max(baseSpeed, Math.sqrt(flingVX * flingVX + flingVY * flingVY) * intensity);

  velocityX = Math.cos(angle) * speed;
  velocityY = Math.min(Math.sin(angle) * speed, -5 * intensity); // always some upward

  // Use flung state for physics
  currentState = null;
  setState(PetState.FLUNG);
  showSpeech(intensity > 2.5 ? t('flung') : '~(=^‥^)ノ !!', 2000);
}

document.addEventListener('mouseup', (e) => {
  if (!isHouseDragging) return;
  isHouseDragging = false;
  catHouse.classList.remove('dragging');
  catHouse.classList.remove('shaking');
  houseShakeCount = 0;
  houseShakeHistory = [];
  houseMoveHistory = [];

  // Apply gravity — house falls to bottom
  const houseRect = catHouse.getBoundingClientRect();
  let currentHouseY = houseRect.top;
  const currentHouseX = houseRect.left;
  houseVelocityY = 0;
  houseFalling = true;

  function dropHouse() {
    if (!houseFalling) return;
    houseVelocityY += HOUSE_GRAVITY;
    currentHouseY += houseVelocityY;

    const houseHeight = houseRect.height || getHouseDimensions().height;
    const maxY = displayBounds.height - houseHeight - 20;
    if (currentHouseY >= maxY) {
      currentHouseY = maxY;
      houseVelocityY = -houseVelocityY * 0.3; // small bounce
      if (Math.abs(houseVelocityY) < 2) {
        houseFalling = false;
        houseVelocityY = 0;
      }
    }

    catHouse.style.top = `${currentHouseY}px`;
    catHouse.style.left = `${currentHouseX}px`;

    // Save absolute position — this re-anchors the house to whichever monitor
    // the user dropped it on (uses the current window's displayOffset).
    saveHouseAbsolutePosition(currentHouseX, currentHouseY);

    if (houseFalling) requestAnimationFrame(dropHouse);
  }
  requestAnimationFrame(dropHouse);

  if (!isChatOpen) window.electronAPI.setIgnoreMouse(true);
});

// House double-click to let pet out
catHouse.addEventListener('click', (e) => {
  if (e.button === 2) return;
  houseClickCount++;
  if (houseClickCount === 1) {
    houseClickTimer = setTimeout(() => { houseClickCount = 0; }, 350);
  } else if (houseClickCount >= 2) {
    clearTimeout(houseClickTimer);
    houseClickCount = 0;
    if (isInHouse) letPetOut();
  }
});

// Handle pet actions from context menu
if (window.electronAPI.onPetAction) {
  window.electronAPI.onPetAction((action) => {
    switch (action) {
      case 'dance':
        if (isInHouse) letPetOut();
        triggerDance();
        break;
      case 'sleep':
        enterDeepSleep();
        break;
      case 'wake':
        isDeepSleeping = false;
        if (isInHouse) letPetOut();
        else if (isRoaming) stopRoaming();
        else setState(PetState.IDLE);
        break;
      case 'send-home':
        sendPetHome();
        break;
      case 'let-out':
        letPetOut();
        break;
      case 'roam':
        if (isRoaming) stopRoaming();
        else startRoaming();
        break;
    }
  });
}

// ===== Cat House Functions =====
function sendPetHome() {
  if (isInHouse || currentState === PetState.GOING_HOME) return;
  if (isRoaming) stopRoaming();
  setState(PetState.GOING_HOME);
}

function letPetOut() {
  if (!isInHouse) return;
  isInHouse = false;
  catHouse.classList.remove('has-pet');
  petContainer.style.display = '';
  petContainer.style.zIndex = '9999';

  // Position pet at house location, offset slightly to the side
  petX = houseX - 60;
  petY = houseY;
  renderPetPosition();

  // Reset state — will start following cursor
  currentState = null;
  setState(PetState.IDLE);
  showSpeech('~(=^‥^)ノ', 2000);
}

function showHouseSpeech(text, duration = 8000) {
  houseSpeechText.textContent = text;
  houseSpeech.classList.remove('hidden');
  setTimeout(() => houseSpeech.classList.add('hidden'), duration);
}

// ===== Free Roam Mode =====
let longPressTimer = null;
const LONG_PRESS_FOR_ROAM = 2000;

function startRoaming() {
  if (isInHouse) letPetOut();
  isRoaming = true;

  // Drop with gravity first
  velocityY = 0;
  const dropInterval = setInterval(() => {
    velocityY += ROAM_GRAVITY;
    petY += velocityY;
    const maxY = displayBounds.y + displayBounds.height - 50;
    if (petY >= maxY) {
      petY = maxY;
      velocityY = 0;
      clearInterval(dropInterval);
      setState(PetState.ROAMING);
      startRoamBehavior();
    }
    renderPetPosition();
  }, 16);
}

function startRoamBehavior() {
  clearInterval(roamTimer);
  roamTimer = setInterval(() => {
    if (currentState !== PetState.ROAMING) return;

    // Random action: wander, sit, sleep, or dance
    const action = Math.random();
    if (action < 0.5) {
      // Wander to random position on bottom of screen
      const maxY = displayBounds.y + displayBounds.height - 50;
      roamTarget = {
        x: 100 + Math.random() * (displayBounds.width - 200),
        y: maxY - Math.random() * 50,
      };
    } else if (action < 0.7) {
      // Sit for a while
      roamTarget = null;
      pet.className = 'state-sitting';
      if (facingLeft) pet.classList.add('facing-left');
      setTimeout(() => {
        if (isRoaming && currentState !== PetState.IN_HOUSE) {
          pet.className = 'state-roaming';
          if (facingLeft) pet.classList.add('facing-left');
        }
      }, 3000);
    } else if (action < 0.85) {
      // Nap
      roamTarget = null;
      pet.className = 'state-sleeping';
      if (facingLeft) pet.classList.add('facing-left');
      setTimeout(() => {
        if (isRoaming && currentState !== PetState.IN_HOUSE) {
          pet.className = 'state-roaming';
          if (facingLeft) pet.classList.add('facing-left');
        }
      }, 5000);
    } else {
      // Dance
      roamTarget = null;
      pet.className = 'state-dancing';
      if (facingLeft) pet.classList.add('facing-left');
      setTimeout(() => {
        if (isRoaming && currentState !== PetState.IN_HOUSE) {
          pet.className = 'state-roaming';
          if (facingLeft) pet.classList.add('facing-left');
        }
      }, 3000);
    }
  }, ROAM_CHANGE_INTERVAL);
}

function stopRoaming() {
  isRoaming = false;
  roamTarget = null;
  clearInterval(roamTimer);
  clearTimeout(roamActionTimer);
  currentState = null;
  setState(PetState.IDLE);
}

// ===== Grab & Fling Interactions =====
let grabStartTime = 0;
let grabDelayTimer = null;
let pendingGrabEvent = null;
let isDraggingDeepSleepingPet = false;

let tapCount = 0;
let tapTimer = null;
const GRAB_DELAY = 200;
const DOUBLE_TAP_WINDOW = 350;

pet.addEventListener('mousedown', (e) => {
  if (e.button === 2) return;
  e.stopPropagation();
  e.preventDefault();

  isDraggingDeepSleepingPet = currentState === PetState.SLEEPING && isDeepSleeping;

  if (currentState === PetState.FLUNG) {
    clearTimeout(flingReturnTimer);
    flingLanded = false;
    pet.style.transform = '';
  }

  isApproached = true;
  clearTimeout(hoverTimer);
  window.electronAPI.setIgnoreMouse(false);

  grabStartTime = Date.now();
  pendingGrabEvent = { x: e.clientX, y: e.clientY };
  mouseHistory = [{ x: e.clientX, y: e.clientY, t: performance.now() }];

  // Long press for roam mode (2s)
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(() => {
    if (pendingGrabEvent && !isGrabbed) {
      pendingGrabEvent = null;
      clearTimeout(grabDelayTimer);
      if (isRoaming) stopRoaming();
      else startRoaming();
    }
  }, LONG_PRESS_FOR_ROAM);

  clearTimeout(grabDelayTimer);
  grabDelayTimer = setTimeout(() => {
    if (pendingGrabEvent) {
      isGrabbed = true;
      grabOffsetX = petX - pendingGrabEvent.x;
      grabOffsetY = petY - pendingGrabEvent.y;
      if (!isDraggingDeepSleepingPet) setState(PetState.GRABBED);
      pendingGrabEvent = null;
      clearTimeout(longPressTimer); // Cancel roam if grabbed
    }
  }, GRAB_DELAY);
});

document.addEventListener('mouseup', (e) => {
  clearTimeout(longPressTimer);

  if (pendingGrabEvent && !isGrabbed) {
    clearTimeout(grabDelayTimer);
    pendingGrabEvent = null;
    mouseHistory = [];
    handleTap();
    isDraggingDeepSleepingPet = false;
    return;
  }

  if (!isGrabbed) return;
  isGrabbed = false;

  // If was roaming, stop roaming on release
  if (isRoaming) stopRoaming();

  // Check if pet was dropped on the cat house
  const houseRect = catHouse.getBoundingClientRect();
  if (!isDraggingDeepSleepingPet &&
      petX > houseRect.left && petX < houseRect.right &&
      petY > houseRect.top && petY < houseRect.bottom) {
    // Drop pet into house!
    velocityX = 0;
    velocityY = 0;
    petX = houseX;
    petY = houseY;
    renderPetPosition();
    setState(PetState.IN_HOUSE);
    mouseHistory = [];
    return;
  }

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
    isDeepSleeping = false;
    velocityX = flingVX * 1.5;
    velocityY = flingVY * 1.5;
    setState(PetState.FLUNG);
    showSpeech(t('flung'), 2000);
  } else if (!isDraggingDeepSleepingPet) {
    setState(PetState.IDLE);
    isApproached = false;
  } else {
    velocityX = 0;
    velocityY = 0;
    isApproached = false;
  }

  isDraggingDeepSleepingPet = false;
  mouseHistory = [];
});

function handleTap() {
  if (isDeepSleeping) return;
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

function triggerDance() {
  setState(PetState.DANCING);
  clearTimeout(danceTimer);
  danceTimer = setTimeout(() => {
    danceTimer = null;
    if (isRoaming) {
      setState(PetState.ROAMING);
    } else {
      setState(PetState.IDLE);
    }
    isApproached = false;
  }, 3000);
}

// ===== Speech Bubble =====
const speechBubble = document.getElementById('speech-bubble');
const speechText = document.getElementById('speech-text');
const speechActions = document.getElementById('speech-actions');
const speechContent = document.getElementById('speech-content');
let speechTimer = null;
let lastSpeechResponse = '';

function showSpeech(text, duration = 0, showActions = false) {
  // If in house, show from house instead
  if (isInHouse) {
    showHouseSpeech(text, duration || 8000);
    return;
  }

  speechText.textContent = text;
  speechBubble.classList.remove('hidden');
  if (showActions) {
    speechActions.classList.remove('hidden');
    lastSpeechResponse = text;
  } else {
    speechActions.classList.add('hidden');
  }
  clearTimeout(speechTimer);
  if (duration > 0) {
    speechTimer = setTimeout(hideSpeech, duration);
  }
  setTimeout(() => {
    speechContent.scrollTop = speechContent.scrollHeight;
  }, 50);
}

function updateSpeech(text) {
  speechText.textContent = text;
  lastSpeechResponse = text;
  speechContent.scrollTop = speechContent.scrollHeight;
}

function hideSpeech() {
  speechBubble.classList.add('hidden');
  speechActions.classList.add('hidden');
  clearTimeout(speechTimer);
}

// Speech bubble action buttons
document.getElementById('btn-copy').addEventListener('click', () => {
  window.electronAPI.copyToClipboard(lastSpeechResponse);
  showSpeech(t('copySuccess'), 1500);
});

document.getElementById('btn-send-claude').addEventListener('click', () => {
  window.electronAPI.openClaudeSession(lastSpeechResponse);
});

// Make speech bubble interactive for scrolling
speechBubble.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false);
});
speechBubble.addEventListener('mouseleave', () => {
  if (!isChatOpen) {
    window.electronAPI.setIgnoreMouse(true);
  }
});

// ===== Floating Notification System =====
function showFloatingNotification(data) {
  // Don't show if task was dismissed
  if (data.taskId && dismissedTasks.has(data.taskId)) return;

  // Queue if already showing a notification
  if (activeNotif) {
    notifQueue.push(data);
    return;
  }

  activeNotif = data;
  notifText.textContent = data.message;

  // Update button labels
  document.getElementById('notif-show').textContent = t('notifShow');
  document.getElementById('notif-later').textContent = t('notifLater');
  document.getElementById('notif-dismiss').textContent = t('notifDismiss');

  // Position near cursor
  floatingNotif.style.left = `${rawCursorX + 20}px`;
  floatingNotif.style.top = `${rawCursorY - 60}px`;
  floatingNotif.classList.remove('hidden');

  // Make clickable
  window.electronAPI.setIgnoreMouse(false);
}

function hideFloatingNotification() {
  floatingNotif.classList.add('hidden');
  activeNotif = null;

  // Show next in queue
  if (notifQueue.length > 0) {
    setTimeout(() => showFloatingNotification(notifQueue.shift()), 500);
  } else {
    window.electronAPI.setIgnoreMouse(true);
  }
}

// Notification button handlers
document.getElementById('notif-show').addEventListener('click', () => {
  // "Show me" — let pet out if in house, stop roaming, go back to following
  if (isInHouse) letPetOut();
  if (isRoaming) stopRoaming();

  // Show full message in speech bubble
  if (activeNotif) {
    showSpeech(activeNotif.fullMessage || activeNotif.message, 15000, true);
  }
  hideFloatingNotification();
});

document.getElementById('notif-later').addEventListener('click', () => {
  // "Later" — snooze, re-show after configured duration
  const data = { ...activeNotif };
  hideFloatingNotification();
  setTimeout(() => {
    showFloatingNotification(data);
  }, snoozeDuration);
});

document.getElementById('notif-dismiss').addEventListener('click', () => {
  // "Go away" — dismiss permanently for this task
  if (activeNotif && activeNotif.taskId) {
    dismissedTasks.add(activeNotif.taskId);
  }
  hideFloatingNotification();
});

// Make notification interactive
floatingNotif.addEventListener('mouseenter', () => {
  window.electronAPI.setIgnoreMouse(false);
});
floatingNotif.addEventListener('mouseleave', () => {
  if (!isChatOpen && !activeNotif) {
    window.electronAPI.setIgnoreMouse(true);
  }
});

// ===== Settings changed listener =====
if (window.electronAPI.onSettingsChanged) {
  window.electronAPI.onSettingsChanged((settings) => {
    if (settings.walkSpeed !== undefined) {
      SPRING = 0.0006 + (settings.walkSpeed / 100) * 0.0138;
    }
    if (settings.language) {
      setLanguage(settings.language);
    }
    if (settings.petSize) {
      pet.style.width = `${settings.petSize}px`;
      pet.style.height = `${Math.round(settings.petSize * 1.11)}px`;
    }
    if (settings.snoozeDuration !== undefined) {
      snoozeDuration = settings.snoozeDuration * 60 * 1000;
    }
  });
}

// ===== Initialize =====
async function initPet() {
  await initDisplayBounds();

  petX = displayBounds.width / 2;
  petY = displayBounds.height - 150;

  cursorStoppedX = petX;
  cursorStoppedY = petY - OFFSET_Y;
  lastCursorMoveTime = 0;

  renderPetPosition();

  updateHousePosition();

  requestAnimationFrame(updatePosition);
  setInterval(updateCursorPosition, 50);
  resetSleepTimer();

  setTimeout(() => showSpeech(t('greeting'), 4000), 1000);
}

// Expose globals
window.PetState = PetState;
window.setState = setState;
window.showSpeech = showSpeech;
window.updateSpeech = updateSpeech;
window.hideSpeech = hideSpeech;
window.petX = () => petX;
window.petY = () => petY;
window.lastSpeechResponse = () => lastSpeechResponse;
window.showFloatingNotification = showFloatingNotification;
window.isInHouse = () => isInHouse;
window.isRoaming = () => isRoaming;
window.isDeepSleeping = () => isDeepSleeping;

let isChatOpen = false;
window.setIsChatOpen = (v) => { isChatOpen = v; };

initPet();
