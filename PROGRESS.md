# Wooni (우니) - AI Desktop Pet

A cursor-following AI pet desktop app. Ask questions via voice/text and get answers through Claude Code CLI.

## Tech Stack
- **Electron** - Transparent overlay desktop app (macOS, multi-monitor)
- **HTML/SVG/CSS** - Pet character rendering & animation
- **Web Speech API** - Voice recognition (wake word + STT) + TTS
- **Claude Code CLI** - AI Q&A (`claude -p`)

## Getting Started

```bash
npm install
npm start
```

## File Structure

```
├── main.js              # Electron main process (multi-monitor window, IPC, Claude CLI, context menu, session monitor)
├── preload.js           # IPC bridge (contextBridge)
├── package.json
├── .gitignore
├── assets/
│   └── wooni-character.svg  # Standalone SVG asset for Figma editing
├── renderer/
│   ├── index.html       # Main HTML (inline SVG character)
│   ├── style.css        # State-based CSS animations (idle, walking, dancing, grabbed, flung, etc.)
│   ├── i18n.js          # Internationalization (English default + Korean)
│   ├── pet.js           # Pet logic (delayed cursor following, physics, grab/fling, right-click menu, face shift)
│   ├── voice.js         # Voice recognition (wake word + STT)
│   ├── chat.js          # Chat UI & Claude Code CLI integration
│   ├── monitor.js       # Claude Code session progress monitor + TTS notifications
│   ├── usage.js         # Claude/Codex paid-plan usage panel beside the cat house
│   └── settings.html    # Settings (language, speed, TTS, monitoring, etc.)
```

## Completed Features

### 1. Character & Animation
- [x] SVG cat character (body, arms, legs, tail, ears, whiskers, nose, blush)
- [x] State-based CSS animations: idle, walking, sitting, dancing, listening, talking, sleeping, grabbed, flung
- [x] Dizzy X-eyes when grabbed/flung
- [x] Direction flip (left/right)
- [x] **Realistic 4-phase walking gait** (diagonal leg pattern like real cats)
- [x] **Face features shift toward walking direction** (eyes, nose, mouth, whiskers, ears)
- [x] **Back legs** added for more realistic appearance

### 2. Cursor Following
- [x] Spring physics-based smooth movement
- [x] **3-4 second delay** before following cursor (follows where cursor stopped)
- [x] **3x slower speed** than original (SPRING: 0.004 vs 0.012)
- [x] Cursor offset position (right-bottom offset)
- [x] Auto left-side when near right screen edge
- [x] Auto retreat to offset after 2s hover without click

### 3. Interactions
- [x] **Single click** (< 200ms): Dance (3s)
- [x] **Double click**: Open text chat
- [x] **Long press** (> 200ms): Grab (X-eyes + squish)
- [x] **Quick release while grabbed**: Fling in that direction (spin + flailing)
- [x] Screen edge bounce, gravity applied
- [x] 1.5s dizzy after landing → recovers and follows again
- [x] **Right-click**: Context menu (Settings, Dance, Sleep, Wake, Quit)

### 4. Voice Recognition (voice.js)
- [x] Web Speech API always listening
- [x] Wake word "wooni" / "wooniya" / "우니야" detection
- [x] After detection → listening state → STT → sends to Claude Code
- [x] Shortcut Cmd+Shift+U for instant activation

### 5. Claude Code CLI Integration
- [x] `child_process.spawn('claude', ['-p', question])` call
- [x] stdout streaming for real-time response display
- [x] Speech bubble UI for answers
- [x] 60s timeout
- [x] **Copy to clipboard** button on answers
- [x] **Send to Claude Code** new session button

### 6. Chat UI (chat.js)
- [x] Double-click to show input
- [x] Enter to send, Esc to close
- [x] Show Claude Code response in speech bubble
- [x] **Wider speech bubble** (480px max) with proper scrolling

### 7. Settings (settings.html)
- [x] **Language selection** (English default, Korean)
- [x] Pet name
- [x] Wake word / Alt wake word
- [x] Voice recognition on/off
- [x] Pet size slider
- [x] **Walking speed control** (slow ↔ fast)
- [x] **TTS on/off, volume, mute**
- [x] **Session monitoring toggles** (progress/completion notifications)
- [x] **Claude/Codex usage panel toggles** (overall + provider-specific)
- [x] **Right-click to open** (no more hover gear icon)
- [x] Settings sync via IPC (real-time updates)

### 8. Multi-Monitor Support
- [x] Window spans all connected displays
- [x] Character can move across monitors
- [x] Dynamic display change detection
- [x] Proper edge clamping across full display bounds

### 9. Session Monitoring (monitor.js)
- [x] Watches `~/.claude/projects/` for active Claude Code sessions
- [x] Detects progress updates and task completions
- [x] Speech bubble notifications with "Meow!" prefix/suffix
- [x] **TTS announcements** (Meow! [message] Meow!)
- [x] Configurable in settings (enable/disable, progress/completion)
- [x] Cute high-pitched TTS voice

### 10. Internationalization (i18n.js)
- [x] English as default language
- [x] Full Korean translation
- [x] All UI strings localized
- [x] Language switch in settings

### 11. Paid AI Usage Panel (usage.js)
- [x] Compact Claude Code and Codex usage display beside the cat house
- [x] Claude 5-hour and weekly limits via the official Claude CLI `/usage` output
- [x] Codex limits via the official local app-server rate-limit API
- [x] Live reset countdowns, warning colors, and manual refresh
- [x] Automatic CLI re-discovery and retry after Claude/Codex updates
- [x] Immediate refresh when the app regains focus or network connectivity
- [x] Show/hide from Settings or the pet/house right-click menu
- [x] Per-provider toggles without reading auth files or Keychain credentials directly

## Figma Asset Workflow
- `assets/wooni-character.svg` → Drag & drop into Figma
- Figma file: https://www.figma.com/design/VEzdTdEfFK2YsLOtkPSRai/Wooni-pet-claoude
- Each part named with id (body, arm-left, ear-right, face, etc.)
- Edit in Figma → tell Claude Code "update Wooni design" → reads via Figma MCP → updates code

## TODO
- [ ] Screen capture feature (desktopCapturer) → "What's this?" question support
- [ ] Tray icon & menu
- [ ] App packaging (electron-builder)
- [ ] Pet custom skin system
- [ ] Emotion state system (different reactions based on mood)
