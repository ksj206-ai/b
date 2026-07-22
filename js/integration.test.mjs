// integration.test.mjs — 측정→focus→조정→진행/후퇴→긍정 신호 "이어붙임(seam)" 회귀 테스트
// 각 단계는 adapt.test.mjs가 단독 검증한다. 여기서는 재생 경로(getRoutineGuide)로
// 전체가 한 흐름으로 이어질 때만 드러나는 교차 동작을 잡는다.
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = { _m:{}, getItem(k){return this._m[k]??null;}, setItem(k,v){this._m[k]=String(v);}, removeItem(k){delete this._m[k];} };
}
const store = await import('./store.js');
const routine = await import('./routine.js');

let pass = 0, fail = 0;
function eq(got, want, label){ if (got === want) { pass++; } else { fail++; console.log(`  ✗ ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } }
function ok(cond, label){ if (cond) { pass++; } else { fail++; console.log(`  ✗ ${label}`); } }

const fresh = () => ({ measurements:[], conditions:[], adapt:null, routine:null });
const follow = (g) => g.steps.find(s => s.type==='follow' && s.reps!=null);
// ★ 재생 경로: main.js가 재생에 쓰는 getRoutineGuide(id, state, date)로 reps를 읽는다
const reps = (s, d) => follow(routine.getRoutineGuide('flex_ext', s, d)).reps;
const dose = (s) => (store.getAdapt(s).doseLevel || {}).flex_ext || 0;
const measure = (s, d, flex, ext) => { s.measurements.push({v:1,at:d,hand:'right',flex,ext,rom:flex+ext}); store.refreshFocus(s,d); };
const cond = (s, d, c, comp) => { routine.recordCondition(c,s,d,comp); routine.updateDose(s,d); };

// S1) 측정 → focus → reps 보정 (seam: 측정이 focus를 정하고 그 방향 reps가 오른다)
{
  const s = fresh();
  measure(s,'2026-07-02',35,50);                 // flex<ext, flex<40 → focus=flex(약함)
  eq(store.getAdapt(s).focus, 'flex', 'S1 focus=flex');
  eq(reps(s,'2026-07-02'), 7, 'S1 flex_ext reps 5+bonus2=7');
}

// S2) 진행 (seam: 3세션 견딤 → doseLevel 1단계 상승, reps↑, 상한 안 넘음)
{
  const s = fresh();
  measure(s,'2026-07-02',35,50);
  cond(s,'2026-07-02','good',5); cond(s,'2026-07-03','good',5); cond(s,'2026-07-04','good',5);
  eq(dose(s), 1, 'S2 doseLevel=1');
  eq(reps(s,'2026-07-04'), 8, 'S2 reps 7→8');
  ok(reps(s,'2026-07-04') <= 10, 'S2 상한 10 이내');
}

// S3) F1 red 클램프 (seam: 측정 급락→red면 재생 reps가 base, 단 상태는 불변)
{
  const s = fresh();
  measure(s,'2026-08-01',35,50);
  cond(s,'2026-08-01','good',5); cond(s,'2026-08-02','good',5); cond(s,'2026-08-03','good',5); // doseLevel 1, reps 8
  eq(reps(s,'2026-08-03'), 8, 'S3 상승 후 reps=8');
  measure(s,'2026-08-04',27,50);                 // 35→27 급락(8°) → red
  eq(reps(s,'2026-08-04'), 5, 'S3 red 날 reps=base(5)');
  eq(dose(s), 1, 'S3 red 날 doseLevel 불변(=1)');
  // 오늘 측정 없는 다음날 로드: red 유지 → 여전히 base (안 밀림)
  eq(reps(s,'2026-08-05'), 5, 'S3 오늘측정없어도 base 유지');
  eq(dose(s), 1, 'S3 여전히 doseLevel 1');
  measure(s,'2026-08-06',36,50);                 // 27→36 회복 → red 해제
  eq(store.isRedSignal(s,'2026-08-06'), false, 'S3 회복 후 red=false');
  eq(reps(s,'2026-08-06'), 8, 'S3 회복 후 저장된 dose(8)로 복귀');
}

// S4) 긍정 신호 in-flow (seam: 개선+견딤이면 1회 표시, 간격 내 재표시는 도배 방지)
{
  const s = fresh();
  measure(s,'2026-09-01',35,50);
  measure(s,'2026-09-02',42,52);                 // 마지막 두 측정 개선(rom +9)
  cond(s,'2026-09-01','good',5); cond(s,'2026-09-02','good',5); // streak 2
  ok(!!routine.improveSignal(s,'2026-09-02'), 'S4 개선+견딤 → 긍정 신호 표시');
  eq(routine.improveSignal(s,'2026-09-03'), null, 'S4 간격 미달 → 도배 방지(null)');
}

// S5) 후퇴 stiff (seam: stiff→dose 원위치(즉시), 공감 문구는 다음날)
{
  const s = fresh();
  measure(s,'2026-10-01',35,50);
  cond(s,'2026-10-01','good',5); cond(s,'2026-10-02','good',5); cond(s,'2026-10-03','good',5); // doseLevel 1
  cond(s,'2026-10-04','stiff',5);                 // reset-stiff
  eq(dose(s), 0, 'S5 stiff → doseLevel 0(원위치)');
  eq(reps(s,'2026-10-04'), 7, 'S5 reps 8→7(dose 원위치, focus 보너스는 유지)');
  eq(routine.gentleReason(s,'2026-10-04'), null, 'S5 stiff 당일엔 아직 stiff 사유 아님(어제 아님)');
  eq(routine.gentleReason(s,'2026-10-05'), 'stiff', 'S5 다음날 → 공감(어제 뻐근) 사유');
}

console.log(`\n통합(seam) 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
