// ═══════════════════════════════════════════════════════════
// timedStep.test.mjs — timed 스텝 타입 + dose 배관 확장 (배관만, 콘텐츠 없음)
// 실행: `node js/timedStep.test.mjs` (실패 시 exit 1).
//
// 이 파일이 못 박아 두는 사실:
//   ① needsCamera — follow가 하나도 없으면 카메라를 안 켠다(프레임 경로 분기의 유일한 기준).
//   ② timed 스텝이 holdSec × reps 라운드로 진행하고 progress를 내보낸다.
//   ③ focusGuide가 timed를 가리켜도 'cap'으로 조용히 정지하지 않는다 — 이 작업의 존재 이유.
//   ④ hold 클램프: level 0에서 base가 잘리지 않는다(base 20 · cap 15여도 20).
//   ⑤ doseAxis 'hold'는 hold를 상한까지 올린 뒤에야 reps로 넘어간다.
//   ⑥ 기본 'reps'에서 기존 가이드의 dose 결과 불변(회귀).
//
// ★픽스처는 런타임에 GUIDES에 밀어넣었다 뺀다 — doseAtLevel·getRoutineGuide가 getGuide로
//  실제 배열을 조회하기 때문이다(인자로 주입하려면 체인 여러 층을 꿰어야 한다). 저장소의
//  프로덕션 콘텐츠는 바뀌지 않는다. 반드시 try/finally: 단언이 던지면 복원이 안 돌고
//  같은 파일의 뒷 테스트가 오염된 GUIDES 위에서 "초록불인데 다른 걸 검증"하게 된다.
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import { GUIDES, getGuide, needsCamera } from './guide/guideData.js';
import { createStepEngine } from './guide/stepEngine.js';
import { computeDose, getRoutineGuide, decideDose, estimateGuideSec } from './routine.js';
import { ROUTINE } from './config.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };
const eq = (got, want, msg) => ok(got === want, `${msg} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);

// ─── 픽스처 ────────────────────────────────────────────────
const TIMED_ONLY = {
  id: 'fx_timed', name: 'fx 스트레칭', view: 'front', emoji: '🤲', cat: 'stretch', short: 'fx',
  steps: [
    { type: 'intro', text: '준비', dur: 3, pose: {} },
    { type: 'timed', text: '유지', hint: '그대로 유지…', reps: 2, holdSec: 20, doseAxis: 'hold', holdCapSec: 30 },
    { type: 'outro', text: '끝', dur: 3, pose: {} },
  ],
};
const MIXED = {
  id: 'fx_mixed', name: 'fx 혼합', view: 'front', emoji: '🤝', cat: 'mix', short: 'fx2',
  steps: [
    { type: 'timed', text: '유지', reps: 1, holdSec: 10 },
    { type: 'follow', text: '반복', reps: 3, detect: 'gripHold' },
  ],
};
// 스텝 상한 없이 config 기본(15)만 쓰는 픽스처 — 클램프 버그 재현용(base 20 > cap 15)
const TIGHT_CAP = {
  id: 'fx_tight', name: 'fx 좁은상한', view: 'front', emoji: '🤏', cat: 'stretch', short: 'fx3',
  steps: [{ type: 'timed', text: '유지', reps: 2, holdSec: 20, doseAxis: 'hold' }],
};

/** 픽스처를 GUIDES에 올리고 f를 돌린 뒤 반드시 원상복구 */
function withFixtures(fixtures, f) {
  const before = GUIDES.length;
  GUIDES.push(...fixtures);
  try { return f(); } finally { GUIDES.length = before; }
}
/** focusGuide 매핑을 임시로 바꾸고 반드시 원상복구 */
function withFocusGuide(focus, guideId, f) {
  const map = ROUTINE.adaptReps.focusGuide;
  const saved = map[focus];
  map[focus] = guideId;
  try { return f(); } finally { map[focus] = saved; }
}
const adaptState = (patch = {}) => ({
  adapt: { focus: 'flex', focusSoft: false, doseLevel: {}, toleratedStreak: 0, ...patch },
  measurements: [], conditions: [],
});

const GUIDES_BEFORE = GUIDES.length;

// ─── ① needsCamera ─────────────────────────────────────────
{
  ok(needsCamera(TIMED_ONLY) === false, '1 timed 전용 가이드는 카메라 불필요');
  ok(needsCamera(MIXED) === true, '1 follow가 하나라도 있으면 카메라 필요');
  ok(needsCamera(getGuide('flex_ext')) === true, '1 기존 가이드는 전부 카메라 필요(회귀)');
  ok(needsCamera(null) === false && needsCamera({}) === false, '1 이상 입력 안전');
}

// ─── ② timed 진행: holdSec × reps 라운드 + progress ─────────
{
  const counts = [], progs = [];
  let completed = false, neutralAsked = false;
  const engine = createStepEngine(TIMED_ONLY, {
    onCount: (c) => counts.push(c),
    onStatus: ({ progress }) => progs.push(progress),
    onNeedNeutral: () => { neutralAsked = true; },
    onComplete: () => { completed = true; },
  });
  let t = 0;
  engine.start(t);
  const step = (ms) => { t += ms; engine.update(t, { detected: false, rel: 0, comp: false, fingers: null }); };

  for (let i = 0; i < 7; i++) step(500);          // intro 3초 통과 → timed 진입
  ok(neutralAsked === false, '2 timed는 중립을 요청하지 않는다(arm 불필요)');
  ok(counts.length > 0 && counts[0] === 0, '2 진입 시 라운드 0으로 dots 준비');

  step(10000);                                    // 라운드1 중간 (10/20초)
  const mid = progs[progs.length - 1];
  ok(mid > 0.4 && mid < 0.6, `2 진행률이 유지시간에 비례 (10/20초 → ${mid?.toFixed(2)})`);

  step(10000);                                    // 라운드1 완료(20초)
  eq(counts[counts.length - 1], 1, '2 첫 라운드 완료');
  step(20000);                                    // 라운드2 완료 → 다음 스텝(outro)
  eq(counts[counts.length - 1], 2, '2 두 번째 라운드 완료 후 스텝 진행');

  for (let i = 0; i < 7; i++) step(500);          // outro 3초
  ok(completed, '2 outro까지 자동 완주 (카메라 없이 snap만으로)');
}

// ─── ③ focusGuide가 timed를 가리켜도 cap으로 정지하지 않는다 ─
// 이 작업의 존재 이유. 술어가 follow만 보면 doseAtLevel이 null 쌍을 돌려주고
// canProgress=false → decideDose가 'cap'으로 조용히 멈춘다(no-op 재현).
{
  withFixtures([TIMED_ONLY], () => withFocusGuide('flex', 'fx_timed', () => {
    const s = adaptState({ toleratedStreak: 2 });
    s.conditions = [
      { at: '2026-07-20', condition: 'good' },
      { at: '2026-07-21', condition: 'good' },
      { at: '2026-07-22', condition: 'good', comp: 5 },
    ];
    const r = decideDose(s, '2026-07-22');
    eq(r.target, 'fx_timed', '3 focus 대상이 timed 픽스처');
    eq(r.action, 'up', "3 timed도 진행한다 — 'cap'으로 조용히 정지하지 않는다");
    eq(r.doseAfter, 1, '3 doseLevel 0→1');
  }));
}

// ─── ④ hold 클램프: level 0에서 base가 잘리지 않는다 ─────────
{
  withFixtures([TIGHT_CAP], () => {
    const s = adaptState({ focus: null });          // focus 보정 없이 순수 base 확인
    const d0 = computeDose(s, 'fx_tight', '2026-07-22');
    eq(d0.holdSec, 20, `4 base 20 · config cap 15여도 level 0은 20 (config cap=${ROUTINE.adaptDose.holdCapSec})`);
    eq(d0.reps, 2, '4 reps도 base 그대로');
  });
}

// ─── ⑤ doseAxis 'hold': hold를 상한까지 올린 뒤 reps로 ───────
{
  withFixtures([TIMED_ONLY], () => {
    const s = (lv) => adaptState({ focus: null, doseLevel: { fx_timed: lv } });
    const dz = ROUTINE.adaptDose;
    const at = (lv) => computeDose(s(lv), 'fx_timed', '2026-07-22');
    eq(at(0).holdSec, 20, '5 level 0 → hold 20(base)');
    eq(at(1).holdSec, 20 + dz.holdStepSec, '5 level 1 → hold 상승');
    eq(at(1).reps, 2, '5 hold가 남아 있는 동안 reps는 불변');
    eq(at(4).holdSec, 30, '5 스텝 상한 30까지 오른다');
    eq(at(4).reps, 2, '5 상한에 막 닿은 단계까지는 reps 불변');
    eq(at(5).holdSec, 30, '5 상한을 넘지 않는다');
    eq(at(5).reps, 3, '5 남은 단계가 그제서야 reps로 넘어간다');

    // getRoutineGuide가 같은 술어를 써서 재생본에 반영하는가
    const g = getRoutineGuide('fx_timed', s(1), '2026-07-22');
    const timed = g.steps.find((x) => x.type === 'timed');
    eq(timed.holdSec, 20 + dz.holdStepSec, '5 재생본의 timed holdSec에 반영');
    eq(getGuide('fx_timed').steps.find((x) => x.type === 'timed').holdSec, 20, '5 원본 GUIDES는 불변');
  });
}

// ─── ⑥ 기본 'reps' 회귀 — 기존 가이드 dose 결과 불변 ──────────
{
  const s = adaptState({ focus: 'flex', doseLevel: { flex_ext: 1 } });
  eq(computeDose(s, 'flex_ext', '2026-07-22').reps, 8, '6 flex_ext는 예전 그대로 5+2+1=8');
  eq(computeDose(s, 'flex_ext', '2026-07-22').holdSec, null, '6 hold 없는 운동은 null 유지');
  eq(computeDose(adaptState({ focus: 'flex', doseLevel: { flex_ext: 9 } }), 'flex_ext', '2026-07-22').reps,
     ROUTINE.adaptReps.cap, '6 reps 상한도 그대로');
}

// ─── ⑦ estimateGuideSec가 timed를 포함 ──────────────────────
{
  eq(estimateGuideSec(TIMED_ONLY), 3 + 2 * 20 + 3, '7 intro3 + (2라운드×20초) + outro3 = 46초');
  eq(estimateGuideSec(MIXED), 1 * 10 + 3 * 5, '7 혼합: timed 10 + follow 3회×기본사이클 5 = 25초');
}

// ─── 픽스처가 완전히 걷혔는가 ───────────────────────────────
eq(GUIDES.length, GUIDES_BEFORE, '8 픽스처 복원됨 (뒷 테스트가 오염된 GUIDES 위에서 돌지 않게)');
ok(getGuide('fx_timed') === null && getGuide('fx_tight') === null, '8 픽스처 조회 불가');
eq(ROUTINE.adaptReps.focusGuide.flex, 'flex_ext', '8 focusGuide 매핑 복원됨');

// ─── ⑨ 실제 콘텐츠가 배관에 물린다 (전완 스트레칭 2종) ──────
// 픽스처가 아니라 프로덕션 GUIDES로 확인한다 — 배관의 첫 실사용자라, 여기가 통과해야
// timed·doseAxis·스텝별 holdCapSec이 실제로 쓸 수 있는 상태라는 뜻이다.
{
  for (const id of ['extensor_stretch', 'flexor_stretch']) {
    const g = getGuide(id);
    ok(!!g, `9 ${id} 존재`);
    ok(needsCamera(g) === false, `9 ${id}는 카메라를 안 켠다`);
    ok(!ROUTINE.course.includes(id) && !ROUTINE.gentleCourse.includes(id),
       `9 ${id}는 데일리 코스에 없다 — 3분 예산은 그대로`);
    const timed = g.steps.filter((s) => s.type === 'timed');
    eq(timed.length, 2, `9 ${id} 좌우 별도 스텝 둘 (라운드가 아니라 스텝이라 각자 문구가 붙는다)`);
    ok(timed.every((s) => s.holdCapSec === 30),
       `9 ${id} 스텝별 holdCapSec 명시 — 없으면 config 기본 15에 막혀 hold가 안 오른다`);
    ok(timed.every((s) => /저릿하거나 아프면 바로 멈추세요/.test(s.hint || '')),
       `9 ${id} 중단 기준이 모든 유지 라운드에 노출된다(안전 문구는 절반만 보이면 안 된다)`);
  }

  // dose가 hold부터 상한까지 흐른 뒤에야 reps로 — 좌우 두 스텝에 같은 값으로
  const st = (lv) => ({ adapt: { focus: null, focusSoft: false, doseLevel: { extensor_stretch: lv },
                                 toleratedStreak: 0 }, measurements: [] });
  const timedOf = (lv) => getRoutineGuide('extensor_stretch', st(lv), '2026-07-22')
    .steps.filter((s) => s.type === 'timed');
  const holdsAt = (lv) => JSON.stringify(timedOf(lv).map((s) => s.holdSec));
  const repsAt = (lv) => JSON.stringify(timedOf(lv).map((s) => s.reps));
  eq(holdsAt(0), '[20,20]', '9 level 0 → base 20 (절삭 없음)');
  eq(holdsAt(1), '[23,23]', '9 level 1 → 23, 좌우 동일');
  eq(holdsAt(4), '[30,30]', '9 level 4 → 스텝 상한 30');
  eq(repsAt(4), '[1,1]', '9 상한에 닿기 전엔 reps 불변');
  eq(holdsAt(5), '[30,30]', '9 상한을 넘지 않는다');
  eq(repsAt(5), '[2,2]', '9 남은 단계가 그제서야 reps로');
  eq(getGuide('extensor_stretch').steps.filter((s) => s.type === 'timed')[0].holdSec, 20,
     '9 원본 GUIDES는 불변');
  eq(estimateGuideSec(getGuide('extensor_stretch')), 5 + 20 + 20 + 3, '9 예상 소요 48초');
}

// ─── ⑩ flex_ext 이름 — 유지 없는 반복은 스트레칭이 아니다 ─────
{
  ok(!/스트레칭/.test(getGuide('flex_ext').name), '10 flex_ext 이름에 "스트레칭"이 없다');
  ok(getGuide('extensor_stretch').name.includes('스트레칭'), '10 진짜 스트레칭에만 그 말을 쓴다');
}

console.log(`\ntimed 스텝 · dose 배관 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
