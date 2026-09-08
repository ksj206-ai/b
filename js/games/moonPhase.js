// ═══════════════════════════════════════════════════════════
// games/moonPhase.js — 미니게임 ② 달 채우기
//
// 손목을 한쪽 끝까지 올리면 달이 차오르고(보름), 반대 끝으로 내리면 기운다(그믐).
// 양 끝을 한 번씩 찍으면 1회. flex_ext 운동의 두 번째 얼굴이다.
//
// ★이 파일은 '별 줍기'를 대체한다. 왜 갈아엎었는지가 중요하다:
//   별 줍기는 세로축 + 양 끝 + 손목을 따라다니는 채반이었고, 유성우 받기는 가로축 +
//   양 끝 + 손목을 따라다니는 바구니였다. 축 방향과 주워 담는 물건만 다른, 사실상
//   **같은 게임을 90° 돌린 것**이었다. 사용자가 "같은 게임 같은데"로 알아봤다.
//   판정기가 주는 입력이 `축 위의 위치 t(0~1)` + `어느 끝을 찍었나` 뿐이라, 그걸 그대로
//   그림으로 옮기면 두 각도 게임은 필연적으로 같은 모양이 된다. 그래서 **입력이 아니라
//   이야기로 갈랐다**: 여기엔 축도, 그릇도, 받을 물건도 없다. 화면 한가운데 달 하나뿐이다.
//
// ★연속 피드백은 유지한다(별 줍기가 잘한 것). 각도 판정기에는 'progress'가 없어서
//   채워질 것이 없지만, 손목 각도 t가 **달의 위상 그 자체**라 임계에 닿기 전에도
//   "얼마나 더 가야 하는지"가 보인다. 채반의 높이가 하던 일을 달의 차오름이 한다.
//
// 임계값은 게임이 갖지 않는다 — 판정기가 range·ends를 주고 engine의 createAxisRounds가
// 그것만 쓴다. 이 파일은 그림과 기하만 갖는다(별 따기·유성우와 같은 규칙).
//
// 운동 위에 부담을 얹지 않는다 — 조준도 타이밍도 제한시간도 없다. 달은 재촉하지 않고
// 손목이 가는 만큼만 찬다(설계서 §1).
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
export function createMoonPhase({ canvas, reps, detector, onCount, onHint, onDone }) {
  const stage = createStage(canvas);
  const parts = createParticles();
  const soft = reducedMotion();

  // 기하 — 달 하나가 화면 한가운데. 매 프레임 크기에서 계산한다(리사이즈 대응).
  const cx = () => stage.W / 2;
  const cy = () => stage.H * 0.46;
  const R = () => Math.min(stage.W, stage.H) * 0.26;

  const rounds = createAxisRounds({
    reps, detector, onCount, onHint, onDone,
    onEnd: () => {
      // 끝에 닿으면 달 테두리에서 별가루가 인다 — 어느 끝이든 같은 연출이다.
      // (별 줍기는 끝마다 별이 하나씩 날아갔지만, 여기엔 주울 물건이 없다.)
      parts.burst(cx(), cy(), stage.token('star', '#fff4d2'), 16);
    },
  });

  /**
   * 달 위상 — f=0 그믐(거의 안 보임), f=1 보름(꽉 참).
   *
   * 밝은 원반을 그린 뒤 같은 크기의 그림자 원을 옆으로 밀어 깎아낸다(destination-out).
   * 경계가 직선이 아니라 원호라 반달에서도 살짝 통통한데, 실제 달도 그렇게 보이고
   * 무엇보다 **어느 각도에서든 모양이 매끄럽게 변한다** — 손목을 조금 움직여도 달이
   * 그만큼 변해야 연속 피드백이 성립한다.
   */
  function drawMoon(f) {
    const { ctx } = stage;
    const x = cx(), y = cy(), r = R();
    const gold = stage.token('star', '#fff4d2');

    // 달이 앉을 자리 — 그믐에 가까워도 원반의 윤곽은 남긴다(사라진 게 아니라 기운 것)
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = gold;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // 밝은 원반 → 그림자로 깎기. 별도 레이어에서 깎아야 밤하늘이 같이 지워지지 않는다.
    const lit = document.createElement('canvas');
    lit.width = Math.ceil(r * 2 + 8);
    lit.height = Math.ceil(r * 2 + 8);
    const lc = lit.getContext('2d');
    const lx = lit.width / 2, ly = lit.height / 2;

    lc.beginPath(); lc.arc(lx, ly, r, 0, Math.PI * 2);
    lc.fillStyle = gold; lc.fill();

    lc.globalCompositeOperation = 'destination-out';
    lc.beginPath(); lc.arc(lx - 2 * r * f, ly, r, 0, Math.PI * 2);
    lc.fill();

    ctx.save();
    if (f > 0.05) { ctx.shadowColor = gold; ctx.shadowBlur = 24 * f; }
    ctx.drawImage(lit, x - lx, y - ly);
    ctx.restore();
  }

  /**
   * 지금 어느 쪽으로 가야 하는지 — 달 둘레의 얇은 호 하나.
   * 목표가 보름(hi)이면 차오르는 만큼, 그믐(lo)이면 기우는 만큼 호가 길어진다.
   * 화살표나 글자를 안 쓰는 이유: 손이 어느 쪽으로 세워졌느냐에 따라 위아래가 뒤집혀서
   * (판정기가 손별 부호 정규화를 안 한다) "위로 올리세요"가 절반에게 틀린 말이 된다.
   */
  function drawGoalRing(now) {
    const { ctx } = stage;
    const key = rounds.target();
    if (!key) return;
    const progress = key === 'hi' ? rounds.t : 1 - rounds.t;
    const x = cx(), y = cy(), r = R() * 1.22;
    const pulse = soft ? 0 : Math.sin(now * 0.004) * 0.06;

    ctx.save();
    ctx.strokeStyle = stage.token('accent', '#a9b6ff');
    ctx.globalAlpha = 0.5 + pulse;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, progress));
    ctx.stroke();
    ctx.restore();
  }

  /** 남은 회차 — 달 아래 작은 점. 채운 만큼 밝아진다. */
  function drawTally() {
    const { ctx, W } = stage;
    const n = Math.max(1, reps);
    const gap = Math.min(18, W / (n + 6));
    const y = cy() + R() * 1.6;
    const x0 = cx() - (gap * (n - 1)) / 2;
    const gold = stage.token('star', '#fff4d2');

    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.globalAlpha = i < rounds.cycles ? 0.9 : 0.22;
      ctx.fillStyle = gold;
      ctx.beginPath(); ctx.arc(x0 + gap * i, y, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function frame(now, dt) {
    const { ctx } = stage;
    drawNightSky(stage, now, soft);
    drawGoalRing(now);
    drawMoon(rounds.t);
    drawTally();
    parts.update(dt);
    parts.draw(ctx);
  }

  const loop = createLoop(frame);

  return {
    start() {
      stage.readTokens(['star', 'ok', 'accent']);
      stage.fit();
      rounds.reset();
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
