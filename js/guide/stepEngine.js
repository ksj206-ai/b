// ═══════════════════════════════════════════════════════════
// stepEngine.js — 스텝 진행·텍스트·인식 카운트·완료 처리
// [가이드 단계 구현 예정] 명세서 §5·§6.
// 스텝 type: intro(자동, dur초) / follow(인식 카운트로 진행) / outro(자동)
// 인식은 measurement.js 지표 재사용 (flexExt/deviation/tendonGlide/pinchHold/gripHold).
// UX: 시범과 카운트 독립, 관대한 목표, 조용한 피드백, 15초 인식0 시 탈출구.
// ═══════════════════════════════════════════════════════════

export function createStepEngine(/* guide, handlers */) {
  throw new Error('[stepEngine] 가이드 단계에서 구현 예정');
}
