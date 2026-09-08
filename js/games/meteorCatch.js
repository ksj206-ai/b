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
// 좌우 어느 쪽이 요측(엄지쪽)인지는 고정이 아니다 — 달 채우기와 같은 이유로, 판정기가
// 손별 부호 정규화(deviationRel) 없이 화면 기준 rel을 본다. 바구니가 손을 실시간으로
// 따라가므로 방향은 한 번 움직여 보면 알고, 왕복 판정은 양쪽 끝을 다 요구하므로
// 어느 손이든 똑같이 성립한다.
//
// ★받는 주체가 바구니가 아니라 고양이다. 전에는 그릇이 축을 따라 움직였는데, 그건
//   별 줍기(세로축 + 채반)와 축 방향만 다른 같은 그림이었다 — 사용자가 "같은 게임
//   같은데"로 알아봤다. 라운드 규칙(createAxisRounds)은 여전히 공유하지만, 화면에서
//   공통 요소를 없앤다: 저쪽은 달 하나뿐이고(축도 그릇도 없다) 이쪽은 마스코트가
//   좌우로 뛰어다닌다. 같은 배관 위에 다른 이야기를 얹는 것이지, 같은 그림이 아니다.
//   마스코트를 쓰는 건 덤이 아니라 회수다 — 홈에서 하루를 같이 보낸 그 고양이가
//   여기서도 주인공이면, 게임이 앱 밖의 별책부록처럼 보이지 않는다.
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

  // 마스코트 — 유성을 받는 주체. 못 불러오면 그리지 않고 게임은 그대로 돈다
  // (별 따기가 쓰는 것과 같은 파일·같은 실패 처리).
  const cat = new Image();
  cat.src = 'assets/cat-idle.png';

  // 기하 — 가로축. t=0이 왼쪽(range.lo), t=1이 오른쪽(range.hi).
  const xLo = () => stage.W * 0.18;
  const xHi = () => stage.W * 0.82;
  const skyY = () => stage.H * 0.20;          // 유성이 떠 있는 높이
  const trackY = () => stage.H * 0.74;
  const starR = () => Math.min(22, Math.max(13, stage.W / 16));
  const endX = (key) => (key === 'hi' ? xHi() : xLo());

  /** 고양이 위치 — 유성이 여기로 내려오므로 flights의 표적이기도 하다 */
  const catSpot = () => ({ x: xLo() + (xHi() - xLo()) * rounds.t, y: trackY() });

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
    const y = trackY();

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

  /** 고양이 — 손목 각도가 그대로 좌우 위치가 된다. 그릇 대신 마스코트가 받는다. */
  function drawCat() {
    const { ctx } = stage;
    const b = catSpot();
    const sz = Math.min(96, stage.H * 0.3);
    if (!(cat.complete && cat.naturalWidth)) return;
    // 가는 쪽으로 살짝 기운다 — 방향이 몸짓으로 읽히게. 정지 상태(t=0.5)에선 똑바로.
    const tilt = (rounds.t - 0.5) * (soft ? 0 : 0.35);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(tilt);
    ctx.drawImage(cat, -sz / 2, -sz * 0.62, sz, sz);
    ctx.restore();
  }

  function frame(now, dt) {
    const { ctx } = stage;
    drawNightSky(stage, now, soft);
    drawRail();

    const tk = rounds.target();
    drawMeteor('lo', tk === 'lo', now);
    drawMeteor('hi', tk === 'hi', now);
    drawCat();

    // 표적이 매 프레임 바뀐다 — 유성이 '지금 그 자리의' 고양이에게 내려온다
    flights.draw(ctx, dt, catSpot(), stage.token('star', '#fff4d2'), starR());
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
