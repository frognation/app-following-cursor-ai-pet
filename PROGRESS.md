# Wooni (우니) - AI Desktop Pet

커서를 따라다니는 AI 펫 데스크탑 앱. 음성/텍스트로 질문하면 Claude Code CLI를 통해 답변.

## Tech Stack
- **Electron** - 투명 오버레이 데스크탑 앱 (macOS)
- **HTML/SVG/CSS** - 펫 캐릭터 렌더링 & 애니메이션
- **Web Speech API** - 음성 인식 (웨이크워드 + STT)
- **Claude Code CLI** - AI 질문-응답 (`claude -p`)

## 시작하기

```bash
npm install
npm start
```

## 파일 구조

```
├── main.js              # Electron 메인 프로세스 (투명 윈도우, IPC, Claude CLI 연동)
├── preload.js           # IPC bridge (contextBridge)
├── package.json
├── .gitignore
├── assets/
│   └── wooni-character.svg  # Figma 편집용 독립 SVG 에셋
├── renderer/
│   ├── index.html       # 메인 HTML (인라인 SVG 캐릭터)
│   ├── style.css        # 상태별 CSS 애니메이션 (idle, walking, dancing, grabbed, flung 등)
│   ├── pet.js           # 펫 로직 (커서 따라가기, 물리엔진, 잡기/던지기, 클릭 인터랙션)
│   ├── voice.js         # 음성 인식 (웨이크워드 "우니야" + STT)
│   ├── chat.js          # 채팅 UI & Claude Code CLI 연동
│   └── settings.html    # 설정 화면 (이름, 웨이크워드, 크기 등)
```

## 구현 완료 기능

### 1. 캐릭터 & 애니메이션
- [x] SVG 고양이 캐릭터 (몸, 팔, 다리, 꼬리, 귀, 수염, 코, 볼터치)
- [x] 상태별 CSS 애니메이션: idle, walking, sitting, dancing, listening, talking, sleeping, grabbed, flung
- [x] X눈 (기절 눈) - 잡혔을 때 / 던져졌을 때
- [x] 방향 전환 (좌우 flip)

### 2. 커서 따라가기
- [x] Spring 물리 기반 부드러운 이동 (느린 속도: SPRING=0.012)
- [x] 커서 오른쪽 아래에 오프셋 위치 (OFFSET_X=60, OFFSET_Y=50)
- [x] 화면 오른쪽 끝 → 자동으로 왼쪽으로 전환
- [x] 마우스 호버 2초 후 미클릭 시 오프셋 위치로 자동 후퇴

### 3. 인터랙션
- [x] **싱글 클릭** (< 200ms): 춤추기 (3초)
- [x] **더블 클릭**: 텍스트 채팅창 열기
- [x] **길게 누르기** (> 200ms): 잡기 (X눈 + 찌그러짐)
- [x] **잡은 상태에서 빠르게 놓기**: 그 방향으로 날아감 (회전 + 팔다리 허우적)
- [x] 화면 가장자리 바운스, 중력 적용
- [x] 착지 후 1.5초 기절 → 회복 후 다시 커서 따라옴

### 4. 음성 인식 (voice.js)
- [x] Web Speech API 상시 대기
- [x] 웨이크워드 "우니야" / "wooniya" 감지
- [x] 감지 후 listening 상태 → 음성 질문 STT → Claude Code로 전송
- [x] 단축키 Cmd+Shift+U 로도 즉시 활성화

### 5. Claude Code CLI 연동
- [x] `child_process.spawn('claude', ['-p', question])` 으로 호출
- [x] stdout 스트리밍으로 실시간 응답 표시
- [x] 말풍선 UI로 답변 표시
- [x] 60초 타임아웃

### 6. 채팅 UI (chat.js)
- [x] 더블클릭으로 입력창 표시
- [x] Enter로 전송, Esc로 닫기
- [x] Claude Code 응답을 말풍선에 표시

### 7. 설정 (settings.html)
- [x] 펫 이름 (기본: 우니)
- [x] 웨이크워드 변경
- [x] 영문 웨이크워드 변경
- [x] 음성 인식 on/off
- [x] 펫 크기 조절
- [x] 기어 아이콘으로 접근 (펫 호버 시 표시)

## Figma 에셋 워크플로
- `assets/wooni-character.svg` → Figma에 드래그&드롭으로 임포트
- Figma 파일: https://www.figma.com/design/VEzdTdEfFK2YsLOtkPSRai/Wooni-pet-claoude
- 각 부위가 id로 이름 지정 (body, arm-left, ear-right, face 등)
- Figma에서 수정 후 → Claude Code에 "우니 디자인 반영해줘" → Figma MCP로 읽어서 코드 업데이트

## 다음 작업 (TODO)
- [ ] 설정 변경이 메인 윈도우에 실시간 반영되도록 IPC 연동
- [ ] 화면 캡처 기능 (desktopCapturer) → "이거 뭐야?" 질문 지원
- [ ] TTS (Text-to-Speech)로 음성 답변
- [ ] 트레이 아이콘 & 메뉴
- [ ] 앱 패키징 (electron-builder)
- [ ] 펫 커스텀 스킨 시스템
- [ ] 감정 상태 시스템 (기분에 따라 다른 반응)
