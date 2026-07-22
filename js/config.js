// ═══════════════════════════════════════════════════════════
// config.js — 앱 전역 상수 (단일 출처)
// tracking/measurement 상수는 프로토타입(wrist-garden_32.html)의
// 검증된 값을 그대로 이식. 각 상수 옆에 원본 위치를 주석으로 남긴다.
// ═══════════════════════════════════════════════════════════

// ─── 앱 메타 ───
export const APP = {
  name: '오늘의 별자리',
  version: '0.2.0',
};

// ─── 화면 ID ───
export const SCREENS = {
  HOME: 'home',
  GUIDE: 'guide',
  MEASURE: 'measure',
  GAME: 'game',
  RECORDS: 'records',
  SKY: 'sky',        // 밤하늘 도감 (완성한 별자리 수집)
};
export const DEFAULT_SCREEN = SCREENS.HOME;

// ─── 스테이지 좌표계 (원본 L368) ───
export const STAGE = {
  W: 960,
  H: 540,
  groundY: 348,
};

// ─── MediaPipe 설정 (원본 L365, L1227~1229) ───
export const MEDIAPIPE = {
  // vision_bundle: HandLandmarker/PoseLandmarker/FilesetResolver 제공
  // 버전 고정(@latest 금지): latest 자동 업데이트로 배포본이 갑자기 깨지는 것 방지.
  // 갱신 시 두 URL의 버전을 함께 올릴 것. (npm dist-tag latest = 0.10.35, 2026-07)
  visionBundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs',
  wasmPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  handModel:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  poseModel:
    'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  delegate: 'GPU',
  runningMode: 'VIDEO',
  numHands: 1,
  numPoses: 1,
};

// ─── 카메라 (원본 L1233) ───
export const CAMERA = {
  video: { width: { ideal: 1280 }, height: { ideal: 720 } },
};

// ─── 손 랜드마크 인덱스 (MediaPipe Hands 21점) ───
export const HAND_LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_TIP: 20,
};

// ─── 포즈 랜드마크 인덱스 (MediaPipe Pose) ───
export const POSE_LM = {
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
};

// ─── 스무딩 프로파일 (원본: 게임 루프 L1257~1258 / 정밀측정 L1370) ───
// smooth = norm(smooth + coeff * norm(median(rawBuf) - smooth))
export const SMOOTH = {
  live:    { coeff: 0.17, rawBuf: 7 }, // 실시간(게임·가이드)
  measure: { coeff: 0.30, rawBuf: 5 }, // 정밀 측정
};

// ─── 포즈(팔뚝) 평활·보상동작 ───
export const POSE = {
  smoothLive: 0.20,     // 게임 루프 팔꿈치/어깨 평활 (원본 L368 POSE_SMOOTH)
  smoothMeasure: 0.12,  // 정밀측정 (원본 L1289)
  resetDist: 0.35,      // 위치 급변 시 버퍼 리셋 (원본 L1253~1254)
  medianBufLive: 5,     // pushN 기본 n (원본 L412)
  medianBufMeasure: 9,  // 정밀측정 pushN n=9 (원본 L1358)
};

// ─── 보상동작(comp) 임계 (원본: 게임 L368 / 정밀측정 L1289) ───
// comp = (elbowMove > TH) || (shoulderMove > TH), 이동량은 팔길이로 정규화
export const COMP_TH = {
  live: 0.48,
  measure: 0.30,
};

// ─── 손목 각도(rel)·편위 참고 ───
export const ANGLE = {
  maxDev: 30, // 편위 최대 참고각 (원본 L368 MAXDEV)
};

// ─── 기능적 가동범위 기준 (일상생활 참고) ───
// 굽힘·폄이 각각 이 각도 이상이면 일상 동작에 필요한 범위로 본다.
// "정상인 대비 %"가 아니라 '일상 기능 기준'의 진척률 표시에만 쓴다(판정·처방 아님).
export const FUNCTIONAL_ROM = { flex: 40, ext: 40 };

// ─── ROM 측정 유지·판정 (원본 L1138, L1289) ───
export const ROM = {
  holdMs: 2200,     // 끝범위 유지 시간 → 자동 저장
  stableBand: 7,    // 이 각도(°) 이상 흔들리면 유지 타이머 리셋
  minExt: 8,        // 이 각도(°) 이상 벌어져야 측정 대상
  rearm: 5,         // |rel| < 이 값이면 래치 해제(반대쪽 측정 준비)
  neutralMs: 2500,  // 중립 측정 지속시간 (원본 L1167 DUR)
  neutralMinSamples: 3, // 중립 평균에 필요한 최소 표본 (원본 L828, L1169)
};

// ─── 데일리 루틴 ───
export const ROUTINE = {
  // 오늘의 루틴 = 매일 동일한 풀코스 (고정 순서 — 요일 로테이션 없음, "고민하게 만들면 안 한다")
  course: ['flex_ext', 'deviation', 'tendon_glide', 'pinch_hold', 'grip_hold', 'finger_spread'],
  // 어제 컨디션이 "뻐근해요"였으면 다음 날은 순한 3종만 제안 (제안일 뿐, 판정 아님)
  gentleCourse: ['flex_ext', 'tendon_glide', 'finger_spread'],
  measureEveryDays: 7,   // 측정 "제안" 주기 (일) — 제안 문구까지만, 판정 아님
  nextAutoMs: 2200,      // 연속 재생: 완료 비트 후 다음 운동 자동 시작(ms)
  // 측정 기반 맞춤(설계 §4.2 방향 특이적 조정 · §4.3 상한) — focus(약한 방향)
  // 운동의 reps만 소폭↑한다. 운동 제거·교체 없이 "반복만 조금 더"라 안전 방향이며,
  // 조정 후에도 cap을 절대 넘지 않는다. focus→운동 매핑은 여기서만 바꾸면 확장됨
  // (지금은 flex·ext 둘 다 복합운동 flex_ext로 수렴 — 방향별 운동 세분화는 나중 과제).
  adaptReps: {
    focusGuide: { flex: 'flex_ext', ext: 'flex_ext' }, // focus 방향 → 조정할 운동 id
    bonus: 2,       // 일반 focus 시 reps 증가폭
    bonusSoft: 1,   // focusSoft(둘 다 40°↑ 참고 코칭 등, §4.1)면 더 작게
    cap: 10,        // 자동 상승 reps 상한(§4.3) — 조정 후 이 값 초과 금지
  },
  // 측정 기반 맞춤(설계 §4.3 진행 · §4.4 후퇴) — 증상 유도로 focus 방향 운동의
  // 강도(dose)를 조용히 올렸다 내렸다 한다. 상승은 3조건 모두 충족 시 1단계씩(보수적),
  // 하강은 악화 낌새면 즉시(안전, 상승보다 우선). reps 상한은 adaptReps.cap 재사용.
  adaptDose: {
    progressStreak: 3,   // 연속 무난(condition≠stiff·직전대비 악화없음) 세션 수 — 이만큼 쌓여야 1단계 상승
    compProgressMax: 15, // 상승 허용 comp 비율(%) 상한 — 이보다 낮아야 "보상동작 적음(§4.3)"
    repStep: 1,          // dose 1단계가 올리는 reps (reps를 cap까지 먼저 소진)
    holdStepSec: 3,      // reps가 cap 도달 후, dose 1단계가 올리는 hold(초) — §4.3 "2~5초" 범위
    holdCapSec: 15,      // hold 상한(초, §4.3) — 조정 후 이 값 초과 금지
  },
};

// ─── localStorage 키 ───
export const STORAGE_KEYS = {
  ROOT: 'wristGarden',
  ROM_HISTORY: 'wb_romHistory', // 프로토타입 호환 키
};

// ─── 디버그 ───
// 가이드 인식 진단 로그([guide-diag]/[flexExt])를 콘솔에 출력할지.
// 평소 false — 테스트 중 인식 문제를 살펴볼 때만 true로 켠다.
export const DEBUG_GUIDE = false;
// 맞춤 루틴 판정 로그([adapt])를 콘솔에 출력할지. 평소 false —
// 약한 방향(focus) 판정을 확인할 때만 true로 켠다.
export const DEBUG_ADAPT = false;
