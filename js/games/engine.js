// ═══════════════════════════════════════════════════════════
// games/engine.js — 미니게임 공용 부품
//
// 게임마다 다시 쓰게 되는 세 가지만 둔다: 캔버스 무대(DPR) · 파티클 · rAF 루프.
// "게임 프레임워크"를 만들지 않는다 — 참고한 이전 프로젝트(BBB)는 게임 6종이
// 1160줄 한 파일에 s.mode 분기로 들어가 두 번째 게임부터 무너졌다. 여기서는
// 게임마다 파일 하나를 쓰고, 둘 이상이 실제로 같이 쓰는 것만 이 파일로 내린다.
//
// 색은 CSS 토큰에서 읽는다(token 헬퍼). 캔버스는 var()를 모르므로 실행 시점에
// 계산값을 가져와야 팔레트 2종 × 다크/라이트를 그대로 따라간다.
// ═══════════════════════════════════════════════════════════

/** prefers-reduced-motion — 파티클·흔들림을 끄는 기준 (접근성 원칙 ⑥) */
export const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * 캔버스 무대 — DPR 대응 + 리사이즈 추적 + CSS 토큰 읽기.
 * W/H는 CSS 픽셀 기준이라 게임 로직은 DPR을 몰라도 된다.
 */
export function createStage(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // 2 초과는 비용만 늘고 눈에 안 보인다
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width));
    H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // 토큰 캐시 — 매 프레임 getComputedStyle을 부르면 레이아웃을 강제로 계산하게 된다
  let tokens = {};
  function readTokens(names) {
    const cs = getComputedStyle(document.documentElement);
    tokens = {};
    for (const n of names) tokens[n] = cs.getPropertyValue('--' + n).trim();
  }

  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();

  return {
    ctx,
    get W() { return W; },
    get H() { return H; },
    fit,
    readTokens,
    token: (n, fallback) => tokens[n] || fallback,
    destroy() { ro.disconnect(); },
  };
}

/** 파티클 — 성공 순간의 흩뿌림 전용. reduced-motion이면 아무것도 안 쌓는다. */
export function createParticles() {
  let parts = [];
  const off = reducedMotion();
  return {
    add(x, y, color, o = {}) {
      if (off) return;
      parts.push({
        x, y, color,
        vx: o.vx ?? (Math.random() - 0.5) * 2.4,
        vy: o.vy ?? -Math.random() * 2.2 - 0.6,
        g: o.g ?? 9, r: o.r ?? 2.6, life: o.life ?? 0.75, t: 0,
      });
    },
    burst(x, y, color, n = 10) {
      for (let i = 0; i < n; i++) this.add(x, y, color, {});
    },
    update(dt) {
      for (const p of parts) { p.t += dt; p.x += p.vx; p.y += p.vy; p.vy += p.g * dt; }
      parts = parts.filter((p) => p.t < p.life);
    },
    draw(ctx) {
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    },
    clear() { parts = []; },
    get count() { return parts.length; },
  };
}

/**
 * rAF 루프 — onFrame(now, dt). dt는 초 단위이고 0.05로 상한을 둔다
 * (탭을 두고 돌아왔을 때 한 프레임에 물리가 튀는 것 방지).
 */
export function createLoop(onFrame) {
  let raf = null, last = 0;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
    last = now;
    onFrame(now, dt);
  }
  return {
    start() { if (raf == null) { last = 0; raf = requestAnimationFrame(tick); } },
    stop() { if (raf != null) { cancelAnimationFrame(raf); raf = null; } },
    get running() { return raf != null; },
  };
}

// ─── 밤하늘 판 ────────────────────────────────────────────
// css의 --skypanel과 같은 두 색. 라이트/다크 공통이라 토큰을 안 읽는다.
// 게임 둘이 같이 쓰게 되어 여기로 내렸다(starPick의 지역 상수였다).
export const SKY_TOP = '#2c3468', SKY_BOT = '#4b5497';

/** 밤하늘 배경 — 그라데이션 + 잔별. t는 반짝임 위상(ms), soft면 반짝이지 않는다. */
export function drawNightSky(stage, t, soft) {
  const { ctx, W, H } = stage;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, SKY_TOP); g.addColorStop(1, SKY_BOT);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 잔별 — 위치는 화면 크기에서 결정론적으로 뽑아 프레임마다 흔들리지 않게
  for (let i = 0; i < 34; i++) {
    const x = ((i * 71) % 100) / 100 * W, y = ((i * 137) % 100) / 100 * H;
    const tw = soft ? 0.5 : 0.35 + Math.abs(Math.sin(t * 0.0007 + i)) * 0.45;
    ctx.globalAlpha = tw * 0.6;
    ctx.fillStyle = '#dfe6ff';
    ctx.beginPath(); ctx.arc(x, y, i % 5 ? 1 : 1.7, 0, 6.3); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** 5각별 경로 (채우기·긋기는 호출부에서) */
export function starPath(ctx, x, y, r, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 ? r * 0.44 : r;
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// ─── 각도(rel) → 화면 위치 ─────────────────────────────────
/**
 * 손목 각도를 0~1로 정규화한다. 0 = range.lo(굽힘/요측 끝), 1 = range.hi(폄/척측 끝).
 *
 * range는 **판정기가 내주는 값**이다(feed의 반환에 실려 온다). 게임이 임계값을 따로
 * 가지면 판정과 그림이 어긋난다 — 별은 안 붙었는데 카운트가 오르거나 그 반대가 된다.
 * 굽힘·폄의 두 임계가 비대칭(-24° / +12°)이라 이 매핑도 좌우 대칭이 아니다. 그게 맞다:
 * 화면상 거리는 "얼마나 더 가야 인정되는가"를 그대로 보여줘야 한다.
 */
export function axisT(rel, range) {
  if (!range || !Number.isFinite(rel)) return 0.5;
  const span = range.hi - range.lo;
  if (!span) return 0.5;
  return Math.min(1, Math.max(0, (rel - range.lo) / span));
}

/**
 * 각도 게임의 라운드 진행 — 별 줍기·유성우 받기가 **똑같이** 쓰는 부분.
 *
 * 여기 내린 이유는 재사용이 아니라 **일치**다. "어느 끝을 찍었나 → 하나 줍는다,
 * 왕복이 서면 한 회차" 는 판정기와 맞물린 계약이라 게임마다 다시 쓰면 조용히 갈라진다
 * (한쪽만 justCounted 프레임에서 두 번째 끝을 못 줍는 식으로). 그림·기하는 게임이
 * 각자 갖고, 이 계약만 한 곳에 둔다. 게임 파일 안에 모드 분기를 넣지 않는다는 원칙과
 * 충돌하지 않는다 — 여기엔 게임별 분기가 없다.
 *
 * ★justCounted 프레임에서 두 끝을 다 줍는 것이 핵심이다. 판정기는 왕복이 서는 순간
 *   두 끝 상태를 함께 지우므로, 그 프레임의 ends는 이미 비어 있다. ends만 보고 있으면
 *   두 번째로 찍은 끝은 영영 안 주워진다.
 *
 * @param {object} o
 * @param {number} o.reps      왕복 횟수 (게임이 정하지 않는다 — 루틴에서 받은 값)
 * @param {object} o.detector  각도 판정기 (range·ends를 내주는 것)
 * @param {(key:'lo'|'hi')=>void} o.onEnd  그 끝을 처음 찍은 순간 (연출 훅)
 */
export function createAxisRounds({ reps, detector, onEnd, onCount, onHint, onDone }) {
  let cycles = 0, done = false, lastHint = '', t = 0.5;
  const taken = { lo: false, hi: false };

  const take = (k) => { if (taken[k]) return; taken[k] = true; onEnd?.(k); };

  return {
    /** 0~1 축 위치 — 판정기가 준 range로만 계산한다 */
    get t() { return t; },
    get cycles() { return cycles; },
    get done() { return done; },
    /** 이 끝을 이번 회차에 이미 주웠는가 */
    taken(k) { return taken[k]; },
    /** 지금 가야 할 끝 — 둘 다 주웠으면 null (회차 넘어가는 순간뿐) */
    target() { return !taken.hi ? 'hi' : !taken.lo ? 'lo' : null; },

    reset() {
      cycles = 0; done = false; lastHint = ''; t = 0.5;
      taken.lo = false; taken.hi = false;
      detector.reset();
    },

    feed(snap, now) {
      if (done) return;
      const res = detector.feed(snap, now) || {};
      if (res.range) t = axisT(snap.rel, res.range);
      if (res.hint && res.hint !== lastHint) { lastHint = res.hint; onHint?.(res.hint); }

      if (res.justCounted) {
        take('hi'); take('lo');            // ★두 번째 끝을 여기서 마저 줍는다
        cycles++;
        onCount?.(cycles);
        if (cycles >= reps) { done = true; onDone?.(); return; }
        taken.lo = false; taken.hi = false; // 다음 회차 — 상태만 되돌린다(연출은 계속 흐른다)
        return;
      }
      if (res.ends?.hi) take('hi');
      if (res.ends?.lo) take('lo');
    },
  };
}

/**
 * 주운 별이 마스코트에게 날아가는 연출 — 두 각도 게임이 같이 쓴다.
 * add(x, y)로 띄우고, 매 프레임 draw(ctx, dt, pocket, color, r)로 그린다.
 */
export function createFlights() {
  let list = [];
  return {
    add(x, y) { list.push({ t: 0, x0: x, y0: y }); },
    draw(ctx, dt, pocket, color, r) {
      for (const f of list) {
        f.t = Math.min(1, f.t + dt * 2.2);
        const k = 1 - (1 - f.t) * (1 - f.t);      // easeOut
        const x = f.x0 + (pocket.x - f.x0) * k;
        const y = f.y0 + (pocket.y - f.y0) * k;
        ctx.save();
        ctx.globalAlpha = 1 - k * 0.7;
        ctx.fillStyle = color;
        starPath(ctx, x, y, r * (1 - k * 0.5), k * 3);
        ctx.fill();
        ctx.restore();
      }
      list = list.filter((f) => f.t < 1);
    },
    clear() { list = []; },
  };
}
