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
//   ⑤ 자세(뷰) 게이트를 못 맞춘 채 잰 기록(view:'off')은 자동 판정에서 빠진다.
//      단 '표시'에서는 안 빠진다 — 판정만 막고 자기 기록은 그대로 보여준다.
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import {
  sameHandSeries, makeMeasurement, isRedSignal, isImproving, computeFocus, isTrusted,
} from './store.js';
import { viewFits } from './measurement.js';
import { VIEW_FIT } from './config.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };

const rec = (at, hand, flex, ext, view = 'ok') => makeMeasurement({ at, hand, flex, ext, view });
const fingersWith = (spread) => ({ palm: 1, grip: 1.7, spread, fanSpan: 1, tipMCP: 1, pinch: 1 });
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

// ─── 자세(뷰) 판정 viewFits ─────────────────────────────────
{
  const side = fingersWith(0.20);   // 손날이 카메라 — 너클 줄이 시선 축으로 겹침
  const front = fingersWith(0.85);  // 손바닥이 카메라 — 너클 줄이 펼쳐짐
  ok(viewFits(side, 'side') === true, '6 옆모습 자세는 옆모습 단계를 통과');
  ok(viewFits(side, 'front') === false, '6 옆모습 자세로는 정면 단계를 못 지난다');
  ok(viewFits(front, 'front') === true, '6 정면 자세는 정면 단계를 통과');
  ok(viewFits(front, 'side') === false, '6 정면 자세로는 옆모습 단계를 못 지난다 — 이게 막고 싶던 것');

  const mid = fingersWith((VIEW_FIT.sideMax + VIEW_FIT.frontMin) / 2);
  ok(viewFits(mid, 'side') === false && viewFits(mid, 'front') === false,
     '6 사각지대는 어느 쪽도 통과 못 함(안내는 뜨되 relaxMs 뒤 진행)');

  ok(viewFits(null, 'side') === true && viewFits(undefined, 'front') === true,
     '6 손이 안 잡힌 프레임은 자세 판정 대상이 아니다(호출부가 따로 안내)');
  ok(viewFits({ spread: NaN }, 'side') === true, '6 값이 이상하면 붙잡지 않는다');
}

// ─── isTrusted: 'off'만 못 믿는다 ───────────────────────────
{
  ok(isTrusted({ view: 'ok' }) === true, "7 view:'ok'는 믿는다");
  ok(isTrusted({ view: 'off' }) === false, "7 view:'off'만 못 믿는다");
  ok(isTrusted({}) === true, '7 필드 없는 옛 기록은 소급해서 죽이지 않는다');
  ok(isTrusted({ view: null }) === true, '7 null도 ok로 읽는다');
  ok(isTrusted(null) === false, '7 레코드 자체가 없으면 false');
}

// ─── 자세 게이트를 못 맞춘 체크는 자동 판정에서 빠진다 ────────
{
  const badLast = st(rec('2026-01-01', 'right', 50, 50), rec('2026-01-08', 'right', 40, 40, 'off'));
  ok(isRedSignal(badLast, '2026-01-08') === false, "8 최신이 view:'off'면 red 없음");

  const badLastUp = st(rec('2026-01-01', 'right', 40, 40), rec('2026-01-08', 'right', 50, 50, 'off'));
  ok(isImproving(badLastUp, '2026-01-08') === false, "8 최신이 view:'off'면 개선도 없음");

  // 최신이 off일 때 그걸 건너뛰고 '그 앞 둘'로 옛날 변화를 되살리면 안 된다
  const stale = st(rec('2026-01-01', 'right', 50, 50), rec('2026-01-08', 'right', 40, 40),
                   rec('2026-01-15', 'right', 41, 41, 'off'));
  ok(isRedSignal(stale, '2026-01-15') === false,
     '8 최신이 off면 그 앞의 옛 변화로 신호가 되살아나지 않는다');

  // 반대로 '중간'에 낀 off는 건너뛰고 그 앞의 믿을 만한 것과 비교한다
  const midBad = st(rec('2026-01-01', 'right', 50, 50), rec('2026-01-08', 'right', 20, 20, 'off'),
                    rec('2026-01-15', 'right', 40, 40));
  ok(isRedSignal(midBad, '2026-01-15') === true,
     '8 중간의 off는 건너뛰고 그 앞 믿을 만한 기록과 비교(50→40 = red)');

  const both = st(rec('2026-01-01', 'right', 50, 50), rec('2026-01-08', 'left', 50, 50),
                  rec('2026-01-15', 'right', 40, 40, 'off'));
  ok(isRedSignal(both, '2026-01-15') === false, '8 손·자세 조건이 함께 적용된다');
}

// ─── 업데이트 전 저장본(view 키 자체가 없음)이 침묵하지 않는가 ────
// ★이 블록은 makeMeasurement를 일부러 안 쓴다 — 그 함수는 항상 view를 찍으므로
//   "필드가 없는 상태"를 재현할 수 없다. localStorage에 실제로 들어 있던 모양 그대로 만든다.
//   migrate()는 schemaVersion 도장만 찍고 레코드를 손대지 않으므로, 읽는 시점에도 키는 없다.
//
//   여기가 무너지면(예: 신뢰 규칙을 view === 'ok'만 통과로 짜면) 업데이트 순간 기존
//   사용자 전원의 히스토리가 신호 공급을 멈춘다 — 순한 코스도 긍정 신호도 침묵.
//   증상이 '아무 일도 안 일어남'이라 눈에 안 띄는 종류의 사고다.
{
  const legacy = (at, hand, flex, ext) =>
    ({ v: 2, at, hand, flex, ext, rom: flex + ext, radialDev: null, ulnarDev: null }); // view 없음

  const one = legacy('2026-01-08', 'right', 40, 40);
  ok(!('view' in one), '10 픽스처에 view 키가 정말 없다(테스트 자체의 전제 확인)');
  ok(isTrusted(one) === true, '10 옛 기록은 신뢰 게이트를 통과');

  ok(isRedSignal(st(legacy('2026-01-01', 'right', 50, 50), one), '2026-01-08') === true,
     '10 옛 기록만으로도 red 신호가 그대로 난다');
  ok(isImproving(st(legacy('2026-01-01', 'right', 40, 40), legacy('2026-01-08', 'right', 50, 50)),
                 '2026-01-08') === true, '10 옛 기록만으로도 개선 신호가 그대로 난다');

  // v1(편위 필드조차 없고 hand도 null) — 가장 오래된 모양
  const v1 = (at, flex, ext) => ({ v: 1, at, hand: null, flex, ext, rom: flex + ext });
  ok(isRedSignal(st(v1('2026-01-01', 50, 50), v1('2026-01-08', 40, 40)), '2026-01-08') === true,
     '10 v1 기록(hand:null·편위 없음·view 없음)도 신호가 난다');

  // 새 기록과 옛 기록이 섞여도 — 옛 것을 기준으로 새 것을 판정할 수 있어야 한다
  ok(isRedSignal(st(legacy('2026-01-01', 'right', 50, 50),
                    makeMeasurement({ at: '2026-01-08', hand: 'right', flex: 40, ext: 40 })),
                 '2026-01-08') === true, '10 옛 기록 → 새 기록 비교도 성립');
}

// ─── 표시는 막지 않는다 ─────────────────────────────────────
{
  // sameHandSeries는 자세를 안 본다 — 추이·델타는 자기 기록을 그대로 보여줘야 한다
  const ms = [rec('2026-01-01', 'right', 50, 50), rec('2026-01-08', 'right', 40, 40, 'off')];
  ok(sameHandSeries(ms).length === 2, "9 view:'off'도 추이 표시에는 남는다(판정만 막는다)");
}

console.log(`\n측정 신뢰(같은 손 · 자세 게이트) 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
