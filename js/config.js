// ═══════════════════════════════════════════════════════════
// config.js — 앱 전역 상수 (단일 출처)
// 모든 매직넘버·상수는 이 파일에 모은다.
// 2단계에서 tracking/measurement 이식 시 프로토타입의
// 검증된 상수(스무딩 계수, 각도 상한, 판정 임계값 등)를 여기로 옮긴다.
// ═══════════════════════════════════════════════════════════

// ─── 앱 메타 ───
export const APP = {
  name: '손목 정원',
  version: '0.1.0',
};

// ─── 화면 ID ───
export const SCREENS = {
  HOME: 'home',
  GUIDE: 'guide',
  MEASURE: 'measure',
  GAME: 'game',
};
export const DEFAULT_SCREEN = SCREENS.HOME;

// ─── 스테이지 좌표계 (프로토타입 기준) ───
export const STAGE = {
  W: 960,
  H: 540,
  groundY: 348,
};

// ─── MediaPipe 설정 (2단계 이식 시 채움) ───
// TODO(tracking.js 이식): 모델 경로/옵션, numHands, delegate 등
export const MEDIAPIPE = {
  // wasmPath: '...',
  // modelPath: '...',
};

// ─── 손목 각도(rel)·스무딩 (2단계 이식 시 채움) ───
// TODO(measurement.js 이식): 스무딩 계수, 폄 각도 상한(≈14°) 등
export const TRACKING = {
  // smoothing: ...,
  // extMaxDeg: 14,
};

// ─── 손가락 지표 판정 임계값 (2단계 이식 시 채움) ───
// TODO(measurement.js 이식): grip / tipMCP / pinch 임계값
export const FINGER = {
  // pinchClosed: 0.34,
  // gripClosed: 1.2,
};

// ─── localStorage 키 ───
export const STORAGE_KEYS = {
  ROOT: 'wristGarden',
};
