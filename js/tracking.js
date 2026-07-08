// ═══════════════════════════════════════════════════════════
// tracking.js — 손 인식 (MediaPipe)
// [2단계 이식 예정] wrist-garden 프로토타입에서 이식:
//   · MediaPipe HandLandmarker 초기화
//   · 프레임 루프 / 랜드마크 추출
//   · 스무딩
// 상수는 config.js(MEDIAPIPE, TRACKING)로 분리해 가져온다.
// ═══════════════════════════════════════════════════════════

export async function initTracking(/* videoEl */) {
  throw new Error('[tracking] 2단계에서 프로토타입 로직 이식 예정');
}

export function stopTracking() {
  // TODO(2단계): 카메라·루프 정지
}
