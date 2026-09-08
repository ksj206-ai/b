// ═══════════════════════════════════════════════════════════
// reminder.test.mjs — 리마인더 발송 판정(dueTimes) 순수 로직 테스트
// 실행: `node js/reminder.test.mjs` (실패 시 exit 1).
//
// 이 테스트가 지키는 것은 하나다: **판정이 "지금이 정각인가"가 아니라 "지났는데 아직
// 안 보냈는가"여야 한다.** 옛 판정은 현재 시각이 21:00과 정확히 같은지를 물었는데,
// 브라우저가 백그라운드 탭 타이머를 1분에 1회로 조이면 틱이 20:59:59 → 21:01:00으로
// 건너뛰면서 21:00이라는 분 자체를 못 보고 지나간다. 화면엔 아무 흔적도 안 남는다.
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import { dueTimes, CATCHUP_MIN, REMINDER_PRESETS, REMINDER_MAX } from './reminder.js';

let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.error(`FAIL ${msg}: got ${g}, want ${w}`);
};

const TODAY = '2026-09-08';
// 시각만 바꾸는 '오늘' — dueTimes는 getHours/getMinutes만 보므로 날짜부는 아무 값이어도 된다.
const at = (hh, mm) => new Date(2026, 8, 8, hh, mm, 0);
const mk = (times, patch = {}) => ({ times, enabled: true, firedAt: null, ...patch });

// ── D1: 정각 ──
eq(dueTimes(mk(['21:00']), at(21, 0), TODAY), ['21:00'], 'D1 정각이면 보낸다');

// ── D2: ★핵심 회귀 — 스로틀링으로 정각 틱을 건너뛴 경우 ──
// 옛 판정(정각 일치)은 여기서 빈 배열을 준다. 그게 이 커밋이 고치는 버그다.
eq(dueTimes(mk(['21:00']), at(21, 1), TODAY), ['21:00'], 'D2 1분 늦게 깨어나도 보낸다');

// ── D3·D4: 보정 창의 양쪽 — 숫자를 적지 않고 CATCHUP_MIN에서 만든다 ──
// (여기에 30을 적으면 상수를 바꿔도 테스트가 따라오지 않아 창이 조용히 갈라진다)
{
  const edge = at(21, 0 + CATCHUP_MIN);
  const over = at(21, 0 + CATCHUP_MIN + 1);
  eq(dueTimes(mk(['21:00']), edge, TODAY), ['21:00'], 'D3 창 끝(경계 포함)까지는 보낸다');
  eq(dueTimes(mk(['21:00']), over, TODAY), [], 'D4 창을 넘기면 안 보낸다 — 늦은 알림은 근거가 없다');
}

// ── D5: 아직 시각 전 ──
eq(dueTimes(mk(['21:00']), at(20, 59), TODAY), [], 'D5 아직 안 된 시각은 안 보낸다');

// ── D6·D7: firedAt은 하루치다 ──
eq(dueTimes(mk(['21:00'], { firedAt: { date: TODAY, times: ['21:00'] } }), at(21, 5), TODAY),
   [], 'D6 오늘 이미 보냈으면 다시 안 보낸다');
eq(dueTimes(mk(['21:00'], { firedAt: { date: '2026-09-07', times: ['21:00'] } }), at(21, 5), TODAY),
   ['21:00'], 'D7 어제 기록은 오늘을 막지 않는다');

// ── D8: 밀린 것이 둘이어도 창 밖은 안 딸려온다 ──
// 13:00에 깨어났을 때 10:30은 150분 전이라 창 밖 — "쉬어갈 시간"이라 하기엔 늦었다.
eq(dueTimes(mk(['10:30', '13:00']), at(13, 0), TODAY), ['13:00'], 'D8 오래 지난 것은 안 딸려온다');

// ── D9: 창 안에 둘이 겹치면 둘 다 '보낼 것'으로 나온다 ──
// (알림을 두 번 울리라는 뜻이 아니다 — checkNow가 하나만 띄우고 둘 다 보냄으로 적는다.
//  판정 함수는 '무엇이 밀렸나'만 말하고, 몇 번 울릴지는 호출부가 정한다.)
eq(dueTimes(mk(['21:00', '21:20']), at(21, 25), TODAY), ['21:00', '21:20'], 'D9 겹친 둘을 다 돌려준다');

// ── D10~D12: 안 보내야 하는 자리 (전부 '안전 방향') ──
eq(dueTimes(mk(['21:00'], { enabled: false }), at(21, 0), TODAY), [], 'D10 꺼져 있으면 안 보낸다');
eq(dueTimes(mk([]), at(21, 0), TODAY), [], 'D11 시각이 없으면 안 보낸다');
eq(dueTimes(null, at(21, 0), TODAY), [], 'D11b 설정 전(null)이면 안 보낸다');
eq(dueTimes(mk(['어제쯤']), at(21, 0), TODAY), [], 'D12 시각이 깨졌으면 안 보낸다(NaN → 침묵)');

// ── D13: 자정을 넘기면 어제 것을 끌고 오지 않는다 ──
// 23:50 알림을 못 받고 잠들었다면 00:05에 뜨는 게 아니라 오늘 23:50에 다시 온다.
eq(dueTimes(mk(['23:50']), at(0, 5), TODAY), [], 'D13 자정 넘겨 어제 알림을 되살리지 않는다');
eq(dueTimes(mk(['00:10']), at(0, 15), TODAY), ['00:10'], 'D13b 자정 직후 알림은 정상 동작');

// ── D14: 프리셋 간격이 보정 창보다 넓다 (창을 넓히면 알림이 겹쳐 밀린다) ──
{
  const mins = REMINDER_PRESETS.map((p) => {
    const [h, m] = p.time.split(':').map(Number);
    return h * 60 + m;
  }).sort((a, b) => a - b);
  const gaps = mins.slice(1).map((v, i) => v - mins[i]);
  eq(Math.min(...gaps) > CATCHUP_MIN, true, 'D14 가장 좁은 프리셋 간격이 보정 창보다 넓다');
  eq(REMINDER_PRESETS.length >= REMINDER_MAX, true, 'D14b 프리셋이 하루 상한을 채울 만큼은 있다');
}

console.log(`\n리마인더 발송 판정 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
