// ═══════════════════════════════════════════════════════════
// measureCompare.test.mjs — 측정 비교는 "같은 손끼리만" (sameHandSeries)
// 실행: `node js/measureCompare.test.mjs` (실패 시 exit 1).
//
// 이 파일이 못 박아 두는 사실:
//   ① 오른손 → 왼손으로 바꿔 재면 red/개선 신호가 뜨지 않는다(정상적인 좌우 차이를
//      급락·개선으로 읽지 않는다).
//   ② 같은 손 안에서의 진짜 변화는 그대로 잡힌다(필터가 신호를 죽이지 않는다).
//   ③ 손을 모르는 옛 기록(hand:null)끼리는 예전처럼 비교된다(회귀 없음).
//   ④ computeFocus는 두 측정을 비교하지 않는다 — 한 레코드 안에서 flex vs ext를 본다.
//      대신 어느 손에서 나온 신호인지를 hand로 함께 돌려준다.
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import {
  sameHandSeries, makeMeasurement, isRedSignal, isImproving, computeFocus,
} from './store.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };

const rec = (at, hand, flex, ext) => makeMeasurement({ at, hand, flex, ext });
const st = (...measurements) => ({ measurements });

// ─── sameHandSeries 자체 ────────────────────────────────────
{
  const ms = [rec('2026-01-01', 'right', 50, 50), rec('2026-01-08', 'left', 40, 40),
              rec('2026-01-15', 'right', 52, 51)];
  ok(sameHandSeries(ms).length === 2, '1 생략 시 가장 최근 손(오른손) 기준');
  ok(sameHandSeries(ms).every((m) => m.hand === 'right'), '1 오른손만 남는다');
  ok(sameHandSeries(ms, 'left').length === 1, '1 손을 지정하면 그 손 기준');
  ok(sameHandSeries(ms, 'right')[0].at === '2026-01-01', '1 시간순 유지');
  ok(sameHandSeries([]).length === 0 && sameHandSeries(null).length === 0, '1 빈 입력·이상 입력 안전');
  ok(ms.length === 3, '1 원본 배열 불변');

  const legacy = [rec('2026-01-01', null, 50, 50), rec('2026-01-08', null, 40, 40)];
  ok(sameHandSeries(legacy).length === 2, '1 hand:null끼리는 서로 비교 대상');
  ok(sameHandSeries([...legacy, rec('2026-01-15', 'right', 45, 45)]).length === 1,
     '1 손을 아는 기록은 모르는 기록과 안 섞인다');
}

// ─── red 신호: 손 전환을 급락으로 읽지 않는다 ────────────────
{
  // 오른손 50/50 → 왼손 40/40. 손만 바뀌었는데 flex·ext 모두 10° 하락으로 보인다.
  const crossed = st(rec('2026-01-01', 'right', 50, 50), rec('2026-01-08', 'left', 40, 40));
  ok(isRedSignal(crossed, '2026-01-08') === false, '2 손을 바꿔 잰 것은 red가 아니다');

  // 같은 손 안에서 같은 크기의 하락은 그대로 red (필터가 신호를 죽이지 않는다)
  const real = st(rec('2026-01-01', 'right', 50, 50), rec('2026-01-08', 'right', 40, 40));
  ok(isRedSignal(real, '2026-01-08') === true, '2 같은 손의 진짜 하락은 red 유지');

  // 왼손 기록이 사이에 껴 있어도 오른손끼리 비교된다
  const interleaved = st(rec('2026-01-01', 'right', 50, 50), rec('2026-01-05', 'left', 30, 30),
                         rec('2026-01-08', 'right', 40, 40));
  ok(isRedSignal(interleaved, '2026-01-08') === true, '2 다른 손 기록을 건너뛰고 같은 손끼리 비교');

  ok(isRedSignal(st(rec('2026-01-01', null, 50, 50), rec('2026-01-08', null, 40, 40)),
                 '2026-01-08') === true, '2 옛 기록(null) 동작 회귀 없음');
}

// ─── 개선 신호: 대칭으로 동작 ────────────────────────────────
{
  // 왼손이 원래 더 크게 잡히는 것을 "좋아지고 있어요"로 말하지 않는다
  const crossed = st(rec('2026-01-01', 'right', 40, 40), rec('2026-01-08', 'left', 50, 50));
  ok(isImproving(crossed, '2026-01-08') === false, '3 손을 바꿔 잰 것은 개선이 아니다');

  const real = st(rec('2026-01-01', 'right', 40, 40), rec('2026-01-08', 'right', 50, 50));
  ok(isImproving(real, '2026-01-08') === true, '3 같은 손의 진짜 개선은 유지');

  const interleaved = st(rec('2026-01-01', 'right', 40, 40), rec('2026-01-05', 'left', 70, 70),
                         rec('2026-01-08', 'right', 50, 50));
  ok(isImproving(interleaved, '2026-01-08') === true, '3 사이에 낀 다른 손은 무시');
}

// ─── 첫 기록 / 한 손만 있을 때 ───────────────────────────────
{
  const onlyOther = st(rec('2026-01-01', 'left', 60, 60), rec('2026-01-08', 'right', 30, 30));
  ok(isRedSignal(onlyOther, '2026-01-08') === false && isImproving(onlyOther, '2026-01-08') === false,
     '4 그 손의 첫 측정이면 비교 대상이 없어 어떤 신호도 안 뜬다');
  ok(isRedSignal(st(rec('2026-01-01', 'right', 50, 50)), '2026-01-01') === false,
     '4 측정 1회면 red 없음');
}

// ─── computeFocus: 두 측정을 비교하지 않는다 + 손 출처 ────────
{
  // 왼손 기록이 뒤에 있어도 focus는 '가장 최근 한 레코드 안'의 flex vs ext로만 결정된다
  const s = st(rec('2026-01-01', 'right', 20, 60), rec('2026-01-08', 'left', 55, 30));
  const f = computeFocus(s, '2026-01-08');
  ok(f.focus === 'ext', '5 focus는 최근 레코드 안에서 낮은 쪽(ext)');
  ok(f.hand === 'left', '5 focus의 출처 손을 함께 돌려준다');
  ok(f.focusSoft === false && f.reason === 'weak', '5 기능선(40°) 미만이면 weak');

  const balanced = computeFocus(st(rec('2026-01-08', 'right', 45, 45)), '2026-01-08');
  ok(balanced.focus === null && balanced.hand === 'right', '5 비대칭 없으면 focus null, 손은 유지');

  const none = computeFocus(st(), '2026-01-08');
  ok(none.focus === null && none.hand === null, '5 측정 0회면 focus·hand 모두 null');
}

console.log(`\n측정 비교(같은 손끼리) 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
