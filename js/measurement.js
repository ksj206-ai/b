// ═══════════════════════════════════════════════════════════
// measurement.js — 지표 계산 & ROM 측정
// wrist-garden_32.html의 검증된 로직을 이식:
//   · 수학 헬퍼 norm/median/ang/dist/clamp (원본 L407~412)
//   · 손가락 지표 grip/spread/tipMCP/pinch (원본 L1246~1249)
//   · 손목 각도 + 스무딩 + rel + 보상동작 comp (원본 L1243~1261)
//   · ROM 유지-캡처 (원본 L1178~1184, capRom L1173~1175)
// tracking.js가 넘겨준 랜드마크를 입력으로 받는 순수/상태 모듈.
// ═══════════════════════════════════════════════════════════
import { HAND_LM, POSE_LM, SMOOTH, POSE, COMP_TH, ROM } from './config.js';

// ─── 수학 헬퍼 (원본 L407~412) ───
/** 각도를 -180~180°로 정규화 */
export const norm = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
/** 배열 중앙값 (원본과 동일: 정렬 후 가운데) */
export const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
/** 두 점이 이루는 각도(deg), 화면 y축 기준 */
export const ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
/** 두 점 사이 유클리드 거리 */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** 값 범위 제한 */
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** 링버퍼 push (최대 n개 유지) */
export const pushN = (arr, v, n = 5) => { arr.push(v); if (arr.length > n) arr.shift(); };

// ─── MCP 중심점 (원본 L1243) ───
export function mcpCenter(hand) {
  const a = hand[HAND_LM.INDEX_MCP], b = hand[HAND_LM.MIDDLE_MCP];
  const c = hand[HAND_LM.RING_MCP], d = hand[HAND_LM.PINKY_MCP];
  return { x: (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4 };
}

// ─── 손가락 지표 (원본 L1246~1249) ───
// palm = 손목~중지MCP 거리로 정규화(손 크기·거리 보정)
export function fingerMetrics(hand) {
  const hw = hand[HAND_LM.WRIST];
  const palm = dist(hw, hand[HAND_LM.MIDDLE_MCP]) || 0.001;
  const grip = (
    dist(hand[HAND_LM.INDEX_TIP], hw) + dist(hand[HAND_LM.MIDDLE_TIP], hw) +
    dist(hand[HAND_LM.RING_TIP], hw) + dist(hand[HAND_LM.PINKY_TIP], hw)
  ) / 4 / palm;
  const spread = dist(hand[HAND_LM.INDEX_MCP], hand[HAND_LM.PINKY_MCP]) / palm;
  const tipMCP = (
    dist(hand[HAND_LM.INDEX_TIP], hand[HAND_LM.INDEX_MCP]) +
    dist(hand[HAND_LM.MIDDLE_TIP], hand[HAND_LM.MIDDLE_MCP]) +
    dist(hand[HAND_LM.RING_TIP], hand[HAND_LM.RING_MCP]) +
    dist(hand[HAND_LM.PINKY_TIP], hand[HAND_LM.PINKY_MCP])
  ) / 4 / palm;
  const pinch = dist(hand[HAND_LM.THUMB_TIP], hand[HAND_LM.INDEX_TIP]) / palm;
  return { palm, grip, spread, tipMCP, pinch };
}

// ─── 팔뚝(팔꿈치/어깨) 선택 (원본 L1250) ───
// 손목에 더 가까운 쪽 손목(pose)의 팔을 대상으로 삼는다.
export function pickForearm(pose, handWrist) {
  if (!pose) return null;
  const lw = pose[POSE_LM.L_WRIST], rw = pose[POSE_LM.R_WRIST];
  const useLeft = dist(lw, handWrist) < dist(rw, handWrist);
  return useLeft
    ? { elbow: pose[POSE_LM.L_ELBOW], shoulder: pose[POSE_LM.L_SHOULDER] }
    : { elbow: pose[POSE_LM.R_ELBOW], shoulder: pose[POSE_LM.R_SHOULDER] };
}

// ═══════════════════════════════════════════════════════════
// createWristTracker — 프레임마다 손목 각도를 평활하고 rel/comp 산출
// (원본 게임 루프 L1256~1262의 상태 로직을 캡슐화)
//   profile: 'live' | 'measure'
// ═══════════════════════════════════════════════════════════
export function createWristTracker(profile = 'live') {
  const sm = SMOOTH[profile] || SMOOTH.live;
  const poseSmooth = profile === 'measure' ? POSE.smoothMeasure : POSE.smoothLive;
  const poseBufN = profile === 'measure' ? POSE.medianBufMeasure : POSE.medianBufLive;
  const compTh = profile === 'measure' ? COMP_TH.measure : COMP_TH.live;

  const s = {
    rawBuf: [], smooth: null, neutral: null,
    wa: 0, rel: 0, comp: false, usePose: false,
    sElbow: null, sShoulder: null,
    elBX: [], elBY: [], shBX: [], shBY: [],
    baseElbow: null, baseShoulder: null,
    neutralBuf: null, // 중립 수집 중일 때만 배열
  };

  /** 포즈로부터 평활된 팔꿈치/어깨 갱신 (원본 L1250~1255) */
  function updatePose(pose, hw) {
    const fa = pickForearm(pose, hw);
    if (!fa) { s.sElbow = null; s.sShoulder = null; s.elBX = []; s.elBY = []; s.shBX = []; s.shBY = []; return; }
    pushN(s.elBX, fa.elbow.x, poseBufN); pushN(s.elBY, fa.elbow.y, poseBufN);
    pushN(s.shBX, fa.shoulder.x, poseBufN); pushN(s.shBY, fa.shoulder.y, poseBufN);
    const me = { x: median(s.elBX), y: median(s.elBY) };
    const ms = { x: median(s.shBX), y: median(s.shBY) };
    s.sElbow = (!s.sElbow || dist(s.sElbow, me) > POSE.resetDist)
      ? { ...me }
      : { x: s.sElbow.x + poseSmooth * (me.x - s.sElbow.x), y: s.sElbow.y + poseSmooth * (me.y - s.sElbow.y) };
    s.sShoulder = (!s.sShoulder || dist(s.sShoulder, ms) > POSE.resetDist)
      ? { ...ms }
      : { x: s.sShoulder.x + poseSmooth * (ms.x - s.sShoulder.x), y: s.sShoulder.y + poseSmooth * (ms.y - s.sShoulder.y) };
  }

  /**
   * 한 프레임 갱신.
   * @param {Array} hand - 손 랜드마크(21) 또는 null
   * @param {Array} pose - 포즈 랜드마크 또는 null
   * @param {Object} opts - { usePose:boolean } 팔뚝 기준 상대각 사용 여부
   * @returns 스냅샷 { detected, wa, smooth, rel, comp, usePose, fingers }
   */
  function update(hand, pose = null, opts = {}) {
    if (!hand) return { detected: false, wa: s.wa, smooth: s.smooth, rel: s.rel, comp: s.comp, usePose: s.usePose, fingers: null };
    const hw = hand[HAND_LM.WRIST];
    const mc = mcpCenter(hand);
    const fingers = fingerMetrics(hand);

    updatePose(pose, hw);
    s.usePose = !!(opts.usePose && s.sElbow);

    // 손목→MCP중심 각도. usePose면 팔뚝(팔꿈치→손목) 기준 상대각 (원본 L1256)
    const handA = ang(hw, mc);
    const active = (s.usePose && s.sElbow) ? norm(handA - ang(s.sElbow, hw)) : handA;
    s.wa = handA;

    // 원시 각도 median 버퍼 → 지수평활 (원본 L1257~1258)
    pushN(s.rawBuf, active, sm.rawBuf);
    s.smooth = s.smooth === null
      ? median(s.rawBuf)
      : norm(s.smooth + sm.coeff * norm(median(s.rawBuf) - s.smooth));

    // 중립 기준 상대각 (원본 L1259)
    if (s.neutral !== null) s.rel = norm(s.smooth - s.neutral);
    if (s.neutralBuf) s.neutralBuf.push(s.smooth);

    // 보상동작: 기준 팔꿈치/어깨 대비 이동량(팔길이 정규화) (원본 L1261)
    if (s.usePose && s.baseElbow && s.sElbow) {
      const sc = dist(s.sElbow, hw) || 0.1;
      const em = dist(s.sElbow, s.baseElbow) / sc;
      const shm = dist(s.sShoulder, s.baseShoulder) / sc;
      s.comp = em > compTh || shm > compTh;
    } else {
      s.comp = false;
    }

    return { detected: true, wa: s.wa, smooth: s.smooth, rel: s.rel, comp: s.comp, usePose: s.usePose, fingers };
  }

  /** 중립 수집 시작 (카운트다운 동안 smooth를 모음) */
  function beginNeutral() { s.neutralBuf = []; }

  /** 중립 확정: 수집 표본 평균(부족하면 현재 smooth)으로 기준각 설정 + comp 기준 팔 저장 (원본 L828, L1169) */
  function commitNeutral() {
    const buf = s.neutralBuf;
    s.neutral = (buf && buf.length >= ROM.neutralMinSamples)
      ? buf.reduce((a, b) => a + b, 0) / buf.length
      : s.smooth;
    s.neutralBuf = null;
    s.usePose = !!s.sElbow;
    if (s.usePose && s.sElbow) { s.baseElbow = { ...s.sElbow }; s.baseShoulder = { ...s.sShoulder }; }
    else { s.baseElbow = null; s.baseShoulder = null; }
    s.rel = 0;
    return s.neutral;
  }

  function reset() {
    s.rawBuf = []; s.smooth = null; s.neutral = null; s.wa = 0; s.rel = 0;
    s.comp = false; s.usePose = false; s.sElbow = null; s.sShoulder = null;
    s.elBX = []; s.elBY = []; s.shBX = []; s.shBY = [];
    s.baseElbow = null; s.baseShoulder = null; s.neutralBuf = null;
  }

  return {
    update, beginNeutral, commitNeutral, reset,
    get state() { return s; },
    get rel() { return s.rel; },
    get smooth() { return s.smooth; },
    get neutral() { return s.neutral; },
    get comp() { return s.comp; },
  };
}

// ═══════════════════════════════════════════════════════════
// createRomMeasurer — 끝범위 유지-캡처로 좌우 최대 각도 저장
// (원본 checkRom L1178~1184 + capRom L1173~1175)
//   rel<0 → A쪽, rel>0 → B쪽. 각 쪽 최대값을 유지시간 만족 시 확정.
// ═══════════════════════════════════════════════════════════
export function createRomMeasurer() {
  const s = {
    maxA: 0, maxB: 0, latchA: false, latchB: false,
    holdRef: null, holdStart: 0, holdSamp: [],
  };

  /**
   * @param {number} rel - 중립 기준 상대각(°)
   * @param {number} now - performance.now()
   * @param {boolean} compBad - 보상동작/방향오류로 측정 무효 여부
   * @returns { progress(0~1), captured:{side,deg}|null, maxA, maxB, latchA, latchB }
   */
  function feed(rel, now, compBad = false) {
    const a = Math.abs(rel);
    const side = rel < 0 ? 'A' : 'B';
    const latched = side === 'A' ? s.latchA : s.latchB;

    // 중립 근처로 복귀하면 래치 해제 (원본 L1180)
    if (a < ROM.rearm) { s.latchA = false; s.latchB = false; }

    let captured = null;
    let progress = 0;

    if (a > ROM.minExt && !latched && !compBad) {
      // 흔들리면(밴드 초과) 유지 타이머 리셋 (원본 L1182)
      if (s.holdRef === null || Math.abs(rel - s.holdRef) > ROM.stableBand) {
        s.holdRef = rel; s.holdStart = now; s.holdSamp = [];
      }
      s.holdSamp.push(a);
      const held = now - s.holdStart;
      progress = Math.min(1, held / ROM.holdMs);
      if (held >= ROM.holdMs) {
        captured = capture(side, median(s.holdSamp));
      }
    }
    return { progress, captured, maxA: s.maxA, maxB: s.maxB, latchA: s.latchA, latchB: s.latchB };
  }

  /** 한쪽 최대각 확정 (원본 capRom L1173~1175) */
  function capture(side, deg) {
    const d = Math.round(deg);
    if (side === 'A') { s.maxA = Math.max(s.maxA, d); s.latchA = true; }
    else { s.maxB = Math.max(s.maxB, d); s.latchB = true; }
    s.holdRef = null; s.holdSamp = [];
    return { side, deg: side === 'A' ? s.maxA : s.maxB };
  }

  function reset() {
    s.maxA = 0; s.maxB = 0; s.latchA = false; s.latchB = false;
    s.holdRef = null; s.holdStart = 0; s.holdSamp = [];
  }

  return { feed, reset, get state() { return s; } };
}
