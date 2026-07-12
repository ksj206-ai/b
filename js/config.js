// ═══════════════════════════════════════════════════════════
// config.js — 앱 전역 상수 (단일 출처)
// tracking/measurement 상수는 프로토타입(wrist-garden_32.html)의
// 검증된 값을 그대로 이식. 각 상수 옆에 원본 위치를 주석으로 남긴다.
// ═══════════════════════════════════════════════════════════

// ─── 앱 메타 ───
export const APP = {
  name: '손목 정원',
  version: '0.2.0',
};

// ─── 화면 ID ───
export const SCREENS = {
  HOME: 'home',
  GUIDE: 'guide',
  MEASURE: 'measure',
  GAME: 'game',
  RECORDS: 'records',
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
  visionBundle: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/vision_bundle.mjs',
  wasmPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm',
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
  order: ['mobility', 'glide', 'hold'], // 코스 순서: 가동 → 활주 → 유지 (side 운동이 앞이라 뷰 전환 최소)
  measureEveryDays: 7,                  // 측정 "제안" 주기 (일) — 제안 문구까지만, 판정 아님
};

// ─── localStorage 키 ───
export const STORAGE_KEYS = {
  ROOT: 'wristGarden',
  ROM_HISTORY: 'wb_romHistory', // 프로토타입 호환 키
};
