// ═══════════════════════════════════════════════════════════
// games.test.mjs — 게임 레지스트리·선택 규칙 테스트
// 실행: `node js/games.test.mjs` (실패 시 exit 1).
//
// 캔버스 게임 자체는 이 스위트가 못 간다(DOM·rAF). 대신 **자동으로 갈 수 있는
// 자리를 전부 덮는다** — 게임이 어떤 운동에 붙는지, 반복수를 어디서 받는지,
// 오늘 무엇을 띄우는지. 이건 전부 순수 로직이고, 틀리면 조용히 틀린다:
//   · 레지스트리가 없는 운동·없는 판정기를 가리켜도 게임 화면을 열기 전엔 모른다.
//   · gameReps가 루틴에서 안 읽고 자기 숫자를 쓰면 적응형 강도(doseLevel)를
//     우회하는 샛길이 된다 — 화면상으로는 멀쩡해 보인다(설계서 §2 성립조건 ①).
//
// 화면 쪽(games/session.js)은 카메라·캔버스를 import해서 여기서 못 부른다.
// 그래서 표와 규칙은 games/registry.js에 따로 두었다.
//
// 순수 로직이지만 routine/store 경로가 localStorage를 타므로 최소 shim만 둔다
// (adapt.test.mjs와 같은 방식).
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import { GAME_REGISTRY, pickGame, gameReps } from './games/registry.js';
import { getGuide } from './guide/guideData.js';
import { createDetector, DETECTOR_TYPES } from './guide/stepEngine.js';
import { getRoutineGuide } from './routine.js';
import { ROUTINE } from './config.js';
import { createAxisRounds, axisT } from './games/engine.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };
const eq = (got, want, msg) => {
  if (got === want) { pass++; return; }
  fail++;
  console.error(`FAIL ${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

const KEYS = Object.keys(GAME_REGISTRY);
const followReps = (g) => g.steps.find((s) => s.type === 'follow' && s.reps != null)?.reps;

/** 합성 상태 — adapt.test.mjs의 mk와 같은 모양 */
const mk = (doseLevel = {}, routine = null) => ({
  adapt: {
    focus: 'flex', focusSoft: false, doseLevel,
    toleratedStreak: 0, lastImproveShownAt: null, lastAdaptedAt: null,
  },
  conditions: [],
  ...(routine ? { routine } : {}),
});

/** 오늘 날짜의 루틴을 직접 심는다 — getTodayRoutine이 같은 코스면 그대로 돌려준다.
 *  (다시 구성하면 save()가 돌지만 shim이 받으므로 어느 쪽이든 통과한다.) */
const today = new Date();
const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const mkRoutine = (ids, doneIds = []) => ({
  v: 2, date: dateStr, ids, gentle: false, doneIds,
  suggestMeasure: false, completedAt: null,
});

// ── R1: 레지스트리가 가리키는 것이 실제로 존재하는가 ──────
// 이게 틀리면 게임 화면을 열기 전까지 아무도 모른다.
{
  ok(KEYS.length > 0, 'R1 레지스트리가 비어 있지 않다');
  for (const id of KEYS) {
    const def = GAME_REGISTRY[id];
    ok(getGuide(id) != null, `R1 ${id}: 실제 guide id다`);

    // 판정기 — 이름 목록으로 확인한다. createDetector는 모르는 이름에 무동작
    // 판정기를 돌려주므로, 만들어 보고 feed/reset이 있는지 보는 것으로는 오타를
    // 못 잡는다(스텁도 둘 다 갖고 있다). 실제로 뮤테이션이 그 구멍을 드러냈다.
    ok(DETECTOR_TYPES.includes(def.detect),
       `R1 ${id}: detect '${def.detect}'가 실재하는 판정기 이름이다`);
    const d = createDetector(def.detect);
    ok(typeof d.feed === 'function' && typeof d.reset === 'function',
       `R1 ${id}: 판정기가 feed·reset을 갖는다`);

    // 문구 — 빠지면 화면에 undefined가 뜬다(조용히 깨지는 종류)
    for (const f of ['title', 'exName', 'idleEmoji', 'idleTitle', 'idleText',
                     'lead', 'practiceLead', 'doneMsg', 'practiceMsg']) {
      ok(typeof def[f] === 'string' && def[f].length > 0, `R1 ${id}: ${f} 문구가 있다`);
    }
    ok(typeof def.load === 'function', `R1 ${id}: load()가 함수다`);
    ok(typeof def.usePose === 'boolean', `R1 ${id}: usePose가 명시돼 있다`);
    ok(typeof def.needsNeutral === 'boolean', `R1 ${id}: needsNeutral이 명시돼 있다`);
    ok(def.view === null || def.view === 'side' || def.view === 'front',
       `R1 ${id}: view가 null/side/front 중 하나다`);
    // 자세 게이트를 거는 게임은 안내 문구가 있어야 한다 — 없으면 사용자가 왜 안 되는지 모른다
    ok(def.view == null || (typeof def.viewHint === 'string' && def.viewHint.length > 0),
       `R1 ${id}: view가 있으면 viewHint도 있다`);
    // 각도(rel) 판정기는 중립이 필수다. 중립 없이 돌면 rel이 0에 고정돼 영영 안 센다.
    if (['flexExt', 'deviation'].includes(def.detect)) {
      ok(def.needsNeutral === true, `R1 ${id}: 각도 판정기(${def.detect})는 중립이 필요하다`);
    }

    // follow 스텝의 reps — gameReps가 읽어갈 자리
    ok(followReps(getGuide(id)) != null, `R1 ${id}: reps를 가진 follow 스텝이 있다`);
  }
}

// ── R2: 게임이 붙은 운동은 데일리 코스에 있어야 한다 ──────
// 코스에 없으면 완주해도 완료로 기록될 슬롯이 없다 — 게임이 헛돈다.
// (grip_hold가 로스터 확정 때 코스에서 빠진 뒤 표만 남아 있던 것이 이 사고의 예다.)
{
  for (const id of KEYS) {
    ok(ROUTINE.course.includes(id), `R2 ${id}: ROUTINE.course에 있다`);
  }
}

// ── D1: 반복수는 게임이 정하지 않는다 ─────────────────────
// gameReps가 루틴 가이드와 어긋나면 게임이 적응형 강도를 우회하는 샛길이 된다.
{
  for (const id of KEYS) {
    const s0 = mk();
    eq(gameReps(id, s0), followReps(getRoutineGuide(id, s0)),
       `D1 ${id}: dose 0에서 루틴 가이드와 같다`);

    // dose를 올리면 따라 올라야 한다. 값이 실제로 '변하는지'까지 본다 —
    // 안 변하면 위 단언은 상수를 상수와 비교하는 공허한 것이 된다.
    const s2 = mk({ [id]: 2 });
    const routineReps2 = followReps(getRoutineGuide(id, s2));
    eq(gameReps(id, s2), routineReps2, `D1 ${id}: dose 2에서도 루틴 가이드와 같다`);
    ok(routineReps2 > followReps(getRoutineGuide(id, s0)),
       `D1 ${id}: dose 2가 실제로 반복수를 올린다(단언이 공허하지 않다)`);
  }
}

// ── P1~P3: 오늘 무엇을 띄우는가 ───────────────────────────
{
  // 순서의 출처는 레지스트리가 아니라 **코스**다 — 사용자가 오늘 할 순서로 내민다.
  // (처음엔 KEYS[0]으로 썼다가 flex_ext가 들어오면서 드러났다: 레지스트리 선언 순서와
  //  코스 순서가 다르면 그 단언은 우연히 맞고 있던 것이다.)
  const id = ROUTINE.course.find((x) => GAME_REGISTRY[x]);

  // 미완료 → 그것을 고른다
  const ready = pickGame(mk({}, mkRoutine([...ROUTINE.course], [])));
  eq(ready.kind, 'ready', 'P1 미완료면 kind=ready');
  eq(ready.id, id, `P1 코스 순서상 첫 미완료 게임(${id})을 고른다`);

  // 전부 완료 → 연습 모드 (보상을 새로 만들지 않는다)
  const done = pickGame(mk({}, mkRoutine([...ROUTINE.course], [...ROUTINE.course])));
  eq(done.kind, 'done', 'P2 게임 몫을 다 했으면 kind=done');
  ok(done.id != null, 'P2 연습용으로 띄울 게임이 정해진다');

  // 순한 날 — 실제 경로로 만든다. mkRoutine으로 ids를 심어도 소용없다:
  // getTodayRoutine은 코스를 매번 다시 계산하고, 심은 것과 다르면 새로 구성한다.
  // 어제 'stiff'면 gentleCourse(3종)로 좁아진다.
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  const gentle = { ...mk(), conditions: [{ at: yStr, condition: 'stiff' }] };
  const g = pickGame(gentle);
  eq(g.r.ids.join(','), ROUTINE.gentleCourse.join(','), 'P3 순한 날이 실제로 발동했다');

  // 순한 코스에 게임 있는 운동이 있는지에 따라 기대가 갈린다 — 데이터에서 끌어온다.
  // (지금은 없어서 absent, 별 줍기(flex_ext)가 생기면 ready가 된다. 어느 쪽이든
  //  '순한 코스에 있는 게임만 띄운다'는 규칙 자체를 검증한다.)
  const gentleGames = ROUTINE.gentleCourse.filter((x) => GAME_REGISTRY[x]);
  if (gentleGames.length === 0) {
    eq(g.kind, 'absent', 'P3 순한 코스에 게임이 없으면 kind=absent');
    eq(g.id, null, 'P3 띄울 게임이 없다');
  } else {
    eq(g.kind, 'ready', 'P3 순한 코스에도 게임이 있으면 kind=ready');
    eq(g.id, gentleGames[0], 'P3 순한 코스 안의 첫 게임을 고른다');
    ok(ROUTINE.gentleCourse.includes(g.id), 'P3 고른 게임이 순한 코스 안에 있다');
  }
}

// ── P4: '첫 미완료'를 고르는가 (게임이 둘 이상일 때) ──────
// 지금 레지스트리 항목이 하나뿐이라 순서 규칙이 공허하게 통과한다. 임시 항목을
// 넣어 실제로 두 개인 상황을 만든다 — try/finally로 반드시 되돌린다(timedStep.test.mjs의
// 교훈: 단언이 던지면 복원이 안 돌고 뒷 테스트가 오염된 표 위에서 돈다).
{
  const [a, b] = [ROUTINE.course[0], ROUTINE.course[1]];
  const saved = { a: GAME_REGISTRY[a], b: GAME_REGISTRY[b] };
  const stub = (k) => ({ ...GAME_REGISTRY[KEYS[0]], title: `stub:${k}` });
  try {
    GAME_REGISTRY[a] = stub(a);
    GAME_REGISTRY[b] = stub(b);

    const r1 = pickGame(mk({}, mkRoutine([...ROUTINE.course], [])));
    eq(r1.id, a, 'P4 둘 다 미완료면 코스 순서상 앞의 것');

    const r2 = pickGame(mk({}, mkRoutine([...ROUTINE.course], [a])));
    eq(r2.id, b, 'P4 앞의 것을 이미 했으면 다음 것');
    eq(r2.kind, 'ready', 'P4 남은 게 있으면 아직 ready');
  } finally {
    if (saved.a) GAME_REGISTRY[a] = saved.a; else delete GAME_REGISTRY[a];
    if (saved.b) GAME_REGISTRY[b] = saved.b; else delete GAME_REGISTRY[b];
  }
  // 복원 확인 — 오염된 채로 끝나면 다음에 이 파일을 읽는 사람이 헤맨다
  eq(Object.keys(GAME_REGISTRY).length, KEYS.length, 'P4 레지스트리가 원래대로 복원됐다');
  eq(Object.keys(GAME_REGISTRY).join(','), KEYS.join(','), 'P4 키 구성도 그대로');
}

// ── A1~A4: 각도 게임의 라운드 계약 (createAxisRounds) ─────
// 별 줍기·유성우 받기가 같이 쓰는 부분이라, 갈라지면 두 게임이 조용히 달라진다.
// 캔버스는 못 가지만 이 계약은 순수 로직이라 여기서 전부 확인된다.
//
// 카운트가 아니라 **상태**를 단언한다 — 어느 끝을 주웠는지, 다음 목표가 무엇인지.
// 카운트만 보면 "두 끝 중 하나를 못 줍는" 고장이 회차 수로는 안 드러난다.
{
  const range = { lo: -24, hi: 12 };          // flexExt의 실제 임계
  const F = (justCounted, lo, hi) => ({ justCounted, hint: '', range, ends: { lo, hi } });
  /** 정해진 반환을 순서대로 내놓는 가짜 판정기 — 게임 쪽만 시험한다 */
  const fake = (script) => {
    let i = 0;
    return { feed() { return script[Math.min(i++, script.length - 1)]; }, reset() { i = 0; } };
  };
  const snapAt = (rel) => ({ detected: true, rel, comp: false, fingers: null });

  // A1: 한 왕복 — 끝을 하나씩 찍고, 왕복이 서는 프레임에서 나머지 끝도 주워진다
  {
    const ends = [];
    const r = createAxisRounds({
      reps: 2, detector: fake([F(false, false, false), F(false, false, true), F(true, false, false)]),
      onEnd: (k) => ends.push(k),
    });
    r.reset();
    r.feed(snapAt(0), 0);
    eq(r.target(), 'hi', 'A1 아직 아무 끝도 안 찍었으면 다음은 hi');
    eq(ends.join(','), '', 'A1 아직 주운 것 없음');

    r.feed(snapAt(12), 0);
    eq(r.taken('hi'), true, 'A1 hi 끝을 찍으면 그쪽을 줍는다');
    eq(r.taken('lo'), false, 'A1 lo는 아직');
    eq(r.target(), 'lo', 'A1 다음 목표가 lo로 넘어간다');

    r.feed(snapAt(-24), 0);
    eq(ends.join(','), 'hi,lo', 'A1 ★왕복이 서는 프레임에서 두 번째 끝도 주워진다');
    eq(r.cycles, 1, 'A1 회차 1');
    eq(r.taken('hi'), false, 'A1 다음 회차를 위해 상태가 되돌아간다');
    eq(r.taken('lo'), false, 'A1 lo도 되돌아간다');
    eq(r.target(), 'hi', 'A1 다음 회차의 목표는 다시 hi');
  }

  // A2: 반대 순서로 시작해도 같다 (lo 먼저)
  {
    const ends = [];
    const r = createAxisRounds({
      reps: 2, detector: fake([F(false, true, false), F(true, false, false)]),
      onEnd: (k) => ends.push(k),
    });
    r.reset();
    r.feed(snapAt(-24), 0);
    eq(r.target(), 'hi', 'A2 lo를 먼저 찍으면 다음 목표는 hi');
    r.feed(snapAt(12), 0);
    eq(ends.join(','), 'lo,hi', 'A2 순서가 반대여도 둘 다 주워진다');
  }

  // A3: reps를 채우면 done — 그 뒤로는 아무 일도 일어나지 않는다
  {
    let doneN = 0; const counts = [];
    const r = createAxisRounds({
      reps: 1, detector: fake([F(true, false, false)]),
      onCount: (n) => counts.push(n), onDone: () => doneN++,
    });
    r.reset();
    r.feed(snapAt(0), 0);
    eq(r.done, true, 'A3 reps를 채우면 done');
    eq(doneN, 1, 'A3 onDone 1회');
    r.feed(snapAt(0), 0); r.feed(snapAt(0), 0);
    eq(doneN, 1, 'A3 done 뒤에는 더 안 부른다');
    eq(r.cycles, 1, 'A3 회차도 더 안 오른다');
    eq(counts.join(','), '1', 'A3 카운트는 한 번만');
  }

  // A4: 축 위치는 판정기가 준 range로만 계산한다 (게임이 임계를 따로 갖지 않는다)
  {
    eq(axisT(-24, range), 0, 'A4 lo 끝이 0');
    eq(axisT(12, range), 1, 'A4 hi 끝이 1');
    ok(Math.abs(axisT(0, range) - 24 / 36) < 1e-9,
       'A4 중립(0°)은 한가운데가 아니다 — 임계가 비대칭(-24/+12)이라 t는 0.67쯤');
    eq(axisT(-99, range), 0, 'A4 범위를 넘어가면 끝에서 멈춘다');
    eq(axisT(99, range), 1, 'A4 반대쪽도');

    const r = createAxisRounds({ reps: 3, detector: fake([F(false, false, false)]) });
    r.reset();
    r.feed(snapAt(12), 0);
    eq(r.t, 1, 'A4 feed가 range로 t를 옮긴다');
  }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} games.test.mjs — ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
