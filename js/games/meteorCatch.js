// ═══════════════════════════════════════════════════════════
// games/meteorCatch.js — 미니게임 ③ 유성우 받기
//
// 손목을 좌우로 기울이면 바구니가 따라 움직인다. 양쪽 끝의 유성을 한 번씩 받으면 1회.
// deviation(좌우 편위) 운동의 두 번째 얼굴이다.
//
// ★유성이 스스로 떨어지지 않는다. 이게 이 게임의 설계에서 가장 중요한 선택이다.
//   떨어지는 속도로 재촉하면 같은 반복수가 더 힘들어지고, 그러면 아무도 게임 쪽을
//   안 고른다 — "운동 위에 부담을 얹지 않는다"(설계서 §1 성립조건 ②). 유성은
//   사용자가 그 끝에 닿을 때까지 기다리고, 닿는 순간 바구니로 내려온다. 조준도
//   타이밍도 없다. 사용자가 하는 일은 손목을 좌우로 기울이는 것뿐이다.
//
// 좌우 어느 쪽이 요측(엄지쪽)인지는 고정이 아니다 — 별 줍기와 같은 이유로, 판정기가
// 손별 부호 정규화(deviationRel) 없이 화면 기준 rel을 본다. 바구니가 손을 실시간으로
// 따라가므로 방향은 한 번 움직여 보면 알고, 왕복 판정은 양쪽 끝을 다 요구하므로
// 어느 손이든 똑같이 성립한다.
//
// 별 줍기와 라운드 규칙이 완전히 같아서 engine의 createAxisRounds를 함께 쓴다.
// 이 파일은 그림과 기하만 갖는다 — 축이 세로가 아니라 가로라는 것이 유일한 차이다.
// ═══════════════════════════════════════════════════════════
import {
  createStage, createParticles, createLoop, reducedMotion,
  drawNightSky, starPath, createAxisRounds, createFlights,
} from './engine.js';

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {number} o.reps        왕복 횟수 — routine.js:getRoutineGuide가 준 값
 * @param {object} o.detector    createDetector('deviation') — 게임이 만들지 않는다
 * @param {(n:number)=>void} o.onCount
 * @param {(hint:string)=>void} o.onHint
 * @param {()=>void} o.onDone
 */
export function createMeteorCatch({ canvas, reps, detector, onCount, onHint, onDone }) {
  const stage = createStage(canvas);
  const parts = createParticles();
  const flights = createFlights();
  const soft = reducedMotion();

  // 기하 — 가로축. t=0이 왼쪽(range.lo), t=1이 오른쪽(range.hi).
  const xLo = () => stage.W * 0.18;
  const xHi = () => stage.W * 0.82;
  const skyY = () => stage.H * 0.20;          // 유성이 떠 있는 높이
  const basketY = () => stage.H * 0.74;
  const starR = () => Math.min(22, Math.max(13, stage.W / 16));
  const endX = (key) => (key === 'hi' ? xHi() : xLo());

  /** 바구니 위치 — 유성이 여기로 떨어지므로 flights의 표적이기도 하다 */
  const basket = () => ({ x: xLo() + (xHi() - xLo()) * rounds.t, y: basketY() });

  const rounds = createAxisRounds({
    reps, detector, onCount, onHint, onDone,
    onEnd: (key) => {
      // 유성은 자기 자리에서 출발해 바구니로 내려온다(바구니는 이미 그 끝에 와 있다)
      flights.add(endX(key), skyY());
      parts.burst(endX(key), skyY(), stage.token('star', '#fff4d2'), 12);
    },
  });

  /** 유성 — 별 + 꼬리. 대기 중엔 흐릿하고, 지금 갈 쪽이면 밝다. */
  function drawMeteor(key, isTarget, now) {
    if (rounds.taken(key)) return;   // 받은 유성은 flights가 그린다
    const { ctx } = stage;
    const gold = stage.token('star', '#fff4d2');
    const x = endX(key), y = skyY(), r = starR();
    // 꼬리는 화면 바깥쪽을 향한다 — 하늘에서 들어온 것처럼 보이게
    const dir = key === 'hi' ? 1 : -1;
    const bob = soft ? 0 : Math.sin(now * 0.0018 + (key === 'hi' ? 1.7 : 0)) * 3;

    ctx.save();
    ctx.globalAlpha = isTarget ? 0.75 : 0.3;
    const g = ctx.createLinearGradient(x + dir * r, y + bob, x + dir * r * 4.5, y + bob - r * 2.2);
    g.addColorStop(0, gold); g.addColorStop(1, 'rgba(255,244,210,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + dir * r * 0.8, y + bob);
    ctx.lineTo(x + dir * r * 4.2, y + bob - r * 2);
    ctx.stroke();
    ctx.restore();

    const pulse = isTarget && !soft ? 1 + Math.sin(now * 0.005) * 0.07 : 1;
    ctx.save();
    ctx.globalAlpha = isTarget ? 0.95 : 0.42;
    ctx.fillStyle = gold;
    if (isTarget) { ctx.shadowColor = gold; ctx.shadowBlur = 16; }
    starPath(ctx, x, y + bob, r * pulse);
    ctx.fill();
    ctx.restore();
  }

  /** 좌우 끝 표시 — 어디까지 가야 인정되는지 (임계의 시각화) */
  function drawRail() {
    const { ctx, H } = stage;
    const gold = stage.token('star', '#fff4d2');
    const y = basketY();

    ctx.save();
    ctx.strokeStyle = '#dfe6ff';
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(xLo(), y); ctx.lineTo(xHi(), y); ctx.stroke();
    ctx.restore();

    for (const key of ['lo', 'hi']) {
      const isTarget = rounds.target() === key;
      ctx.save();
      ctx.strokeStyle = gold;
      ctx.globalAlpha = isTarget ? 0.6 : 0.28;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(endX(key), y - H * 0.05); ctx.lineTo(endX(key), y + H * 0.05);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 바구니 — 손목 각도가 그대로 좌우 위치가 된다. 위가 열린 그릇. */
  function drawBasket() {
    const { ctx } = stage;
    const b = basket();
    const r = starR() * 1.3;

    ctx.save();
    ctx.strokeStyle = stage.token('accent', '#a9b6ff');
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(b.x - r, b.y); ctx.lineTo(b.x + r, b.y); ctx.stroke();
    ctx.restore();
  }

  function frame(now, dt) {
    const { ctx } = stage;
    drawNightSky(stage, now, soft);
    drawRail();

    const tk = rounds.target();
    drawMeteor('lo', tk === 'lo', now);
    drawMeteor('hi', tk === 'hi', now);
    drawBasket();

    // 표적이 매 프레임 바뀐다 — 유성이 '지금 그 자리의' 바구니로 떨어진다
    flights.draw(ctx, dt, basket(), stage.token('star', '#fff4d2'), starR());
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

    /** 매 프레임 tracking 루프에서 호출. 중립을 잡기 전에는 세션이 안 부른다. */
    feed(snap, now) { rounds.feed(snap, now); },

    stop() { loop.stop(); parts.clear(); flights.clear(); },
    destroy() { loop.stop(); stage.destroy(); },
    get cycles() { return rounds.cycles; },
  };
}
