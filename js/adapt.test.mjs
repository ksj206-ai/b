// ═══════════════════════════════════════════════════════════
// adapt.test.mjs — 맞춤 루틴 5단계(진행/후퇴, §4.3·§4.4) 순수 로직 테스트
// 실행: `node js/adapt.test.mjs` (실패 시 exit 1).
// 이 저장소엔 테스트 러너·package.json이 없고 개발기에 node가 없어 CI 실행은 없다.
// decideDose/computeDose는 순수 함수라 DOM 불필요 — localStorage만 최소 shim한다.
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import { decideDose, updateDose, computeDose, getRoutineGuide, improveSignal } from './routine.js';

let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  if (got === want) { pass++; return; }
  fail++;
  console.error(`FAIL ${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
// focus='flex' → 대상 flex_ext(base reps 5, focus 보정 +2 → dose0 reps 7). soft면 +1.
const mk = (adaptPatch = {}, conditions = []) => ({
  adapt: { focus: 'flex', focusSoft: false, doseLevel: {}, toleratedStreak: 0, lastImproveShownAt: null, lastAdaptedAt: null, ...adaptPatch },
  conditions,
});
const followReps = (g) => g.steps.find((s) => s.type === 'follow').reps;
const good = (at, comp) => ({ at, condition: 'good', ...(comp != null ? { comp } : {}) });

// ── T1: 3세션 무난 + 직전대비 악화없음 + comp 낮음 → 상승(+1) ──
{
  const s = mk({ toleratedStreak: 2 }, [good('d1'), good('d2'), good('d3', 5)]);
  const r = decideDose(s, 'd3');
  eq(r.action, 'up', 'T1 상승');
  eq(r.doseAfter, 1, 'T1 doseLevel 0→1');
  eq(r.toleratedStreak, 0, 'T1 상승 후 streak 리셋');
}

// ── T1b: 무난 3일이 실제로 쌓여야 상승 (updateDose 하루 1회 누적) ──
{
  const s = mk({}, []);
  s.conditions.push(good('2026-07-01', 5));
  eq(updateDose(s, '2026-07-01').action, 'hold-streak', 'T1b day1 유지');
  eq(s.adapt.doseLevel.flex_ext || 0, 0, 'T1b day1 dose 0');
  s.conditions.push(good('2026-07-02', 5));
  eq(updateDose(s, '2026-07-02').action, 'hold-streak', 'T1b day2 유지');
  s.conditions.push(good('2026-07-03', 5));
  eq(updateDose(s, '2026-07-03').action, 'up', 'T1b day3 상승');
  eq(s.adapt.doseLevel.flex_ext, 1, 'T1b day3 dose 1');
  eq(s.adapt.toleratedStreak, 0, 'T1b day3 streak 리셋');
}

// ── T2: 3세션 무난이지만 comp 조건 미달 → 상승 안 함(유지) ──
{
  const s = mk({ toleratedStreak: 2 }, [good('d1'), good('d2'), good('d3', 50)]);
  const r = decideDose(s, 'd3');
  eq(r.action, 'hold-comp', 'T2 comp 높아 유지');
  eq(r.doseAfter, 0, 'T2 상승 없음');
  eq(r.toleratedStreak, 3, 'T2 streak 유지(리셋 아님)');
}

// ── T3: 직전 대비 악화(good→soso) → 하강, 그날 상승 스킵 ──
{
  const s = mk({ doseLevel: { flex_ext: 2 }, toleratedStreak: 3 },
    [good('d1'), { at: 'd2', condition: 'soso', comp: 5 }]);
  const r = decideDose(s, 'd2');
  eq(r.action, 'down', 'T3 하강');
  eq(r.doseAfter, 1, 'T3 doseLevel 2→1');
  eq(r.toleratedStreak, 0, 'T3 streak 0');
}

// ── T4: stiff → doseLevel 원위치(0) ──
{
  const s = mk({ doseLevel: { flex_ext: 3 }, toleratedStreak: 3 },
    [good('d1'), { at: 'd2', condition: 'stiff' }]);
  const r = decideDose(s, 'd2');
  eq(r.action, 'reset-stiff', 'T4 stiff 원위치');
  eq(r.doseAfter, 0, 'T4 doseLevel 3→0');
  eq(r.toleratedStreak, 0, 'T4 streak 0');
}

// ── T5: 상한 도달 시 정지 (reps cap=10) ──
{
  const s = mk({ doseLevel: { flex_ext: 3 }, toleratedStreak: 2 },
    [good('d1'), good('d2'), good('d3', 5)]);
  const r = decideDose(s, 'd3');
  eq(r.action, 'cap', 'T5 상한 도달 정지');
  eq(r.doseAfter, 3, 'T5 doseLevel 유지(안 올림)');
  eq(computeDose(s, 'flex_ext').reps, 10, 'T5 reps 상한 10 고정');
}

// ── T6: 측정·조건 부족 시 유지(안전 폴백) ──
{
  eq(decideDose(mk({ focus: null }, [good('d1', 5)]), 'd1').action, 'no-focus', 'T6a focus 없음 유지');
  eq(decideDose(mk({}, []), 'd1').action, 'no-condition', 'T6b 컨디션 없음 유지');
  const r = decideDose(mk({}, [good('d1', 5)]), 'd1'); // 신규: 컨디션 1회, streak 부족
  eq(r.action, 'hold-streak', 'T6c 신규 유지');
  eq(r.doseAfter, 0, 'T6c dose 0');
}

// ── T7: 같은 날 이중 호출 멱등 ──
{
  const s = mk({ toleratedStreak: 2 }, [good('d1'), good('d2'), good('2026-07-22', 5)]);
  eq(updateDose(s, '2026-07-22').action, 'up', 'T7 1차 상승');
  eq(s.adapt.doseLevel.flex_ext, 1, 'T7 dose 1');
  eq(updateDose(s, '2026-07-22').action, 'already', 'T7 2차 already(멱등)');
  eq(s.adapt.doseLevel.flex_ext, 1, 'T7 dose 여전히 1');
}

// ── T8: getRoutineGuide가 dose를 reps에 반영 / 대상 아닌 운동·soft·상한 ──
{
  eq(followReps(getRoutineGuide('flex_ext', mk({ doseLevel: { flex_ext: 1 } }))), 8, 'T8a flex_ext reps 5+2+1=8');
  eq(followReps(getRoutineGuide('flex_ext', mk({ focusSoft: true }))), 6, 'T8b soft 보정 5+1=6');
  eq(followReps(getRoutineGuide('deviation', mk({ doseLevel: { flex_ext: 1 } }))), 5, 'T8c 대상 아닌 운동 불변');
  eq(followReps(getRoutineGuide('flex_ext', mk({ doseLevel: { flex_ext: 9 } }))), 10, 'T8d dose 커도 상한 10');
  eq(followReps(getRoutineGuide('flex_ext', mk({ focus: null }))), 5, 'T8e focus 없으면 기본 5(안전 폴백)');
}

// ── T9: 긍정 신호(§4.5) — 개선 시에만, 견딤은 streak만, 하강한 날/도배 스킵 ──
// riseDeg=8, minToleratedStreak=2, minGapDays=3. focus='flex'.
{
  const mkI = (adaptPatch = {}, measurements = []) => ({
    adapt: { focus: 'flex', focusSoft: false, doseLevel: {}, toleratedStreak: 0, lastImproveShownAt: null, lastAdaptedAt: null, lastDoseAction: null, ...adaptPatch },
    measurements,
  });
  const meas = (flex, ext, rom) => ({ at: 'x', flex, ext, rom });
  const rising = [meas(30, 30, 60), meas(40, 32, 72)]; // flex +10(개선), ext +2, 하락 없음
  const D = '2026-07-22';

  // I1: 개선 + streak≥2 + 간격 충분 + 오늘 하강 없음 → 표시 + lastImproveShownAt 갱신
  {
    const s = mkI({ toleratedStreak: 2 }, rising);
    eq(improveSignal(s, D), '손목이 부드러워지고 있어요 ✨', 'I1 긍정 표시');
    eq(s.adapt.lastImproveShownAt, D, 'I1 표시일 갱신');
  }
  // I2: 개선이어도 streak < N → 스킵(견딤은 streak만)
  eq(improveSignal(mkI({ toleratedStreak: 1 }, rising), D), null, 'I2 streak 부족 스킵');
  // I3: 오늘 updateDose가 하강(down)한 날 → 스킵(벨트+멜빵)
  eq(improveSignal(mkI({ toleratedStreak: 2, lastAdaptedAt: D, lastDoseAction: 'down' }, rising), D), null, 'I3 오늘 하강 스킵');
  // I4: 간격 미달(어제 이미 표시) → 스킵(도배 방지)
  eq(improveSignal(mkI({ toleratedStreak: 2, lastImproveShownAt: '2026-07-21' }, rising), D), null, 'I4 간격 미달 스킵');
  // I5: 개선 아님(상승폭 노이즈 이하) → 스킵
  eq(improveSignal(mkI({ toleratedStreak: 2 }, [meas(30, 30, 60), meas(33, 31, 64)]), D), null, 'I5 정체 스킵');
  // I6: 한 방향이라도 노이즈 넘게 하락(ext -10) → 개선 아님(하락 가드) → 스킵
  eq(improveSignal(mkI({ toleratedStreak: 2 }, [meas(30, 30, 60), meas(42, 20, 62)]), D), null, 'I6 하락 가드 스킵');
  // I7: 측정 2회 미만 → 재료 부족 → 스킵
  eq(improveSignal(mkI({ toleratedStreak: 2 }, [meas(40, 40, 80)]), D), null, 'I7 측정부족 스킵');
  // I8: 오늘 이미 표시 → 같은 문구 유지(조건 재평가 없이 멱등)
  eq(improveSignal(mkI({ lastImproveShownAt: D }, []), D), '손목이 부드러워지고 있어요 ✨', 'I8 오늘 표시 유지');
}

// ── F1: red(측정 급락) 날 focus 운동 base 클램프 — 표시용, 상태 불변, 다음날 복귀 ──
// isRedSignal: 최근 측정이 직전 대비 flex/ext ≥8° 하락. RED_DROP_DEG=8.
{
  const mkR = (measurements, doseLevel = { flex_ext: 1 }, patch = {}) => ({
    adapt: { focus: 'flex', focusSoft: false, doseLevel, toleratedStreak: 3, lastImproveShownAt: null, lastAdaptedAt: null, lastDoseAction: null, ...patch },
    measurements,
  });
  const red = [{ at: 'p', flex: 40, ext: 40, rom: 80 }, { at: 'l', flex: 30, ext: 40, rom: 70 }]; // flex -10 → red
  const okMeas = [{ at: 'p', flex: 30, ext: 40, rom: 70 }, { at: 'l', flex: 40, ext: 41, rom: 81 }]; // 회복 → red 아님
  const followReps = (g) => g.steps.find((s) => s.type === 'follow').reps;

  // R1: red 날 flex_ext는 base(5)로 클램프(focus +2 · dose +1 모두 무시)
  {
    const s = mkR(red);
    eq(computeDose(s, 'flex_ext').reps, 5, 'R1 red 날 base 5로 클램프');
    // ★상태 불변: doseLevel·toleratedStreak·focusSoft 그대로
    eq(s.adapt.doseLevel.flex_ext, 1, 'R1 doseLevel 불변');
    eq(s.adapt.toleratedStreak, 3, 'R1 toleratedStreak 불변');
    eq(s.adapt.focusSoft, false, 'R1 focusSoft 불변');
  }
  // R2: red 아닌 날(같은 dose 상태) → 조정값(5+2+1=8)으로 복귀 — 상태를 안 깎았으므로
  eq(computeDose(mkR(okMeas), 'flex_ext').reps, 8, 'R2 red 걷히면 조정값 8 복귀');
  // R3: getRoutineGuide도 동일 — red면 base 5, 아니면 8
  eq(followReps(getRoutineGuide('flex_ext', mkR(red))), 5, 'R3 red 날 재생 reps 5');
  eq(followReps(getRoutineGuide('flex_ext', mkR(okMeas))), 8, 'R3 red 아닌 날 재생 reps 8');
  // R4: focusSoft·더 높은 dose여도 red면 base로 — 그리고 focusSoft 원본 불변
  {
    const s = mkR(red, { flex_ext: 2 }, { focusSoft: true });
    eq(computeDose(s, 'flex_ext').reps, 5, 'R4 soft+dose2여도 red면 base 5');
    eq(s.adapt.focusSoft, true, 'R4 focusSoft 원본 불변');
    eq(s.adapt.doseLevel.flex_ext, 2, 'R4 doseLevel 원본 불변');
  }
  // R5: red 날이어도 focus 대상 아닌 운동(deviation)은 기존과 동일(클램프 대상 아님)
  eq(computeDose(mkR(red), 'deviation').reps, 5, 'R5 비대상 운동은 그대로(base 5)');
}

// ── C1(정확도): 측정 신선도 가드 — 오래된 측정만 있으면 긍정 신호 안 뜸(red 신선도는 범위 밖) ──
{
  const st = (measurements) => ({
    adapt: { focus: 'flex', focusSoft: false, doseLevel: {}, toleratedStreak: 2, lastImproveShownAt: null, lastAdaptedAt: null, lastDoseAction: null },
    measurements,
  });
  const rising = (p, l) => [{ at: p, flex: 30, ext: 30, rom: 60 }, { at: l, flex: 40, ext: 32, rom: 72 }]; // flex +10 개선
  const MSG = '손목이 부드러워지고 있어요 ✨';
  eq(improveSignal(st(rising('2026-07-21', '2026-07-22')), '2026-07-22'), MSG, 'C1 신선한 측정 → 표시');
  eq(improveSignal(st(rising('2026-06-01', '2026-06-02')), '2026-07-22'), null, 'C1 오래된 측정(14일 초과) → 억제');
}

// ── C2(정확도): 컨디션 간격 가드 — 사흘 이상 공백이면 하강·상승 없이 유지 + streak 0 ──
{
  const st = (conditions) => ({
    adapt: { focus: 'flex', focusSoft: false, doseLevel: { flex_ext: 1 }, toleratedStreak: 2, lastImproveShownAt: null, lastAdaptedAt: null, lastDoseAction: null },
    conditions,
  });
  const g = (at, c, comp) => ({ at, condition: c, ...(comp != null ? { comp } : {}) });
  const r = decideDose(st([g('2026-11-01', 'good'), g('2026-11-05', 'good', 5)]), '2026-11-05'); // 간격 4일(>2)
  eq(r.action, 'hold-gap', 'C2 큰 간격 → hold-gap');
  eq(r.doseAfter, 1, 'C2 doseLevel 불변');
  eq(r.toleratedStreak, 0, 'C2 streak 0 리셋');
  const r2 = decideDose(st([g('2026-11-01', 'good'), g('2026-11-03', 'good', 5)]), '2026-11-03'); // 간격 2일(≤2)
  eq(r2.action, 'up', 'C2 이틀 간격은 가드 미발동(기존 판정 유지 → up)');
  const r3 = decideDose(st([g('2026-11-01', 'good'), g('2026-11-05', 'stiff')]), '2026-11-05'); // stiff 우선
  eq(r3.action, 'reset-stiff', 'C2 큰 간격이어도 stiff 우선');
}

console.log(`\n맞춤 적응형 루틴 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
