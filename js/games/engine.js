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
