// ═══════════════════════════════════════════════════════════
// games/starScoop.js — 미니게임 ② 별 줍기 (2층)
//
// 손목을 굽혔다 펴면 채반이 위아래로 움직인다. 두 층의 별을 한 번씩 주우면 1회.
// flex_ext 운동의 두 번째 얼굴이다.
//
// 어느 쪽이 굽힘인지는 고정이 아니다 — 판정기가 손별 부호 정규화(flexExtRel) 없이
// 화면 기준 rel을 그대로 보기 때문이다(가이드와 같은 규칙). 손을 어느 쪽으로 세우느냐에
// 따라 위아래가 바뀐다. 채반이 손을 실시간으로 따라가므로 사용자는 한 번 움직여 보면 알고,
// 왕복 판정은 양쪽 끝을 다 요구하므로 어느 손이든 똑같이 성립한다.
//
// ★별 따기와 결정적으로 다른 점: 각도 판정기에는 'progress'가 없다.
//   pinchHold는 유지 시간이 있어 빛이 차오르는 연출이 됐지만, flexExt는
//   "한쪽 끝 도달 → 반대쪽 끝 도달 = 1회"라 채워질 것이 없다. 그래서 이 게임의
//   피드백은 채움이 아니라 **위치**다 — 손목 각도가 채반의 높이를 그대로 움직여서,
//   임계에 닿기 전에도 "얼마나 더 가야 하는지"가 보인다.
//
// 임계값은 게임이 갖지 않는다. 판정기가 range(두 끝의 각도)와 ends(어느 끝을 찍어
// 뒀는지)를 feed의 반환에 실어 주고, engine의 createAxisRounds가 그것만 쓴다.
// 이 파일은 그림과 기하만 갖는다.
//
// 운동 위에 부담을 얹지 않는다 — 조준도 타이밍도 제한시간도 없다. 별은 층의
// 정중앙에 고정이고, 사용자가 하는 일은 손목을 굽혔다 펴는 것뿐이다(설계서 §1).
// ═══════════════════════════════════════════════════════════
import {
  createStage, createParticles, createLoop, reducedMotion,
  drawNightSky, starPath, createAxisRounds, createFlights,
} from './engine.js';

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {number} o.reps        왕복 횟수 — routine.js:getRoutineGuide가 준 값
 * @param {object} o.detector    createDetector('flexExt') — 게임이 만들지 않는다
 * @param {(n:number)=>void} o.onCount
 * @param {(hint:string)=>void} o.onHint
 * @param {()=>void} o.onDone
 */
export function createStarScoop({ canvas, reps, detector, onCount, onHint, onDone }) {
  const stage = createStage(canvas);
  const parts = createParticles();
  const flights = createFlights();
  const soft = reducedMotion();

  // 마스코트 — 주운 별이 모이는 자리. 못 불러오면 그냥 안 그린다(게임은 그대로 돈다)
  const cat = new Image();
  cat.src = 'assets/cat-idle.png';

  // 기하 — 화면 크기에서 매번 계산한다(리사이즈 중에도 별과 선이 어긋나지 않게)
  const trackX = () => stage.W * 0.42;
  const yHi = () => stage.H * 0.20;          // t=1 (range.hi 끝)
  const yLo = () => stage.H * 0.78;          // t=0 (range.lo 끝)
  const starR = () => Math.min(24, Math.max(14, stage.W / 14));
  const endY = (key) => (key === 'hi' ? yHi() : yLo());

  // 라운드 계약은 engine이 갖는다 — 이 파일은 '언제 무엇을 그릴지'만 안다
  const rounds = createAxisRounds({
    reps, detector, onCount, onHint, onDone,
    onEnd: (key) => {
      const y = endY(key);
      flights.add(trackX(), y);
      parts.burst(trackX(), y, stage.token('star', '#fff4d2'), 14);
    },
  });

  function pocket() {
    const { W, H } = stage;
    const sz = Math.min(84, H * 0.24);
    return { x: W - sz * 0.6, y: H - sz * 0.55, sz };
  }

  function drawCat() {
    const { ctx, H } = stage;
    const p = pocket();
    if (cat.complete && cat.naturalWidth) {
      ctx.drawImage(cat, p.x - p.sz / 2, H - p.sz - 6, p.sz, p.sz);
    }
    return p;
  }

  /** 층 하나 — 받침선(임계의 시각화) + 아직 안 주운 별 */
  function drawShelf(key, isTarget, now) {
    const { ctx, W } = stage;
    const gold = stage.token('star', '#fff4d2');
    const x = trackX(), y = endY(key);

    // 받침선 — 어디까지 가야 인정되는지를 선으로 못 박는다
    ctx.save();
    ctx.strokeStyle = gold;
    ctx.globalAlpha = isTarget ? 0.6 : 0.28;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - W * 0.16, y); ctx.lineTo(x + W * 0.16, y);
    ctx.stroke();
    ctx.restore();

    if (rounds.taken(key)) return;   // 주운 별은 flights가 그린다

    const pulse = isTarget && !soft ? 1 + Math.sin(now * 0.005) * 0.07 : 1;
    ctx.save();
    ctx.globalAlpha = isTarget ? 0.95 : 0.4;
    ctx.fillStyle = gold;
    if (isTarget) { ctx.shadowColor = gold; ctx.shadowBlur = 16; }
    starPath(ctx, x, y, starR() * pulse);
    ctx.fill();
    ctx.restore();
  }

  /** 채반 — 손목 각도가 그대로 높이가 된다. 위가 열린 그릇. */
  function drawScoop() {
    const { ctx } = stage;
    const x = trackX();
    const y = yLo() + (yHi() - yLo()) * rounds.t;
    const r = starR() * 1.15;

    ctx.save();
    ctx.strokeStyle = stage.token('accent', '#a9b6ff');
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.stroke();
    ctx.restore();
  }

  function drawTrack() {
    const { ctx } = stage;
    const x = trackX();
    ctx.save();
    ctx.strokeStyle = '#dfe6ff';
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(x, yHi()); ctx.lineTo(x, yLo()); ctx.stroke();
    ctx.restore();
  }

  function frame(now, dt) {
    const { ctx } = stage;
    drawNightSky(stage, now, soft);
    const p = drawCat();
    drawTrack();

    const tk = rounds.target();
    drawShelf('hi', tk === 'hi', now);
    drawShelf('lo', tk === 'lo', now);
    drawScoop();

    flights.draw(ctx, dt, p, stage.token('star', '#fff4d2'), starR());
    parts.update(dt);
    parts.draw(ctx);
  }

  const loop = createLoop(frame);

  return {
    start() {
      stage.readTokens(['star', 'ok', 'accent']);
      stage.fit();
      rounds.reset();
      flights.clear();
      loop.start();
    },

    /** 매 프레임 tracking 루프에서 호출 — snap은 tracker.update()의 반환값 그대로.
     *  중립을 잡기 전에는 세션이 이걸 안 부른다(rel이 0에 고정돼 있어 의미가 없다). */
    feed(snap, now) { rounds.feed(snap, now); },

    stop() { loop.stop(); parts.clear(); flights.clear(); },
    destroy() { loop.stop(); stage.destroy(); },
    get cycles() { return rounds.cycles; },
  };
}
