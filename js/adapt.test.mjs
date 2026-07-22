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

import { decideDose, updateDose, computeDose, getRoutineGuide } from './routine.js';

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

console.log(`\n맞춤 5단계(진행/후퇴) 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
