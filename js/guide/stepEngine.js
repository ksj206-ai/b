// ═══════════════════════════════════════════════════════════
// stepEngine.js — 스텝 진행·텍스트·인식 카운트·완료 처리 (명세서 §5·§6)
// 스텝 type: intro(자동 dur초) / follow(인식 카운트로 진행, 건너뛰기) / outro(자동)
//            timed(카메라 없이 holdSec초 × reps라운드 — 스트레칭·유지 동작용)
// 인식은 measurement.js 지표(rel/grip/tipMCP/pinch/fanSpan)를 재사용해 판정.
// UX(명세서 §6): 시범과 카운트 독립, 관대한 목표, 조용한 피드백,
//                15초 인식0 시 탈출구, 보상동작은 안내만(카운트 막지 않음… 단 flexExt는 무효화).
// ═══════════════════════════════════════════════════════════
import { ROM, DEBUG_GUIDE } from '../config.js';
import { rec } from '../debugRec.js';

const IDLE_MS = 15000; // follow에서 이 시간동안 카운트 0이면 탈출구 안내

// ─── 판정기(detector) ─────────────────────────────────────
// feed(snap, now) → { justCounted, hint, progress?, range?, ends? }
//   snap = { detected, rel, comp, fingers }
//
// range·ends는 각도(rel) 판정기만 내보낸다. 게임이 손목 각도를 화면 좌표로 옮기고
// '어느 끝을 찍었는지'를 그리려면 임계값과 도달 상태가 필요한데, 그걸 게임이 따로
// 가지면 판정과 그림이 어긋난다(finger_spread에서 이미 한 번 겪은 종류의 어긋남).
// 판정기가 자기 임계를 내주는 편이 출처를 하나로 유지한다.
//   range = { lo, hi }  판정에 쓰는 두 끝의 각도(°)
//   ends  = { lo, hi }  지금 그 끝을 찍어 둔 상태인가(왕복 판정의 내부 상태)

/** 굽힘·폄: rel 왕복(굽힘 끝 + 폄 끝) 1세트 = 1회. 폄 목표는 낮게(2D 한계).
 *  comp(보상동작)는 무효 처리하지 않는다 — 가이드는 관대한 판정(§6).
 *  감지값은 스냅샷에 남아 컨트롤러가 세션 비율만 집계한다(추후 코칭 힌트용). */
function flexExtDetector({ flexT = 24, extT = 12 } = {}) {
  let reachedFlex = false, reachedExt = false;
  let logAt = 0; // 진단 로그 스로틀 (DEBUG_GUIDE 켰을 때만 사용)
  const range = { lo: -flexT, hi: extT };   // lo=굽힘 끝, hi=폄 끝
  return {
    feed(snap) {
      if (!snap.detected) {
        return { justCounted: false, hint: '손을 카메라에 보여주세요',
                 range, ends: { lo: reachedFlex, hi: reachedExt } };
      }
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
      return { justCounted, hint, range, ends: { lo: reachedFlex, hi: reachedExt } };
    },
    reset() { reachedFlex = false; reachedExt = false; },
  };
}

/** 좌우 편위: 요측 끝 + 척측 끝 1세트 = 1회 */
function deviationDetector({ radialT = 16, ulnarT = 18 } = {}) {
  let reachedR = false, reachedU = false;
  const range = { lo: -radialT, hi: ulnarT };   // lo=요측(엄지쪽) 끝, hi=척측(새끼쪽) 끝
  return {
    feed(snap) {
      const ends = () => ({ lo: reachedR, hi: reachedU });
      if (!snap.detected) return { justCounted: false, hint: '손을 보여주세요', range, ends: ends() };
      const rel = snap.rel;
      if (rel <= -radialT) reachedR = true;
      if (rel >= ulnarT) reachedU = true;
      let justCounted = false;
      if (reachedR && reachedU) { justCounted = true; reachedR = false; reachedU = false; }
      return { justCounted, hint: '엄지쪽·새끼쪽으로 번갈아 기울여요', range, ends: ends() };
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

/** 손가락 벌리기: 활짝(fanSpan≥openT) + 모음(≤closeT) 1세트 = 1회.
 *  굽힘·폄과 같은 '양 끝 도달' 관용구 — 순서는 상관없다.
 *
 *  ⚠ fanSpan을 쓰는 이유(measurement.fingerMetrics 주석 참고): fingers.spread는 너클 폭이라
 *    손가락을 벌려도 값이 안 변한다. 외전을 재는 건 손끝 폭(fanSpan)뿐이다.
 *
 *  extendedT 게이트: 손가락을 '굽혀도' 손끝 폭은 줄어든다 → 굽힘을 '모음'으로 오인해
 *    엉뚱한 카운트가 생긴다. 그래서 편 상태(grip ≥ extendedT)에서만 판정한다.
 *    이건 진행을 막는 게 아니라 오탐만 막는 것 — 못 맞춰도 [건너뛰기]와 15초 탈출구는 그대로다(§6).
 *
 *  ★임계값은 기하학 추정치다(모음 ~0.8 / 활짝 ~1.4). 실기기 실측으로 확정할 것 —
 *    콘솔 `__rec.on()`이 fanSpan·grip 분포를 모은다(절차: docs/스모크_체크리스트.md). */
function fingerSpreadDetector({ openT = 1.15, closeT = 0.95, extendedT = 1.45 } = {}) {
  let reachedOpen = false, reachedClose = false;
  let logAt = 0;
  return {
    feed(snap) {
      const f = snap.fingers;
      if (!snap.detected || !f) return { justCounted: false, hint: '손을 카메라에 보여주세요' };
      // 실측 기록 — grip은 게이트 앞에서 받아야 extendedT(1.45)가 맞는지 볼 수 있다.
      // 게이트 뒤에서만 받으면 "통과한 프레임의 grip"만 남아 게이트 자체를 검증 못 한다.
      rec('fingerSpread:grip', f.grip);
      if (f.grip < extendedT) return { justCounted: false, hint: '손가락을 쭉 편 채로 해요' };
      rec('fingerSpread:fanSpan', f.fanSpan);   // 판정이 실제로 보는 값 = 편 상태의 fanSpan

      if (f.fanSpan >= openT) reachedOpen = true;
      if (f.fanSpan <= closeT) reachedClose = true;
      let justCounted = false;
      if (reachedOpen && reachedClose) { justCounted = true; reachedOpen = false; reachedClose = false; }

      if (DEBUG_GUIDE) {
        const t = performance.now();
        if (justCounted || t - logAt > 200) {
          logAt = t;
          console.log(`[fingerSpread] fanSpan=${f.fanSpan.toFixed(2)} (벌림 인정 ≥ ${openT} / 모음 인정 ≤ ${closeT}) ` +
                      `grip=${f.grip.toFixed(2)} 벌림도달=${reachedOpen} 모음도달=${reachedClose}` +
                      `${justCounted ? ' ✅ 1회 인정' : ''}`);
        }
      }
      const hint = reachedOpen ? '이제 천천히 모아요 🤏'
        : reachedClose ? '손가락을 활짝 벌려요 🖐'
        : '손가락을 활짝 벌렸다 모아요';
      return { justCounted, hint };
    },
    reset() { reachedOpen = false; reachedClose = false; },
  };
}

/** 엄지 대립 순환: 엄지끝을 검지 → 중지 → 약지 → 새끼 끝에 차례로. 한 바퀴 = 1회.
 *
 *  ★"가장 가까운 손가락이 목표여야 한다" 조건이 핵심이다. 임계만 보면 검지에 댄 순간
 *   이웃한 중지까지 임계 안에 들어와(끝끼리 ~2cm = 0.21) 게이트가 한 프레임에 두 칸씩
 *   넘어간다. 최근접 조건이 그걸 막고, 덤으로 손 크기·임계값에 둔감해진다.
 *
 *  임계는 palm 정규화 기준이다(measurement.fingerMetrics 주석 참고) — 손가락 자기 길이로
 *  나누면 새끼가 더 엄격해져서 대립이 가장 어려운 손가락에 높은 문턱을 세우게 된다.
 *
 *  ★touchT는 기하학 추정치다(접촉 ~0.05 / 3cm 근접 0.32 / 손 편 상태 1.1~1.35).
 *   실기기로 확정할 것 — 콘솔 `__rec.on()`이 손가락별 간격 분포를 모은다.
 *   손가락별 min이 접촉값, max가 편 손 값이다(절차: docs/스모크_체크리스트.md). */
function thumbOppositionDetector({ touchT = 0.35 } = {}) {
  const order = ['index', 'middle', 'ring', 'pinky'];
  const label = { index: '검지', middle: '중지', ring: '약지', pinky: '새끼' };
  let idx = 0, logAt = 0;
  return {
    feed(snap) {
      const f = snap.fingers;
      if (!snap.detected || !f || !f.thumbGap) return { justCounted: false, hint: '손을 보여주세요' };
      const g = f.thumbGap;
      const target = order[idx];
      const nearest = order.reduce((a, b) => (g[b] < g[a] ? b : a));
      // 실측 기록 — 손가락별 min이 그 손가락의 실제 '접촉값', max가 '손 편 상태'다.
      // touchT는 그 둘 사이에 놓여야 하고, 새끼로 갈수록 대립이 어려워 min이 커진다.
      for (const k of order) rec(`thumbOpp:${label[k]}`, g[k]);
      let justCounted = false;
      if (nearest === target && g[target] <= touchT) {
        idx++;
        if (idx >= order.length) { idx = 0; justCounted = true; }
      }
      if (DEBUG_GUIDE) {
        const t = performance.now();
        if (justCounted || t - logAt > 200) {
          logAt = t;
          console.log(`[thumbOpp] 목표=${target} 최근접=${nearest} (인정 ≤ ${touchT}) ` +
                      order.map((k) => `${label[k]}=${g[k].toFixed(2)}`).join(' ') +
                      `${justCounted ? ' ✅ 한 바퀴 인정' : ''}`);
        }
      }
      return { justCounted, hint: justCounted ? '잘했어요!' : `다음: ${label[order[idx]]}` };
    },
    reset() { idx = 0; },
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
  fingerSpread: fingerSpreadDetector,
  thumbOpposition: thumbOppositionDetector,
};

/** 실재하는 판정기 이름 — 배선표(guideData의 detect, games/registry의 detect)가
 *  가리키는 이름이 진짜인지 테스트가 확인할 수 있게 내보낸다.
 *  createDetector가 모르는 이름에 '무동작 판정기'를 돌려주기 때문에 필요하다:
 *  오타가 나도 예외가 안 나고, 그 운동만 영영 카운트가 안 오른다(조용히 깨진다). */
export const DETECTOR_TYPES = Object.freeze(Object.keys(DETECTORS));

export function createDetector(type, opts) {
  const make = DETECTORS[type];
  // 모르는 이름이면 무동작 판정기 — 화면이 죽는 것보다 낫다(진행은 [건너뛰기]로 가능).
  // 대신 "이름이 진짜인가"는 배선표 테스트가 DETECTOR_TYPES로 막는다.
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
/** timed 스텝의 라운드 수 — 없으면 1회. 양쪽 손을 번갈아 하는 스트레칭이 reps:2다. */
const timedReps = (step) => Math.max(1, step.reps ?? 1);

export function createStepEngine(guide, handlers = {}) {
  const steps = guide.steps;
  let i = -1, stepStart = 0, detector = null, count = 0, roundStart = 0;
  let armed = false, lastCountAt = 0, idleShown = false;
  let done = false; // onComplete 1회 보장 (완료 후 update가 매 프레임 재발화하는 것 방지)

  function enter(index, now) {
    i = index;
    const step = steps[i];
    stepStart = now;
    count = 0; armed = false; idleShown = false; lastCountAt = now; roundStart = now;
    detector = step.type === 'follow' ? createDetector(step.detect, step.detectOpts) : null;
    handlers.onEnterStep?.(step, i, steps.length);
    if (step.type === 'follow') {
      handlers.onCount?.(0, step.reps);
      handlers.onNeedNeutral?.(step); // 중립 잡은 뒤 arm()
    } else if (step.type === 'timed') {
      // 중립도 인식도 없다 — 타이머는 스텝에 들어온 순간부터 흐른다(arm 불필요).
      handlers.onCount?.(0, timedReps(step));
      armed = true;
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

    // timed — holdSec초를 reps라운드. 인식이 없으므로 15초 탈출구도 없다(§6의 탈출구는
    // "인식이 안 된다"에 대한 구제책인데, 여기엔 인식 실패라는 개념 자체가 없다).
    // snap은 쓰지 않는다 — 카메라가 없는 세션에서도 그대로 도는 이유.
    if (step.type === 'timed') {
      const reps = timedReps(step);
      const holdMs = Math.max(0, (step.holdSec ?? 3) * 1000);
      const held = now - roundStart;
      if (held >= holdMs) {
        count++;
        handlers.onCount?.(count, reps);
        if (count >= reps) { next(now); return; }
        roundStart = now;   // 다음 라운드(반대쪽 손 등)
        handlers.onStatus?.({ hint: step.hint || '', comp: false, idle: false, progress: 0 });
        return;
      }
      handlers.onStatus?.({
        hint: step.hint || '', comp: false, idle: false,
        progress: holdMs > 0 ? Math.min(1, held / holdMs) : 1,
      });
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
