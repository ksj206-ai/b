// ═══════════════════════════════════════════════════════════
// animPlayer.js — 키프레임 보간 + 이징 재생 (무한 반복)
// [가이드 단계 구현 예정] 명세서 §3.
// 원칙: ① 절대시간 기반(dt 누적 금지) ② easeInOut ③ 홀드 구간.
//   const progress = ((now - animStart) % durationMs) / durationMs;
//   easeInOut = t => t<0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
// ═══════════════════════════════════════════════════════════

export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function sampleAnim(/* keyframes, now, animStart, durationMs */) {
  // TODO(가이드 단계): 현재 구간 탐색 → 진행률에 easeInOut → 파라미터 보간
}
