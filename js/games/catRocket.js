// ═══════════════════════════════════════════════════════════
// games/catRocket.js — 미니게임 ② 고양이 로켓
//
// 손목을 한쪽 끝까지 굽혔다가 반대 끝까지 펴면 로켓이 한 단계 솟는다.
// 양 끝을 한 번씩 지나면 1회. flex_ext 운동의 두 번째 얼굴이다.
//
// ★이 파일은 '별 줍기'(그리고 잠깐 있었던 '달 채우기')를 대체한다. 갈아엎은 이유:
//   별 줍기는 세로축 + 양 끝 + 손목을 따라다니는 채반이었고, 유성우 받기는 가로축 +
//   양 끝 + 손목을 따라다니는 바구니였다. 축 방향과 담는 물건만 다른, 사실상 같은
//   게임을 90° 돌린 것이었다 — 사용자가 "같은 게임 같은데"로 알아봤다.
//
// ★그래서 여기엔 **축을 따라 움직이는 것이 없다.** 로켓은 화면 한가운데 붙박이고
//   대신 배경이 흐른다. 손목 각도는 위치가 아니라 **힘**이다 — 웅크렸다 뻗는 몸짓과
//   불꽃의 길이로 나타난다. 유성우와 같은 마스코트를 쓰지만 실루엣이 다르다(맨몸으로
//   좌우로 뛰는 고양이 ↔ 로켓 창에 앉은 고양이). 인물이 같아도 그림은 안 겹친다.
//
// ★연속 피드백은 유지한다(별 줍기가 잘한 것). 각도 판정기에는 'progress'가 없어
//   채워질 것이 없지만, 손목 각도 t가 불꽃 길이와 로켓의 웅크림을 그대로 움직여서
//   임계에 닿기 전에도 "얼마나 더 가야 하는지"가 보인다.
//
// ★어느 쪽 끝이 '웅크림'인지는 고정이 아니다 — 판정기가 손별 부호 정규화(flexExtRel)
//   없이 화면 기준 rel을 본다(가이드와 같은 규칙). 손을 어느 쪽으로 세우느냐에 따라
//   굽힘이 t=0일 수도 t=1일 수도 있다. 왕복 판정은 양 끝을 다 요구하므로 어느 손이든
//   똑같이 성립하고, 불꽃이 실시간으로 반응하므로 한 번 움직여 보면 안다.
//
// 임계값은 게임이 갖지 않는다 — 판정기가 range·ends를 주고 engine의 createAxisRounds가
// 그것만 쓴다. 이 파일은 그림과 기하만 갖는다.
//
// 운동 위에 부담을 얹지 않는다 — 조준도 타이밍도 제한시간도 없다. 로켓은 재촉하지 않고
// 손목이 왕복한 만큼만 오른다(설계서 §1).
// ═══════════════════════════════════════════════════════════
import {
  createStage, createParticles, createLoop, reducedMotion,
  drawNightSky, createAxisRounds,
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
export function createCatRocket({ canvas, reps, detector, onCount, onHint, onDone }) {
  const stage = createStage(canvas);
  const parts = createParticles();
  const soft = reducedMotion();

  // 조종석의 마스코트 — 못 불러오면 창만 비워 두고 게임은 그대로 돈다
  const cat = new Image();
  cat.src = 'assets/cat-idle.png';

  // 로켓은 붙박이 — 축을 따라 움직이는 것이 하나도 없어야 유성우와 안 겹친다
  const cx = () => stage.W / 2;
  const cy = () => stage.H * 0.52;
  const bodyH = () => Math.min(stage.H * 0.34, stage.W * 0.5);

  // 흐르는 배경 — 상승감은 로켓이 아니라 여기서 나온다.
  // 위치는 결정론적으로 뽑고 흐름만 누적한다(프레임마다 별이 새로 나지 않게).
  const LANES = 26;
  let flow = 0;       // 누적 흐름(px)
  let boost = 0;      // 한 단계 오를 때 잠깐 빨라지는 양

  const rounds = createAxisRounds({
    reps, detector, onCount: (n) => { boost = soft ? 0 : 260; onCount?.(n); },
    onHint,
    onDone,
    onEnd: () => {
      // 끝에 닿을 때마다 노즐에서 불티가 인다 — 어느 끝이든 같은 연출이다
      parts.burst(cx(), cy() + bodyH() * 0.62, stage.token('star', '#fff4d2'), 12);
    },
  });

  /** 지나가는 별 — 아래로 흐를수록 빠르게 오르는 것처럼 보인다 */
  function drawFlow(dt) {
    const { ctx, W, H } = stage;
    const base = 26 + rounds.cycles * 10;             // 고도가 오를수록 조금씩 빨라진다
    flow = (flow + (base + boost) * dt) % 10000;
    boost = Math.max(0, boost - 420 * dt);

    for (let i = 0; i < LANES; i++) {
      const x = ((i * 83) % 100) / 100 * W;
      const span = H + 40;
      const y = ((((i * 149) % 100) / 100 * span) + flow * (0.6 + (i % 5) * 0.18)) % span - 20;
      const len = 4 + (i % 4) * 5;
      ctx.save();
      ctx.globalAlpha = 0.18 + (i % 3) * 0.08;
      ctx.strokeStyle = '#dfe6ff';
      ctx.lineWidth = i % 4 ? 1 : 1.6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + len); ctx.stroke();
      ctx.restore();
    }
  }

  /** 불꽃 — 손목 각도가 그대로 길이가 된다. 이 게임의 연속 피드백은 전부 여기 있다. */
  function drawFlame(now) {
    const { ctx } = stage;
    const h = bodyH();
    const x = cx(), y = cy() + h * 0.5;
    const power = 0.25 + rounds.t * 0.75;             // t가 0이어도 꺼지지는 않는다
    const flick = soft ? 1 : 1 + Math.sin(now * 0.02) * 0.08;
    const len = h * 0.95 * power * flick;
    const w = h * 0.22 * (0.7 + power * 0.5);

    const g = ctx.createLinearGradient(x, y, x, y + len);
    g.addColorStop(0, stage.token('star', '#fff4d2'));
    g.addColorStop(1, 'rgba(255,180,90,0)');

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x, y + len * 0.55, x, y + len);
    ctx.quadraticCurveTo(x, y + len * 0.55, x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** 로켓 — 각도가 셀수록 몸을 뻗는다(웅크림 ↔ 뻗음). 위치는 절대 안 움직인다. */
  function drawRocket() {
    const { ctx } = stage;
    const h = bodyH();
    const w = h * 0.46;
    const x = cx(), y = cy();
    const stretch = 0.9 + rounds.t * 0.2;             // 웅크렸다 뻗는 몸짓
    const ink = stage.token('accent', '#a9b6ff');
    const gold = stage.token('star', '#fff4d2');

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, stretch);

    // 날개
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, h * 0.18); ctx.lineTo(-w * 0.95, h * 0.5); ctx.lineTo(-w * 0.5, h * 0.5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.18); ctx.lineTo(w * 0.95, h * 0.5); ctx.lineTo(w * 0.5, h * 0.5);
    ctx.closePath(); ctx.fill();

    // 동체 — 위가 뾰족한 캡슐
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#eef1f8';
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.5);
    ctx.quadraticCurveTo(w * 0.55, -h * 0.16, w * 0.5, h * 0.5);
    ctx.lineTo(-w * 0.5, h * 0.5);
    ctx.quadraticCurveTo(-w * 0.55, -h * 0.16, 0, -h * 0.5);
    ctx.closePath();
    ctx.fill();

    // 창 — 고양이가 앉는 자리
    const r = w * 0.3;
    ctx.save();
    ctx.beginPath(); ctx.arc(0, -h * 0.06, r, 0, Math.PI * 2);
    ctx.fillStyle = '#2c3468'; ctx.fill();
    ctx.clip();
    if (cat.complete && cat.naturalWidth) {
      const s = r * 2.5;
      ctx.drawImage(cat, -s / 2, -h * 0.06 - s * 0.52, s, s);
    }
    ctx.restore();

    ctx.strokeStyle = gold; ctx.globalAlpha = 0.55; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, -h * 0.06, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  /** 고도계 — 오른쪽 세로 눈금. 한 칸이 1회다. */
  function drawAltimeter() {
    const { ctx, W, H } = stage;
    const n = Math.max(1, reps);
    const x = W - Math.min(34, W * 0.09);
    const top = H * 0.22, bot = H * 0.78;
    const gold = stage.token('star', '#fff4d2');

    ctx.save();
    ctx.strokeStyle = gold; ctx.globalAlpha = 0.18; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    ctx.restore();

    for (let i = 0; i < n; i++) {
      const y = bot - ((bot - top) * i) / Math.max(1, n - 1);
      const on = i < rounds.cycles;
      ctx.save();
      ctx.globalAlpha = on ? 1 : 0.3;
      ctx.strokeStyle = gold; ctx.lineWidth = on ? 3 : 2;
      ctx.beginPath(); ctx.moveTo(x - (on ? 11 : 6), y); ctx.lineTo(x + (on ? 11 : 6), y); ctx.stroke();
      ctx.restore();
    }
  }

  function frame(now, dt) {
    const { ctx } = stage;
    drawNightSky(stage, now, soft);
    drawFlow(dt);
    drawFlame(now);
    drawRocket();
    drawAltimeter();
    parts.update(dt);
    parts.draw(ctx);
  }

  const loop = createLoop(frame);

  return {
    start() {
      stage.readTokens(['star', 'ok', 'accent']);
      stage.fit();
      rounds.reset();
      flow = 0; boost = 0;
      loop.start();
    },

    /** 매 프레임 tracking 루프에서 호출 — snap은 tracker.update()의 반환값 그대로.
     *  중립을 잡기 전에는 세션이 이걸 안 부른다(rel이 0에 고정돼 있어 의미가 없다). */
    feed(snap, now) { rounds.feed(snap, now); },

    stop() { loop.stop(); parts.clear(); },
    destroy() { loop.stop(); stage.destroy(); },
    get cycles() { return rounds.cycles; },
  };
}
