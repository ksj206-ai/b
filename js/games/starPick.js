// ═══════════════════════════════════════════════════════════
// games/starPick.js — 미니게임 ① 별 따기
//
// 떠도는 별을 엄지·검지로 집어 잠깐 유지하면 별이 고양이에게 모인다.
// 설계: docs/미니게임_별따기_설계.md
//
// 이 게임은 pinch_hold 운동의 두 번째 얼굴이다 — 새 보상 체계가 아니다.
// 그래서 여기서 지키는 것 둘:
//   · 판정을 새로 만들지 않는다 — stepEngine의 createDetector('pinchHold') 그대로.
//     임계값·유지시간을 게임이 따로 정하면 적응형 강도를 우회하는 샛길이 된다.
//   · 운동 위에 부담을 얹지 않는다 — 조준도 타이밍도 제한시간도 없다.
//     집을 별은 게임이 지목한다. 사용자가 하는 일은 집는 것뿐이다.
//
// 무대는 "오늘의 별자리"가 아니라 떠도는 별이다. 별자리 점등의 주체는
// store.js:syncStarsToProgress 하나로 남겨 둔다(설계서 §3).
// ═══════════════════════════════════════════════════════════
import {
  createStage, createParticles, createLoop, reducedMotion, drawNightSky, starPath,
} from './engine.js';

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {number} o.reps        집을 별 개수 — routine.js:getRoutineGuide가 준 값
 * @param {object} o.detector    createDetector('pinchHold') — 게임이 만들지 않는다
 * @param {(n:number)=>void} o.onCount
 * @param {(hint:string)=>void} o.onHint
 * @param {()=>void} o.onDone
 */
export function createStarPick({ canvas, reps, detector, onCount, onHint, onDone }) {
  const stage = createStage(canvas);
  const parts = createParticles();
  const soft = reducedMotion();

  // 마스코트 — 별이 모이는 자리. 못 불러오면 그냥 안 그린다(게임은 그대로 돈다)
  const cat = new Image();
  cat.src = 'assets/cat-idle.png';

  let stars = [], collected = 0, progress = 0, done = false, lastHint = '';

  /** 별 배치 — 위 2/3에 흩되 서로 너무 붙지 않게. 화면 비율이 바뀌면 다시 뿌린다. */
  function layout() {
    const W = stage.W, H = stage.H, n = Math.max(1, reps);
    const keep = stars.map((s) => s.taken);           // 진행 중 리사이즈에도 수집 상태 유지
    stars = [];
    for (let i = 0; i < n; i++) {
      // 가로로 고르게 나누고 세로만 흔든다 — 무작위로 두면 뭉치는 배치가 자주 나온다
      const cell = W / n;
      stars.push({
        x: cell * (i + 0.5) + (Math.random() - 0.5) * cell * 0.4,
        y: H * (0.18 + Math.random() * 0.36),
        r: Math.min(26, Math.max(15, W / (n * 2.6))),
        ph: Math.random() * 6.28,
        taken: keep[i] ?? false,
        fly: null,
      });
    }
  }

  function targetIdx() { return stars.findIndex((s) => !s.taken); }

  function drawCat() {
    const { ctx, W, H } = stage;
    const s = Math.min(96, H * 0.26);
    if (cat.complete && cat.naturalWidth) {
      ctx.drawImage(cat, W / 2 - s / 2, H - s - 6, s, s);
    }
    return { x: W / 2, y: H - s * 0.55 }; // 별이 날아가 모이는 자리
  }

  function drawStar(s, isTarget, t) {
    const { ctx } = stage;
    const gold = stage.token('star', '#fff4d2');
    const bob = soft ? 0 : Math.sin(t * 0.0016 + s.ph) * 3;
    const x = s.x, y = s.y + bob;
    const pulse = isTarget && !soft ? 1 + Math.sin(t * 0.005) * 0.06 : 1;
    const r = s.r * pulse * (isTarget ? 1.25 : 1);

    // 밑그림 — 아직 안 딴 별은 흐릿하게
    ctx.save();
    ctx.globalAlpha = isTarget ? 0.34 : 0.22;
    ctx.fillStyle = gold;
    starPath(ctx, x, y, r); ctx.fill();
    ctx.restore();

    if (!isTarget) return;

    // 지금 집는 별 — 아래에서 위로 빛이 차오른다 (판정기의 progress 그대로)
    if (progress > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(x - r, y + r - 2 * r * progress, 2 * r, 2 * r * progress);
      ctx.clip();
      ctx.fillStyle = gold;
      ctx.shadowColor = gold; ctx.shadowBlur = 18;
      starPath(ctx, x, y, r); ctx.fill();
      ctx.restore();
    }
    // 테두리 — 어디를 보고 있어야 하는지
    ctx.save();
    ctx.strokeStyle = gold; ctx.globalAlpha = 0.85; ctx.lineWidth = 2;
    starPath(ctx, x, y, r); ctx.stroke();
    ctx.restore();
  }

  function frame(now, dt) {
    const { ctx } = stage;
    drawNightSky(stage, now, soft);
    const pocket = drawCat();
    const ti = targetIdx();

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (s.fly) {
        // 딴 별이 고양이에게 날아간다
        s.fly.t = Math.min(1, s.fly.t + dt * 2.2);
        const k = 1 - (1 - s.fly.t) * (1 - s.fly.t);
        const x = s.fly.x0 + (pocket.x - s.fly.x0) * k;
        const y = s.fly.y0 + (pocket.y - s.fly.y0) * k;
        ctx.save();
        ctx.globalAlpha = 1 - k * 0.7;
        ctx.fillStyle = stage.token('star', '#fff4d2');
        starPath(ctx, x, y, s.r * (1 - k * 0.5), k * 3);
        ctx.fill();
        ctx.restore();
        if (s.fly.t >= 1) s.fly = null;
        continue;
      }
      if (s.taken) continue;
      drawStar(s, i === ti, now);
    }

    parts.update(dt);
    parts.draw(ctx);
  }

  const loop = createLoop(frame);

  return {
    start() {
      stage.readTokens(['star', 'ok', 'accent']);
      stage.fit();
      layout();
      collected = 0; progress = 0; done = false;
      detector.reset();
      loop.start();
    },

    /** 매 프레임 tracking 루프에서 호출 — snap은 tracker.update()의 반환값 그대로 */
    feed(snap, now) {
      if (done) return;
      const res = detector.feed(snap, now) || {};
      progress = res.progress ?? 0;

      if (res.hint && res.hint !== lastHint) { lastHint = res.hint; onHint?.(res.hint); }

      if (res.justCounted) {
        const i = targetIdx();
        if (i >= 0) {
          const s = stars[i];
          s.taken = true;
          s.fly = { t: 0, x0: s.x, y0: s.y };
          parts.burst(s.x, s.y, stage.token('star', '#fff4d2'), 14);
        }
        collected++;
        progress = 0;
        onCount?.(collected);
        if (collected >= reps) { done = true; onDone?.(); }
      }
    },

    stop() { loop.stop(); parts.clear(); },
    destroy() { loop.stop(); stage.destroy(); },
    get collected() { return collected; },
  };
}
