// ═══════════════════════════════════════════════════════════
// tracking.js — 손 인식 (MediaPipe)
// wrist-garden_32.html에서 이식:
//   · 모델 로딩 (원본 L1227~1229)
//   · 카메라 (원본 L1233)
//   · 감지 루프: video.currentTime 변화 시에만 detect (원본 L1238~1241)
// 각도·지표 계산은 measurement.js 담당. 여기는 '인식'만.
// ═══════════════════════════════════════════════════════════
import { MEDIAPIPE, CAMERA } from './config.js';

let vision = null;
let handLM = null;
let poseLM = null;
let rafId = null;
let stream = null;
let videoEl = null;

let lastTime = -1;   // 마지막으로 detect한 video.currentTime
let lastNow = 0;     // dt 계산용
let cacheHand = null;
let cachePose = null;
let cacheLabel = null;

/** 모델 로드 (idempotent) — vision_bundle을 동적 import해 config URL 단일화 유지 */
export async function initModels() {
  if (handLM && poseLM) return;
  const { HandLandmarker, PoseLandmarker, FilesetResolver } = await import(MEDIAPIPE.visionBundle);
  vision = await FilesetResolver.forVisionTasks(MEDIAPIPE.wasmPath);
  handLM = await HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MEDIAPIPE.handModel, delegate: MEDIAPIPE.delegate },
    runningMode: MEDIAPIPE.runningMode, numHands: MEDIAPIPE.numHands,
  });
  poseLM = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MEDIAPIPE.poseModel, delegate: MEDIAPIPE.delegate },
    runningMode: MEDIAPIPE.runningMode, numPoses: MEDIAPIPE.numPoses,
  });
}

/** 카메라 열기 + video에 스트림 연결. loadeddata까지 대기 (원본 L1233) */
export async function startCamera(video) {
  videoEl = video;
  stream = await navigator.mediaDevices.getUserMedia({ video: CAMERA.video });
  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 2) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
  });
  await video.play().catch(() => {}); // autoplay 정책 대비
}

/**
 * 감지 루프 시작. 프레임마다 onFrame(frame) 호출.
 *   frame = { hand, pose, handLabel, now, dt }
 * @param {Function} onFrame
 * @param {Object} opts - { pose:boolean } 포즈 감지 여부(기본 true)
 */
export function startLoop(onFrame, opts = {}) {
  const usePose = opts.pose !== false;
  lastNow = performance.now();
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000); // dt 상한(원본 L1239)
    lastNow = now;

    // 새 프레임일 때만 detect (중복 추론 방지, 원본 L1241)
    if (videoEl && videoEl.readyState >= 2 && videoEl.currentTime !== lastTime) {
      lastTime = videoEl.currentTime;
      const hr = handLM.detectForVideo(videoEl, now);
      cacheHand = hr.landmarks?.[0] || null;
      cacheLabel = hr.handedness?.[0]?.[0]?.categoryName || null;
      cachePose = usePose ? (poseLM.detectForVideo(videoEl, now).landmarks?.[0] || null) : null;
    }

    try {
      onFrame({ hand: cacheHand, pose: cachePose, handLabel: cacheLabel, now, dt });
    } catch (e) {
      console.error('[tracking] onFrame 오류:', e);
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

/** 루프만 정지 */
export function stopLoop() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

/** 카메라 스트림 정지 */
export function stopCamera() {
  if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  if (videoEl) { videoEl.srcObject = null; }
  lastTime = -1; cacheHand = null; cachePose = null; cacheLabel = null;
}

/** 루프 + 카메라 모두 정지 */
export function stopTracking() {
  stopLoop();
  stopCamera();
}

export function isReady() { return !!(handLM && poseLM); }
