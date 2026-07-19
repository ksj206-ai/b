// ═══════════════════════════════════════════════════════════
// stepEngine.js — 스텝 진행·텍스트·인식 카운트·완료 처리 (명세서 §5·§6)
// 스텝 type: intro(자동 dur초) / follow(인식 카운트로 진행, 건너뛰기) / outro(자동)
// 인식은 measurement.js 지표(rel/grip/tipMCP/pinch)를 재사용해 판정.
// UX(명세서 §6): 시범과 카운트 독립, 관대한 목표, 조용한 피드백,
//                15초 인식0 시 탈출구, 보상동작은 안내만(카운트 막지 않음… 단 flexExt는 무효화).
// ═══════════════════════════════════════════════════════════
import { ROM, DEBUG_GUIDE } from '../config.js';

const IDLE_MS = 15000; // follow에서 이 시간동안 카운트 0이면 탈출구 안내

// ─── 판정기(detector) ─────────────────────────────────────
// feed(snap, now) → { justCounted, hint, progress? }
//   snap = { detected, rel, comp, fingers }

/** 굽힘·폄: rel 왕복(굽힘 끝 + 폄 끝) 1세트 = 1회. 폄 목표는 낮게(2D 한계).
 *  comp(보상동작)는 무효 처리하지 않는다 — 가이드는 관대한 판정(§6).
 *  감지값은 스냅샷에 남아 컨트롤러가 세션 비율만 집계한다(추후 코칭 힌트용). */
function flexExtDetector({ flexT = 24, extT = 12 } = {}) {
  let reachedFlex = false, reachedExt = false;
  let logAt = 0; // 진단 로그 스로틀 (DEBUG_GUIDE 켰을 때만 사용)
  return {
    feed(snap) {
      if (!snap.detected) return { justCounted: false, hint: '손을 카메라에 보여주세요' };
      const rel = snap.rel;
      if (rel <= -flexT) reachedFlex = true;
      if (rel >= extT) reachedExt = true;
      let justCounted = false;
      if (reachedFlex && reachedExt) { justCounted = true; reachedFlex = false; reachedExt = false; }
      // 진단 로그 — config.DEBUG_GUIDE를 켰을 때만 출력
      if (DEBUG_GUIDE) {
        const t = performance.now();
        if (justCounted || t - logAt > 200) {
          logAt = t;
          console.log(`[flexExt] rel=${rel.toFixed(1)}° (굽힘 인정 ≤ -${flexT} / 폄 인정 ≥ +${extT}) ` +
                      `굽힘도달=${reachedFlex} 폄도달=${reachedExt}${justCounted ? ' ✅ 1회 인정' : ''}`);
        }
      }
      const hint = reachedFlex ? '좋아요, 이제 위로 펴세요 ⬆'
        : reachedExt ? '이제 아래로 굽혀요 ⬇'
        : '천천히 굽혔다 펴세요';
      return { justCounted, hint };
    },
    reset() { reachedFlex = false; reachedExt = false; },
  };
}

/** 좌우 편위: 요측 끝 + 척측 끝 1세트 = 1회 */
function deviationDetector({ radialT = 16, ulnarT = 18 } = {}) {
  let reachedR = false, reachedU = false;
  return {
    feed(snap) {
      if (!snap.detected) return { justCounted: false, hint: '손을 보여주세요' };
      const rel = snap.rel;
      if (rel <= -radialT) reachedR = true;
      if (rel >= ulnarT) reachedU = true;
      let justCounted = false;
      if (reachedR && reachedU) { justCounted = true; reachedR = false; reachedU = false; }
      return { justCounted, hint: '엄지쪽·새끼쪽으로 번갈아 기울여요' };
    },
    reset() { reachedR = false; reachedU = false; },
  };
}

/** 핀치 유지: pinch<0.34를 holdMs 유지 시 1회 (놓으면 재무장) */
function pinchHoldDetector({ thresh = 0.34, holdMs = 2000 } = {}) {
  let holdStart = null, armed = true;
  return {
    feed(snap, now) {
      const f = snap.fingers;
      if (!snap.detected || !f) { holdStart = null; return { justCounted: false, hint: '손을 보여주세요' }; }
      const closed = f.pinch < thresh;
      if (closed && armed) {
        if (holdStart === null) holdStart = now;
        const held = now - holdStart, progress = Math.min(1, held / holdMs);
        if (held >= holdMs) { armed = false; holdStart = null; return { justCounted: true, hint: '잘했어요!' }; }
        return { justCounted: false, hint: '그대로 유지…', progress };
      }
      holdStart = null;
      if (!closed) armed = true;
      return { justCounted: false, hint: '엄지·검지로 콕 집어요' };
    },
    reset() { holdStart = null; armed = true; },
  };
}

/** 악력 유지: 중립 + grip<1.2를 holdMs 유지 시 1회 */
function gripHoldDetector({ thresh = 1.2, holdMs = 2500, neutralBand = 14 } = {}) {
  let holdStart = null, armed = true;
  return {
    feed(snap, now) {
      const f = snap.fingers;
      if (!snap.detected || !f) { holdStart = null; return { justCounted: false, hint: '손을 보여주세요' }; }
      const squeeze = f.grip < thresh, neutral = Math.abs(snap.rel) < neutralBand;
      if (squeeze && neutral && armed) {
        if (holdStart === null) holdStart = now;
        const held = now - holdStart, progress = Math.min(1, held / holdMs);
        if (held >= holdMs) { armed = false; holdStart = null; return { justCounted: true, hint: '좋아요!' }; }
        return { justCounted: false, hint: '꽉 쥔 채 유지…', progress };
      }
      holdStart = null;
      if (f.grip > 1.5) armed = true;
      return { justCounted: false, hint: '주먹을 꽉 쥐어요' };
    },
    reset() { holdStart = null; armed = true; },
  };
}

/** 힘줄 활주: 쫙→갈고리→주먹 순서 통과 시 1회 */
function tendonGlideDetector() {
  const order = ['open', 'hook', 'fist'];
  const label = { open: '쫙 펴기', hook: '갈고리', fist: '주먹' };
  let idx = 0;
  const poseOf = (f) => f.grip > 1.45 ? 'open' : (f.tipMCP < 0.58 && f.grip > 1.12 ? 'hook' : 'fist');
  return {
    feed(snap) {
      if (!snap.detected || !snap.fingers) return { justCounted: false, hint: '손을 보여주세요' };
      const cur = poseOf(snap.fingers);
      if (cur === order[idx]) {
        idx++;
        if (idx >= order.length) { idx = 0; return { justCounted: true, hint: '잘했어요!' }; }
      }
      return { justCounted: false, hint: `다음: ${label[order[idx]]}` };
    },
    reset() { idx = 0; },
  };
}

const DETECTORS = {
  flexExt: flexExtDetector,
  deviation: deviationDetector,
  pinchHold: pinchHoldDetector,
  gripHold: gripHoldDetector,
  tendonGlide: tendonGlideDetector,
};

export function createDetector(type, opts) {
  const make = DETECTORS[type];
  return make ? make(opts) : { feed: () => ({ justCounted: false, hint: '' }), reset() {} };
}

// ═══════════════════════════════════════════════════════════
// createStepEngine — 스텝 진행 상태기
//   handlers: {
//     onEnterStep(step, index, total),
//     onCount(count, reps),
//     onStatus({ hint, comp, idle, progress }),
//     onNeedNeutral(step)  // follow 진입 시: 컨트롤러가 중립 잡고 arm() 호출
//     onComplete(),
//   }
// 컨트롤러가 매 프레임 update(now, snap) 호출.
// ═══════════════════════════════════════════════════════════
export function createStepEngine(guide, handlers = {}) {
  const steps = guide.steps;
  let i = -1, stepStart = 0, detector = null, count = 0;
  let armed = false, lastCountAt = 0, idleShown = false;
  let done = false; // onComplete 1회 보장 (완료 후 update가 매 프레임 재발화하는 것 방지)

  function enter(index, now) {
    i = index;
    const step = steps[i];
    stepStart = now;
    count = 0; armed = false; idleShown = false; lastCountAt = now;
    detector = step.type === 'follow' ? createDetector(step.detect, step.detectOpts) : null;
    handlers.onEnterStep?.(step, i, steps.length);
    if (step.type === 'follow') {
      handlers.onCount?.(0, step.reps);
      handlers.onNeedNeutral?.(step); // 중립 잡은 뒤 arm()
    }
  }

  function start(now) { done = false; enter(0, now); }

  /** 중립 준비 완료 → follow 카운트 시작 (컨트롤러가 호출) */
  function arm(now) { armed = true; lastCountAt = now ?? stepStart; if (detector) detector.reset(); }

  function next(now) {
    if (i + 1 >= steps.length) {
      if (!done) { done = true; handlers.onComplete?.(); }
      return;
    }
    enter(i + 1, now);
  }

  /** follow 강제 진행(건너뛰기 / 손동작 없이 진행) */
  function skip(now) { next(now ?? performance.now()); }

  function update(now, snap) {
    if (i < 0 || done) return;
    const step = steps[i];

    if (step.type === 'intro' || step.type === 'outro') {
      if ((now - stepStart) >= (step.dur ?? 3) * 1000) next(now);
      return;
    }

    // follow
    if (!armed) { handlers.onStatus?.({ hint: '준비… 손을 편하게 보여주세요', comp: false, idle: false }); return; }

    const res = detector.feed(snap, now) || {};
    if (res.justCounted) {
      count++; lastCountAt = now; idleShown = false;
      handlers.onCount?.(count, step.reps);
      if (count >= step.reps) { next(now); return; }
    }
    let idle = false;
    if (!idleShown && (now - lastCountAt) >= IDLE_MS) { idle = true; idleShown = true; }
    else idle = idleShown;
    handlers.onStatus?.({ hint: res.hint || '', comp: !!snap.comp, idle, progress: res.progress ?? 0 });
  }

  return {
    start, update, next, skip, arm,
    get index() { return i; },
    get step() { return i >= 0 ? steps[i] : null; },
    get count() { return count; },
    get total() { return steps.length; },
  };
}

// ROM 상수 재노출(카운트 UX가 참고할 수 있게)
export { ROM };
