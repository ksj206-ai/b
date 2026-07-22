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

/**
 * delegate를 MEDIAPIPE.delegates 순서대로 시도하며 landmarker를 생성한다(생성 시점 폴백).
 * 앞선 delegate(GPU) 생성이 throw/reject하면 다음(CPU)으로 재시도 — GPU 미지원 기기·
 * 브라우저에서도 앱이 열리게 한다. Hand/Pose에 각각 독립 호출되므로 한쪽이 CPU로 내려가도
 * 다른 쪽은 GPU를 유지한다(혼합 허용). 모든 delegate가 실패하면 마지막 에러를 그대로 throw
 * → 상위(startMeasure/startGuide)의 기존 에러 안내(cameraErrorMessage) 흐름을 유지한다.
 *
 * ⚠ 범위: 'createFromOptions가 reject하는' 생성 시점 실패까지만 커버한다. 생성은 성공하고
 *   첫 추론(detectForVideo)에서 터지거나 조용히 넘어가는 케이스는 못 막는다(런타임 폴백은
 *   후속 과제). 성공한 delegate와, 폴백 시 실패 사유를 콘솔 로그로 남긴다(기기별 데이터 축적).
 * @param {string} label 로그용 모델 이름
 * @param {(delegate:string)=>Promise<any>} create delegate를 받아 landmarker를 생성하는 팩토리
 */
export async function createWithFallback(label, create) {
  const delegates = MEDIAPIPE.delegates;
  let lastErr;
  for (let i = 0; i < delegates.length; i++) {
    const d = delegates[i];
    try {
      const lm = await create(d);
      if (i === 0) console.log(`[tracking] ${label}: ${d} delegate 로드`);
      else console.warn(`[tracking] ${label}: ${delegates.slice(0, i).join('·')} 실패 → ${d} 폴백 로드`);
      return lm;
    } catch (e) {
      lastErr = e;
      console.warn(`[tracking] ${label}: ${d} delegate 생성 실패 —`, e?.message ?? e);
    }
  }
  throw lastErr; // 모든 delegate 실패 → 상위의 기존 에러 안내로 떨어진다
}

/** 모델 로드 (idempotent) — vision_bundle을 동적 import해 config URL 단일화 유지.
 *  delegate는 GPU→CPU 폴백(createWithFallback)으로 두 모델에 각각 독립 적용. */
export async function initModels() {
  if (handLM && poseLM) return;
  const { HandLandmarker, PoseLandmarker, FilesetResolver } = await import(MEDIAPIPE.visionBundle);
  vision = await FilesetResolver.forVisionTasks(MEDIAPIPE.wasmPath);
  handLM = await createWithFallback('HandLandmarker', (delegate) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MEDIAPIPE.handModel, delegate },
      runningMode: MEDIAPIPE.runningMode, numHands: MEDIAPIPE.numHands,
    }));
  poseLM = await createWithFallback('PoseLandmarker', (delegate) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MEDIAPIPE.poseModel, delegate },
      runningMode: MEDIAPIPE.runningMode, numPoses: MEDIAPIPE.numPoses,
    }));
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
