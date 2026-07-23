// ═══════════════════════════════════════════════════════════
// star.test.mjs — "오늘의 별자리 한마디" tier 선택 테스트 (보이는_돌봄_설계 §1)
// 실행: `node js/star.test.mjs` (실패 시 exit 1).
// dailyStarMessage는 상태를 읽어 tier 하나를 고르는 것이 전부다. 여기서 검증하는 건
// ① 상태별로 맞는 tier를 고르는가 ② 우선순위가 지켜지는가 ③ 같은 날 같은 문구인가
// ④ 어떤 상태에서도 금지어(약함/부족/나빠짐/%…)가 새지 않는가.
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import { dailyStarMessage } from './routine.js';
import { STAR_MESSAGE } from './config.js';

let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  if (got === want) { pass++; return; }
  fail++;
  console.error(`FAIL ${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };

const D = '2026-07-23';                     // 기준일
const ago = (n) => {                        // D로부터 n일 전
  const d = new Date(Date.parse(`${D}T00:00:00`) - n * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const meas = (at, flex, ext) => ({ v: 2, at, hand: 'right', flex, ext, rom: flex + ext });
const adaptOf = (patch = {}) => ({
  focus: null, focusSoft: false, doseLevel: {}, toleratedStreak: 0,
  lastImproveShownAt: null, lastAdaptedAt: null, lastDoseAction: null, ...patch,
});
/** 기본은 어떤 tier도 안 걸리는 '깨끗한' 상태 — 여기에 조건 하나만 얹어 tier를 확인한다 */
const base = (patch = {}) => ({
  measurements: [], conditions: [], routine: null, sky: null,
  streakDays: 0, lastActiveDate: null, adapt: adaptOf(), ...patch,
});
const tierOf = (s, date = D) => dailyStarMessage(s, date).tier;

// ── T1: 기본 — 아무 신호도 없으면 중립 tier ──
{
  eq(tierOf(base()), 'base', 'T1 신호 없음 → 기본');
  ok(dailyStarMessage(base(), D).text.length > 0, 'T1 문구가 비지 않음');
}

// ── T2: 개선 (1순위) — 측정 개선 + 견딤 streak 충족 ──
{
  const s = base({
    measurements: [meas(ago(7), 35, 50), meas(ago(1), 45, 52)],  // rom +12 → 개선
    adapt: adaptOf({ toleratedStreak: 3 }),
  });
  eq(tierOf(s), 'improve', 'T2 개선 신호 → improve');
}

// ── T3: 순한 날 — stiff(자기보고)와 red(측정 추론)의 톤이 갈린다 ──
{
  // 어제 stiff → 공감 tier
  const s1 = base({ conditions: [{ at: ago(1), condition: 'stiff' }] });
  eq(tierOf(s1), 'gentleStiff', 'T3 어제 뻐근 → gentleStiff');

  // 측정 급락(red) → 중립 tier. 앱이 '추론'한 것이라 공감 문구를 쓰지 않는다.
  const s2 = base({ measurements: [meas(ago(7), 45, 50), meas(ago(1), 30, 50)] }); // flex -15
  eq(tierOf(s2), 'gentleRed', 'T3 측정 급락 → gentleRed');

  // 둘 다면 stiff 우선 (자기보고가 추론보다 구체적)
  const s3 = base({
    conditions: [{ at: ago(1), condition: 'stiff' }],
    measurements: [meas(ago(7), 45, 50), meas(ago(1), 30, 50)],
  });
  eq(tierOf(s3), 'gentleStiff', 'T3 stiff + red → stiff 우선');
}

// ── T4: 레벨업 — 오늘 올라간 날만 (어제 오른 걸 오늘 또 축하하지 않는다) ──
{
  const up = (at) => base({ adapt: adaptOf({ lastAdaptedAt: at, lastDoseAction: 'up' }) });
  eq(tierOf(up(D)), 'levelUp', 'T4 오늘 상승 → levelUp');
  eq(tierOf(up(ago(1))), 'base', 'T4 어제 상승은 오늘 축하 안 함');
  const down = base({ adapt: adaptOf({ lastAdaptedAt: D, lastDoseAction: 'down' }) });
  eq(tierOf(down), 'base', 'T4 하강한 날은 levelUp 아님');
}

// ── T5: 오늘의 포커스 — focus가 있으면(soft 포함) 방향으로 말한다 ──
{
  eq(tierOf(base({ adapt: adaptOf({ focus: 'flex' }) })), 'focus', 'T5 focus 있음 → focus');
  eq(tierOf(base({ adapt: adaptOf({ focus: 'ext', focusSoft: true }) })), 'focus', 'T5 focusSoft도 focus tier');
}

// ── T6: 꾸준함 — 연속 방문 또는 적응형 견딤 중 하나만 넘어도 인정 ──
{
  const byStreak = base({ streakDays: STAR_MESSAGE.streakMin, lastActiveDate: D });
  eq(tierOf(byStreak), 'streak', 'T6 스트릭 충족 → streak');
  const byTolerated = base({ adapt: adaptOf({ toleratedStreak: STAR_MESSAGE.toleratedMin }) });
  eq(tierOf(byTolerated), 'streak', 'T6 견딤 streak 충족 → streak');
  const below = base({ streakDays: STAR_MESSAGE.streakMin - 1, lastActiveDate: D });
  eq(tierOf(below), 'base', 'T6 둘 다 미달 → 기본');
}

// ── T7: 우선순위 — 여러 신호가 동시에 켜져도 위쪽 하나만 (설계 §1.1) ──
{
  const all = base({
    measurements: [meas(ago(7), 35, 50), meas(ago(1), 45, 52)],   // 개선
    conditions: [{ at: ago(1), condition: 'stiff' }],             // 순한
    streakDays: 9, lastActiveDate: D,                             // 꾸준함
    adapt: adaptOf({ focus: 'flex', toleratedStreak: 5, lastAdaptedAt: D, lastDoseAction: 'up' }),
  });
  eq(tierOf(all), 'improve', 'T7 전부 켜짐 → 개선이 1순위');

  // 위 신호를 하나씩 빼면 다음 순위가 올라온다
  const noImprove = base({
    measurements: [meas(ago(1), 45, 52)],                          // 1회뿐 → 개선 판정 불가
    conditions: [{ at: ago(1), condition: 'stiff' }],
    streakDays: 9, lastActiveDate: D,
    adapt: adaptOf({ focus: 'flex', toleratedStreak: 5, lastAdaptedAt: D, lastDoseAction: 'up' }),
  });
  eq(tierOf(noImprove), 'gentleStiff', 'T7 개선 빠짐 → 순한');

  const noGentle = base({
    streakDays: 9, lastActiveDate: D,
    adapt: adaptOf({ focus: 'flex', toleratedStreak: 5, lastAdaptedAt: D, lastDoseAction: 'up' }),
  });
  eq(tierOf(noGentle), 'levelUp', 'T7 순한 빠짐 → 레벨업');

  const noLevelUp = base({
    streakDays: 9, lastActiveDate: D, adapt: adaptOf({ focus: 'flex', toleratedStreak: 5 }),
  });
  eq(tierOf(noLevelUp), 'focus', 'T7 레벨업 빠짐 → 포커스');

  const noFocus = base({ streakDays: 9, lastActiveDate: D, adapt: adaptOf({ toleratedStreak: 5 }) });
  eq(tierOf(noFocus), 'streak', 'T7 포커스 빠짐 → 꾸준함');
}

// ── T8: 같은 날 = 같은 문구 (홈 재렌더에 문구가 깜빡이면 소음이 된다) ──
{
  const s = base({ adapt: adaptOf({ focus: 'flex' }) });
  const a = dailyStarMessage(s, D), b = dailyStarMessage(s, D), c = dailyStarMessage(s, D);
  eq(a.text, b.text, 'T8 재호출해도 같은 문구');
  eq(b.text, c.text, 'T8 세 번째도 같은 문구');
  // 날이 바뀌면 로테이션될 수 있어야 한다(항상 같은 한 문구에 고정되면 식상)
  const days = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'];
  ok(new Set(days.map((d) => dailyStarMessage(s, d).text)).size > 1, 'T8 날이 바뀌면 문구 로테이션');
}

// ── T9: 치환 — 값이 있으면 채우고, 없으면 그 문구를 후보에서 뺀다 ──
{
  // {n}일째: 스트릭이 0인데(견딤만 충족) "0일째"라고 말하면 안 된다
  const onlyTolerated = base({ adapt: adaptOf({ toleratedStreak: 5 }) });
  for (const d of ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']) {
    const r = dailyStarMessage(onlyTolerated, d);
    eq(r.tier, 'streak', `T9 ${d} streak tier`);
    ok(!/0일째/.test(r.text), `T9 ${d} "0일째"라고 말하지 않음`);
    ok(!r.text.includes('{'), `T9 ${d} 치환자가 그대로 새지 않음`);
  }
  // focus 방향은 사람 말로 치환된다
  const focusFlex = base({ adapt: adaptOf({ focus: 'flex' }) });
  const texts = ['2026-07-20', '2026-07-21', '2026-07-22'].map((d) => dailyStarMessage(focusFlex, d).text);
  ok(texts.every((t) => !t.includes('{')), 'T9 focus 문구에 치환자 안 남음');
  ok(texts.some((t) => t.includes('굽힘')), 'T9 focus=flex → "굽힘"으로 치환');
}

// ── T10: 가드레일 — 어떤 상태에서도 금지어가 새지 않는다 (설계 §0) ──
{
  const BANNED = /약함|약해|부족|나빠|나빴|떨어졌|하락|실패|놓치|놓친|정상 대비|성적|%|해야 (해요|합니다)/;
  const states = [
    ['기본', base()],
    ['개선', base({ measurements: [meas(ago(7), 35, 50), meas(ago(1), 45, 52)], adapt: adaptOf({ toleratedStreak: 3 }) })],
    ['stiff', base({ conditions: [{ at: ago(1), condition: 'stiff' }] })],
    ['red', base({ measurements: [meas(ago(7), 45, 50), meas(ago(1), 30, 50)] })],
    ['레벨업', base({ adapt: adaptOf({ lastAdaptedAt: D, lastDoseAction: 'up' }) })],
    ['focus-flex', base({ adapt: adaptOf({ focus: 'flex' }) })],
    ['focus-ext', base({ adapt: adaptOf({ focus: 'ext' }) })],
    ['꾸준함', base({ streakDays: 9, lastActiveDate: D })],
  ];
  for (const [label, s] of states) {
    for (const d of ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23']) {
      const t = dailyStarMessage(s, d).text;
      ok(!BANNED.test(t), `T10 ${label}(${d}) 금지어 없음 — "${t}"`);
      ok(t.length > 0 && !t.includes('{'), `T10 ${label}(${d}) 문구 정상`);
    }
  }
}

// ── T11: 엣지 — 빈 상태·깨진 날짜·adapt 없음에도 문구가 나온다 ──
{
  ok(dailyStarMessage({}, D).text.length > 0, 'T11 빈 state 안전');
  ok(dailyStarMessage({ adapt: null }, D).text.length > 0, 'T11 adapt null 안전');
  ok(dailyStarMessage(base(), 'not-a-date').text.length > 0, 'T11 깨진 날짜 안전');
  ok(!dailyStarMessage(base(), 'not-a-date').text.includes('{'), 'T11 깨진 날짜에도 치환자 안 남음');
}

console.log(`\n오늘의 별자리 한마디 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
