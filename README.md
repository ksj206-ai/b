# 🌱 손목 정원 (Wrist Garden)

> 컴퓨터·스마트폰을 많이 쓰는 현대인을 위한 **데일리 손목 웰니스 루틴 웹앱**.
> 짧은 운동 루틴 · 웹캠 기반 손목 체크 · 미니게임을 하나로 묶어, 바쁜 일상에서도
> 쉽고 재미있게 손목 건강을 돌보게 합니다.

설치·회원가입 없이 브라우저에서 바로 실행됩니다. 영상은 저장하지 않고 **좌표·수치만**
로컬(`localStorage`)에 남겨 개인정보를 보호합니다.

> ⚠️ 본 서비스는 의료기기가 아니며 질병의 진단·치료 목적이 아닙니다.
> 통증이 있거나 질환이 의심되면 의사와 상담하세요. 체크값은 참고용 자가 수치입니다.

---

## ✨ 핵심 기능 (3축 구조)

| 축 | 설명 | 상태 |
|---|---|---|
| 🎬 **오늘의 루틴** (메인, 매일) | 일러스트 손이 시범을 보이고, 웹캠 인식으로 따라하기 회수를 세어 줍니다. 매일 동일한 풀코스 6종, 1~3분 숏폼 연속 재생. | ✅ 구현 (인식 가시화·판정 개선 포함) |
| 📏 **손목 체크** (가끔) | 웹캠 + AI 손 인식으로 손목 굽힘·폄 최대각을 재고 기록·비교합니다. 주 1회 "제안" 칩. | ✅ 구현 (왼/오른손 구분 기록 + 굽힘/폄 추이) |
| 🎮 **게임** (보조) | 운동 동작을 활용한 미니게임으로 지루함을 덜어 줍니다. | ⏳ 이식 예정 (홈에서 카드 숨김) |

---

## 🚀 실행 방법

ES modules + 웹캠(`getUserMedia`) + CDN 모듈을 쓰기 때문에 **로컬 웹서버(http)** 로 열어야
합니다. `file://` 로 열면 카메라와 모듈 로딩이 차단됩니다. `localhost` 는 보안 컨텍스트라
카메라가 정상 동작합니다.

### 방법 A — Python (설치된 Python 사용)
```bash
cd wrist-garden
python -m http.server 5500
# 브라우저에서 http://localhost:5500/ 접속
```

### 방법 B — VS Code Live Server 확장
`index.html` 우클릭 → **Open with Live Server** (기본 `http://127.0.0.1:5500`).

> 최초 접속 시 카메라 권한을 허용하세요. MediaPipe 모델은 CDN에서 내려받으므로
> 인터넷 연결이 필요합니다.

---

## 🧭 사용 흐름

```
접속 → 홈: 오늘의 루틴 진행 점(●●○○○○) + 시작/이어하기/완료 버튼, 알림 칩
 → 🎬 오늘의 루틴: 원탭 시작 → 시범 따라하기(회수 자동 카운트, 6종 연속 재생)
                  → 컨디션 한 번 탭 → 스트릭 반영 (중간에 끝내도 그날 인정)
 → 📏 손목 체크: 손 선택(왼/오른) → 중립 캘리브레이션 → 굽힘·폄 최대각 기록
 → 📈 기록: 굽힘/폄 추이 차트 · 최근 7일 컨디션 · 데일리 루틴 · 운동 기록
```

---

## 🗂️ 프로젝트 구조

모듈 분리(ES modules) 설계. 상수는 `config.js` 한 곳에 모읍니다.

```
wrist-garden/
├── index.html                # 진입 HTML (홈 / 오늘의 루틴 / 손목 체크 / 기록 화면)
├── css/
│   └── styles.css            # 디자인 토큰 + 전 화면 스타일 (둥글둥글·친근 테마, 960px+ 와이드 대응)
├── js/
│   ├── main.js               # 진입점: UI 초기화 + 화면별 컨트롤러 지연 로드
│   ├── config.js             # 전역 상수 단일 출처 (MediaPipe·스무딩·ROM 판정값·DEBUG_GUIDE 등)
│   ├── ui.js                 # 화면 전환 라우터 ([data-nav])
│   ├── store.js              # localStorage 저장/조회 + 스트릭(주 1회 프리즈)
│   ├── routine.js            # 오늘의 루틴 구성·진행 (매일 동일 풀코스 6종 + 체크 제안)
│   ├── reminder.js           # 손목 리마인더 알림 (Notification — 탭 켜짐 필요)
│   ├── tracking.js           # 손 인식 (MediaPipe 초기화·카메라·감지 루프)
│   ├── measurement.js        # 지표 계산·스무딩·rel·보상동작·ROM 측정
│   ├── sky.js                # 밤하늘 화면 (별자리 성장 시각화)
│   ├── constellations.js     # 별자리 데이터
│   ├── *.test.mjs            # 단위·통합 테스트 (node --test)
│   ├── guide/
│   │   ├── guideData.js      # 운동 콘텐츠(GUIDES) — 데이터만 추가하면 운동 추가
│   │   ├── guideHand.js      # 파라미터로 조종하는 벡터 손 그리기 (side/front)
│   │   ├── animPlayer.js     # 키프레임 보간 + 이징 재생 (무한 반복)
│   │   └── stepEngine.js     # 스텝 진행·인식 카운트·판정기(detector)
│   └── games/
│       └── README.md         # 미니게임 이식 매핑 메모
└── docs/                     # 기획·설계 문서 (목차: docs/README.md)
```

📚 설계 문서는 [`docs/`](docs/README.md)에 모아 두었습니다.

---

## 🧩 모듈 설명

### `config.js` — 상수 단일 출처
MediaPipe 모델 URL/옵션, 카메라 설정, 손·포즈 랜드마크 인덱스, 스무딩 프로파일
(`live` / `measure`), 보상동작 임계(`COMP_TH`), ROM 판정값(`holdMs`, `stableBand`,
`minExt`, `rearm` 등)을 모두 보관합니다. 프로토타입의 **검증된 값**을 원본 위치 주석과
함께 이식했습니다.

> 🐛 `DEBUG_GUIDE = true`로 바꾸면 가이드 인식 진단 로그(`[guide-diag]`/`[flexExt]` —
> 손 라벨·상대각·판정 임계 통과)가 콘솔에 출력됩니다. 평소엔 `false`로 조용합니다.

### `tracking.js` — 인식 전담
- `initModels()` — vision_bundle 동적 import → HandLandmarker / PoseLandmarker 로딩
- `startCamera(video)` — `getUserMedia` 로 카메라 연결
- `startLoop(onFrame, {pose})` — `requestAnimationFrame` 루프. `video.currentTime` 이
  바뀔 때만 추론(중복 방지). 매 프레임 `onFrame({hand, pose, handLabel, now, dt})` 호출
- `stopTracking()` — 루프·카메라 정지

### `measurement.js` — 측정 전담 (순수/상태)
- 헬퍼: `norm` / `median` / `ang` / `dist` / `clamp` / `pushN`
- `fingerMetrics(hand)` → `grip`, `spread`, `tipMCP`, `pinch` (손바닥 크기로 정규화)
- `createWristTracker(profile)` — 손목각 → median 버퍼 → 지수평활 → `rel`(중립 기준) →
  `comp`(팔꿈치·어깨 이동량으로 보상동작 감지). `beginNeutral()` / `commitNeutral()`
- `createRomMeasurer()` — 끝범위를 일정 시간 유지하면 좌우 최대각을 자동 저장

### `routine.js` — 오늘의 루틴
- **매일 동일한 풀코스 6종, 고정 순서** — 로테이션·커스터마이징 없음
  ("고민할 것이 없어야 매일 한다"). 어제 컨디션이 "뻐근해요"였으면
  다음 날은 순한 3종 코스를 제안.
- `store.routine`에 `{ v, date, ids, gentle, doneIds, suggestMeasure, completedAt }` 캐시.
- **관대한 판정**: 중간에 끝내도 그날 활동으로 인정 — 스트릭은 운동 1개면 유지,
  풀코스 완주(6/6)는 ⭐ 추가 축하일 뿐. 스트릭은 주 1회 자동 프리즈로
  하루 공백에도 이어집니다(`store.js`).
- 체크는 7일 주기 **"제안" 칩**만. 체크값(measurements)은 루틴 구성 분기에
  사용하지 않음(웰니스 판단기준 — 판정+처방 구조 금지).

### `reminder.js` — 손목 리마인더
- 프리셋(오전 업무 중 10:30 등 4종)/직접 입력으로 **하루 최대 3회**.
  설정 후엔 홈의 "⏰ 시간 알림 · 변경" 칩이 유일한 입구.
- 오늘 루틴을 이미 완주했으면 남은 알림은 조용히 스킵. 권한은 한 번만 요청.
- ⚠ `setInterval` 기반이라 **탭이 켜져 있을 때만** 동작 — 백그라운드 푸시는
  향후 PWA(Service Worker + Push) 과제.

### 가이드 모듈 (`js/guide/`)
- **`guideData.js`** — 운동 = `{id, name, view, steps[]}`. 스텝 타입은
  `intro`(자동) / `follow`(인식 카운트) / `outro`(자동). 애니메이션은
  `anim: [[시간(s), {파라미터}], ...]` 키프레임.
- **`guideHand.js`** — 손을 이미지가 아니라 **파라미터 인형**으로 그림.
  `wristAngle`, `devAngle`, `curl`, `curlTip`, `spread`, `pinchGap`.
  `side`(굽힘·폄) / `front`(편위·손가락·핀치) 2뷰.
- **`animPlayer.js`** — 매끄러움 3원칙: ① 절대시간 ② `easeInOut` ③ 홀드 구간.
  키프레임을 파라미터별 트랙으로 분리해 부분 지정을 지원.
- **`stepEngine.js`** — 스텝 진행 + 판정기(detector). 판정기는 `measurement.js` 의
  지표를 재사용:

  | detect 키 | 판정 |
  |---|---|
  | `flexExt` | `rel` 굽힘·폄 왕복 1세트 = 1회 (폄 목표는 낮게, 2D 한계) |
  | `deviation` | `rel` 요측·척측 왕복 |
  | `tendonGlide` | `grip`/`tipMCP` 로 쫙→갈고리→주먹 순서 통과 |
  | `pinchHold` | `pinch<0.34` 유지 |
  | `gripHold` | 중립 + `grip<1.2` 유지 |

  UX 원칙: 시범과 카운트 **독립**(박자 강요 없음), 목표 각도 **관대**,
  **15초 인식 0 → 탈출구**. 보상동작(comp)은 카운트를 막지 않고 세션 비율만
  집계합니다(추후 코칭 힌트용).

  인식 신뢰 장치:
  - **인식 가시화** — 카메라 PiP에 손 감지 칩(회색/초록, 히스테리시스) +
    관절점 오버레이(거울·크롭 보정), 회수 인정 순간 점 팝 + 테두리 플래시
  - **판정 좌표계** — 가이드는 화면 기준 절대각 왕복 감지(usePose 미사용)라
    왼손/오른손 어느 쪽이든 동일하게 동작(거울상 무관, 실측 검증)
  - **중립 견고화** — 손이 보이는 프레임이 충분히 모여야 기준각 확정

---

## 🎨 디자인

- 컨셉: **정원 가꾸기** 메타포, 마스코트 **새싹이** 🌱
- 폰트: Black Han Sans(제목) · Jua(UI)
- 톤: 이끼 그린 + 따뜻한 크림/피치, 완전 둥근 모서리, 말랑한 모션

---

## 🛠️ 기술 스택

- 순수 HTML/CSS/JS (빌드 도구 없음), **ES modules**
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe) — Hand/Pose Landmarker (온디바이스)
- Canvas 2D — 가이드 손 애니메이션
- `localStorage` — 체크·운동 기록 (영상 미저장)

---

## 📌 개발 현황 & 로드맵

- [x] **1단계** — 모듈 뼈대 + 홈 화면 + 친근 테마·마스코트
- [x] **2단계** — tracking 이식 (MediaPipe 인식 + 지표·ROM 측정 로직)
- [x] **3단계** — 가이드 모듈 (손 그리기 · 애니메이션 · 스텝 엔진 · flexExt 완성)
- [x] **4단계** — 정식 손목 체크 UX(왼/오른손 구분) + 기록·추이 리포트(스트릭·프리즈)
- [x] **5단계** — 데일리 루틴 (풀코스 6종 · 원탭 시작 · 연속 재생 · 체크 제안 칩) + 리마인더 알림
- [x] **6단계** — 홈 재구성 (3초 시작 + 루틴은 매일·체크는 가끔 리듬) · "측정"→"손목 체크" 명칭 정리 · 데스크톱 와이드 레이아웃
- [x] **7단계** — 시범 손 리디자인 (측면 2겹 손가락 · 주먹 접힘 · 엄지 분리 레이어)
- [x] **8단계** — 가이드 인식 개선 (감지 칩·랜드마크 오버레이·회수 피드백 + 절대각 판정·중립 견고화·관대한 comp)
- [ ] **9단계** — 미니게임 이식 (두더지·수확·러너 등) *(마지막 — 홈에서 카드 숨김 상태)*

> 각 단계 로직은 검증된 프로토타입(`wrist-garden_32.html`)에서 이식합니다.

---

## 🔒 개인정보 · 규제

- 웹캠 영상은 저장/전송하지 않으며, 좌표에서 계산한 수치만 로컬에 남습니다.
- 식약처 「의료기기와 개인용 건강관리(웰니스) 제품 판단기준」상 **웰니스 제품**으로 설계
  (진단·치료·처방 표현 배제, 각 운동에 "통증 시 즉시 중단" 안내).
