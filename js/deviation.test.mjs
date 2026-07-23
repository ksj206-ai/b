// ═══════════════════════════════════════════════════════════
// deviation.test.mjs — 정면 편위(요측/척측) ①단계: 측정 로직·저장 테스트
// 실행: `node js/deviation.test.mjs` (실패 시 exit 1).
// main.js의 측정 화면은 DOM·카메라에 묶여 자동 테스트가 어렵다. 화면이 실제로 쓰는
// 순수 조각만 여기서 검증한다:
//   · 부호 정규화 flexExtRel/deviationRel — 두 단계의 '반전하는 손'이 서로 반대인 것
//   · 편위 캡처 = createRomMeasurer 재사용 (요측=A / 척측=B, 유지-캡처·래치·보상동작)
//   · 저장 스키마 makeMeasurement(v2) + schemaVersion 마이그레이션
//   · 옛 기록(v1, 편위 없음) 안전 — adapt 판정(computeFocus/isRedSignal/isImproving) 불변
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import { flexExtRel, deviationRel, createRomMeasurer } from './measurement.js';
import {
  makeMeasurement, migrate, load, SCHEMA_VERSION, deviationProgress,
  computeFocus, isRedSignal, isImproving, getAdapt,
} from './store.js';
import { ROM, STORAGE_KEYS, FUNCTIONAL_ROM } from './config.js';

let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  if (got === want) { pass++; return; }
  fail++;
  console.error(`FAIL ${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };

// 끝범위를 holdMs 동안 유지해 한쪽을 캡처한다(측정 화면의 프레임 루프를 압축한 것).
// 실제 화면은 rel을 부호 정규화한 뒤 feed하므로 여기서도 같은 순서를 지킨다.
function hold(rom, rel, t0, { compBad = false, ms = ROM.holdMs } = {}) {
  rom.feed(rel, t0, compBad);
  return rom.feed(rel, t0 + ms, compBad);
}
/** 중립 근처로 복귀 → 래치 해제(반대쪽 측정 준비) */
const rearm = (rom, t) => rom.feed(0, t, false);

// ═══ 1) 부호 정규화 — A(rel<0)/B(rel>0)가 늘 같은 물리 방향을 가리키는가 ═══
{
  // 굽힘·폄(옆모습): 부호 기준이 왼손 → 오른손만 반전 (기존 동작 그대로)
  eq(flexExtRel(-20, 'left'), -20, '1 굽힘·폄 왼손은 그대로(A=굽힘)');
  eq(flexExtRel(-20, 'right'), 20, '1 굽힘·폄 오른손은 반전');

  // 편위(정면·손바닥이 카메라): 오른손은 엄지(요측)가 화면 왼쪽(−x)이라 요측일 때
  // 손목→MCP중심 각이 중립(−90°)보다 더 음수 → rel<0. 즉 오른손이 기준, 왼손을 반전한다.
  eq(deviationRel(-20, 'right'), -20, '1 편위 오른손은 그대로(A=요측)');
  eq(deviationRel(-20, 'left'), 20, '1 편위 왼손은 반전');

  // ★ 회귀 방지의 핵심: 두 단계가 반전하는 손은 서로 반대다(옆모습과 정면은 뒤집히는 축이 다름).
  //   한쪽 규칙을 다른 쪽에 복사해 오면 이 단언이 깨진다.
  ok(Math.sign(flexExtRel(-20, 'right')) !== Math.sign(deviationRel(-20, 'right')),
     '1 오른손: 굽힘·폄과 편위의 보정 방향이 서로 반대');
  ok(Math.sign(flexExtRel(-20, 'left')) !== Math.sign(deviationRel(-20, 'left')),
     '1 왼손: 굽힘·폄과 편위의 보정 방향이 서로 반대');
}

// ═══ 2) 편위 캡처 — 같은 물리 동작이 손과 무관하게 요측=A / 척측=B로 들어가는가 ═══
{
  // 화면상 rel: 오른손 요측=−, 척측=+ / 왼손은 거울이라 요측=+, 척측=−
  const screen = { right: { radial: -18, ulnar: 30 }, left: { radial: 18, ulnar: -30 } };
  for (const hand of ['right', 'left']) {
    const rom = createRomMeasurer();
    const s = screen[hand];
    const a = hold(rom, deviationRel(s.radial, hand), 0);
    eq(a.captured && a.captured.side, 'A', `2 ${hand} 요측 → A쪽 캡처`);
    eq(rom.state.maxA, 18, `2 ${hand} 요측 18°`);
    rearm(rom, ROM.holdMs + 100);
    const b = hold(rom, deviationRel(s.ulnar, hand), ROM.holdMs + 200);
    eq(b.captured && b.captured.side, 'B', `2 ${hand} 척측 → B쪽 캡처`);
    eq(rom.state.maxB, 30, `2 ${hand} 척측 30°`);
  }
}

// ═══ 3) 유지-캡처 규칙이 편위에도 그대로 적용되는가 (굽힘·폄과 같은 파이프라인) ═══
{
  // 3a: 유지 시간 미달 → 캡처 없음(진행률만 오름)
  const rom = createRomMeasurer();
  rom.feed(-20, 0, false);
  const mid = rom.feed(-20, ROM.holdMs - 200, false);
  eq(mid.captured, null, '3a 유지 미달이면 캡처 없음');
  ok(mid.progress > 0 && mid.progress < 1, '3a 진행률만 오름');
  eq(rom.state.maxA, 0, '3a 최대각 아직 0');

  // 3b: 보상동작(팔이 따라 움직임) 중엔 캡처 금지 — usePose:true라야 comp가 계산된다
  const rc = createRomMeasurer();
  const bad = hold(rc, -20, 0, { compBad: true });
  eq(bad.captured, null, '3b 보상동작 중엔 캡처 안 함');
  eq(rc.state.maxA, 0, '3b 보상동작 중 최대각 0');

  // 3c: 최소각 미만(minExt)은 측정 대상 아님 — 정면 미세 흔들림이 편위로 잡히지 않게
  const rs = createRomMeasurer();
  eq(hold(rs, -(ROM.minExt - 1), 0).captured, null, '3c 최소각 미만은 캡처 안 함');

  // 3d: 래치 — 한쪽 캡처 후 중립 복귀 없이 더 크게 가도 재캡처 안 되고, 복귀하면 다시 잰다
  const rl = createRomMeasurer();
  hold(rl, -15, 0);
  eq(hold(rl, -25, ROM.holdMs + 100).captured, null, '3d 래치 중엔 재캡처 안 함');
  eq(rl.state.maxA, 15, '3d 래치 중 최대각 유지');
  rearm(rl, ROM.holdMs * 2 + 200);
  hold(rl, -25, ROM.holdMs * 2 + 300);
  eq(rl.state.maxA, 25, '3d 중립 복귀 후엔 더 큰 값으로 갱신');
}

// ═══ 4) 저장 스키마 (v2) ═══
{
  const full = makeMeasurement({ at: '2026-07-23', hand: 'right', flex: 40, ext: 55, radialDev: 18, ulnarDev: 30 });
  eq(full.v, 2, '4 레코드 버전 2');
  eq(full.radialDev, 18, '4 요측 저장');
  eq(full.ulnarDev, 30, '4 척측 저장');
  // rom은 기존 정의 그대로 굽힘+폄 — 편위를 섞으면 computeFocus·isImproving이 읽는 축이 바뀐다
  eq(full.rom, 95, '4 rom은 굽힘+폄 합(편위 미포함)');
  eq(full.flex, 40, '4 굽힘 그대로');
  eq(full.ext, 55, '4 폄 그대로');
  eq(full.hand, 'right', '4 손 그대로');

  // 편위를 못 잰 세션(0 = 미캡처) → null. 편위 필드가 아예 없는 v1과 같은 "없음" 취급이 되도록.
  const none = makeMeasurement({ at: '2026-07-23', hand: 'left', flex: 40, ext: 55, radialDev: 0, ulnarDev: 0 });
  eq(none.radialDev, null, '4 요측 미캡처 → null');
  eq(none.ulnarDev, null, '4 척측 미캡처 → null');
  eq(none.rom, 95, '4 편위 없어도 rom 불변');

  // 한쪽만 캡처한 경우도 그대로 남는다(부분 저장 허용)
  const half = makeMeasurement({ at: '2026-07-23', hand: 'right', flex: 30, ext: 30, radialDev: 12, ulnarDev: 0 });
  eq(half.radialDev, 12, '4 한쪽만 캡처 → 그 값 저장');
  eq(half.ulnarDev, null, '4 나머지 한쪽은 null');

  // 인자 생략·비정상값도 저장 가능한 형태로 (NaN/undefined가 기록에 새지 않게)
  const bare = makeMeasurement({ at: '2026-07-23' });
  eq(bare.flex, 0, '4 기본 굽힘 0');
  eq(bare.rom, 0, '4 기본 rom 0');
  eq(bare.radialDev, null, '4 기본 요측 null');
  eq(bare.hand, null, '4 손 미지정 → null');
  eq(makeMeasurement({ at: 'd', radialDev: NaN }).radialDev, null, '4 NaN 편위 → null');
}

// ═══ 5) 마이그레이션 — 버전만 올리고 옛 레코드는 손대지 않는다 ═══
{
  const v1rec = { v: 1, at: '2026-07-01', hand: 'right', flex: 35, ext: 50, rom: 85 };
  const old = migrate({ schemaVersion: 1, measurements: [{ ...v1rec }] });
  eq(old.schemaVersion, SCHEMA_VERSION, '5 v1 → 현재 버전으로 도장');
  eq('radialDev' in old.measurements[0], false, '5 옛 레코드에 편위 필드를 만들지 않음');
  eq(old.measurements[0].rom, 85, '5 옛 레코드 값 불변');

  // 이미 최신이면 그대로. 미래 버전(앱 다운그레이드)도 끌어내리지 않는다.
  eq(migrate({ schemaVersion: SCHEMA_VERSION }).schemaVersion, SCHEMA_VERSION, '5 최신은 그대로');
  eq(migrate({ schemaVersion: 99 }).schemaVersion, 99, '5 미래 버전은 낮추지 않음');
  eq(migrate({}).schemaVersion, SCHEMA_VERSION, '5 버전 없는 옛 저장본도 도장');

  // 실제 load() 경로로도 같은지 (localStorage → 병합 → migrate)
  localStorage.setItem(STORAGE_KEYS.ROOT, JSON.stringify({ schemaVersion: 1, measurements: [{ ...v1rec }] }));
  const s = load();
  eq(s.schemaVersion, SCHEMA_VERSION, '5 load()가 버전을 올림');
  eq(s.measurements.length, 1, '5 옛 측정 기록 보존');
  eq(s.measurements[0].flex, 35, '5 옛 측정값 보존');
  localStorage.removeItem(STORAGE_KEYS.ROOT);
}

// ═══ 6) 옛 기록 안전 — 편위 추가가 기존 adapt 판정을 건드리지 않는가 ═══
{
  const v1 = (at, flex, ext) => ({ v: 1, at, hand: 'right', flex, ext, rom: flex + ext });
  const v2 = (at, flex, ext, rd, ud) =>
    makeMeasurement({ at, hand: 'right', flex, ext, radialDev: rd, ulnarDev: ud });

  // 6a: v1만 있는 기존 사용자 — 판정 결과가 편위 도입 전과 같아야 한다
  {
    const s = { measurements: [v1('2026-07-01', 50, 50), v1('2026-07-08', 35, 50)] };
    eq(computeFocus(s, '2026-07-08').focus, 'flex', '6a v1만: focus=flex');
    eq(computeFocus(s, '2026-07-08').focusSoft, false, '6a v1만: 약함(soft 아님)');
    eq(isRedSignal(s, '2026-07-08'), true, '6a v1만: 급락 → red');
    eq(isImproving(s, '2026-07-08'), false, '6a v1만: 개선 아님');
  }

  // 6b: v1(옛) + v2(편위 있음)가 섞여도 판정은 flex/ext/rom만 본다 → 6a와 동일 결과
  {
    const s = { measurements: [v1('2026-07-01', 50, 50), v2('2026-07-08', 35, 50, 18, 30)] };
    eq(computeFocus(s, '2026-07-08').focus, 'flex', '6b 혼재: focus 동일');
    eq(isRedSignal(s, '2026-07-08'), true, '6b 혼재: red 동일');
    eq(isImproving(s, '2026-07-08'), false, '6b 혼재: 개선 판정 동일');
  }

  // 6c: 편위 값이 크게 달라져도 red/improve/focus는 꿈쩍 않는다 (편위 → 적응형 연결 금지, ①단계 범위)
  {
    const base = [v2('2026-07-01', 40, 40, 5, 5), v2('2026-07-08', 40, 40, 40, 40)];
    const s = { measurements: base };
    eq(isImproving(s, '2026-07-08'), false, '6c 편위만 크게 올라도 개선 아님');
    eq(isRedSignal(s, '2026-07-08'), false, '6c 편위만 크게 변해도 red 아님');
    eq(computeFocus(s, '2026-07-08').focus, null, '6c 굽힘=폄이면 focus 없음(편위 무시)');
  }

  // 6d: 편위가 null인 v2(편위 단계를 건너뜀)도 v1과 똑같이 안전
  {
    const s = { measurements: [v2('2026-07-01', 50, 50, 0, 0), v2('2026-07-08', 35, 50, 0, 0)] };
    eq(s.measurements[0].radialDev, null, '6d 건너뛴 편위는 null');
    eq(computeFocus(s, '2026-07-08').focus, 'flex', '6d null 편위: focus 동일');
    eq(isRedSignal(s, '2026-07-08'), true, '6d null 편위: red 동일');
  }

  // 6e: 편위는 adapt 상태에 아무 흔적도 남기지 않는다 (focus/doseLevel 축 불변)
  {
    const a = getAdapt({ adapt: null });
    eq(a.focus, null, '6e 기본 adapt.focus null');
    ok(!('radialDev' in a) && !('dev' in a), '6e adapt에 편위 필드 없음');
  }
}

// ═══ 7) 합 기능 진척률 (②단계 표시용) — (요측+척측)/40, 0~100 clamp ═══
{
  const T = FUNCTIONAL_ROM.deviationCombined;
  eq(T, 40, '7 기준은 config에서 온다(하드코딩 아님)');
  const rec = (rd, ud) => makeMeasurement({ at: 'd', hand: 'right', flex: 40, ext: 40, radialDev: rd, ulnarDev: ud });

  // 7a: 기본 계산 — 합 ÷ 40
  {
    const d = deviationProgress(rec(18, 30));   // 합 48
    eq(d.sum, 48, '7a 합 = 요측+척측');
    eq(d.pct, 100, '7a 48/40 → 100으로 clamp(120% 금지)');
    eq(d.both, true, '7a 양쪽 다 잼');
    eq(deviationProgress(rec(10, 10)).pct, 50, '7a 20/40 = 50%');
    eq(deviationProgress(rec(8, 8)).pct, 40, '7a 16/40 = 40%');
    eq(deviationProgress(rec(20, 20)).pct, 100, '7a 정확히 기준이면 100%');
  }

  // 7b: 상단 clamp — 기준을 크게 넘겨도 100을 안 넘는다("정상 대비 %" 금지 원칙과도 맞음)
  {
    eq(deviationProgress(rec(60, 60)).pct, 100, '7b 큰 값도 100 상한');
    eq(deviationProgress(rec(60, 60)).sum, 120, '7b 합 자체는 clamp 안 함(추이용 원값)');
  }

  // 7c: 하단 — 음수·0은 makeMeasurement가 null로 만들고, 진척률은 0 밑으로 안 감
  {
    const d = deviationProgress(rec(0, 0));
    eq(d.has, false, '7c 양쪽 미캡처 → 편위 없음(표시 안 함)');
    eq(d.pct, 0, '7c pct 0');
    eq(deviationProgress({ radialDev: -30, ulnarDev: -10 }).has, false, '7c 음수는 편위 없음 취급');
    eq(deviationProgress({ radialDev: 5, ulnarDev: -10 }).pct, 13, '7c 음수 한쪽 무시 → 5/40=12.5→13');
  }

  // 7d: 한쪽만 캡처 — has=true지만 both=false (화면은 이때 헤드라인 진척률을 쓰지 않는다)
  {
    const d = deviationProgress(rec(18, 0));
    eq(d.has, true, '7d 한쪽만이라도 편위 있음');
    eq(d.both, false, '7d 양쪽은 아님');
    eq(d.sum, 18, '7d 잰 쪽만 합산');
    eq(d.radial, 18, '7d 잰 쪽 값');
    eq(d.ulnar, null, '7d 못 잰 쪽 null');
  }

  // 7e: 옛 기록(v1, 편위 필드 없음)·null·빈 객체 — 에러 없이 has=false
  {
    eq(deviationProgress({ v: 1, at: 'd', flex: 35, ext: 50, rom: 85 }).has, false, '7e v1 옛 기록 안전');
    eq(deviationProgress(null).has, false, '7e null 안전');
    eq(deviationProgress(undefined).has, false, '7e undefined 안전');
    eq(deviationProgress({}).has, false, '7e 빈 객체 안전');
    eq(deviationProgress(null).pct, 0, '7e null이어도 pct 0');
  }

  // 7f: 라벨이 뒤바뀌어도(부호 미확정 리스크) 합·진척률은 그대로 — 이게 합을 쓰는 이유
  {
    const a = deviationProgress(rec(12, 25));
    const flipped = deviationProgress(rec(25, 12));   // 요측/척측이 서로 뒤바뀐 경우
    eq(a.sum, flipped.sum, '7f 라벨이 뒤집혀도 합 동일');
    eq(a.pct, flipped.pct, '7f 라벨이 뒤집혀도 진척률 동일');
  }

  // 7g: 기준 주입 — 0·음수 기준에도 ÷0 없이 안전
  {
    eq(deviationProgress(rec(10, 10), 20).pct, 100, '7g 기준 20이면 20/20=100%');
    eq(Number.isFinite(deviationProgress(rec(10, 10), 0).pct), true, '7g 기준 0이어도 유한값');
    eq(Number.isFinite(deviationProgress(rec(10, 10), -5).pct), true, '7g 음수 기준도 유한값');
  }

  // 7h: 반올림 — 소수점이 화면에 새지 않는다
  {
    eq(Number.isInteger(deviationProgress(rec(7, 6)).pct), true, '7h pct는 정수');
    eq(deviationProgress(rec(7, 6)).pct, 33, '7h 13/40 = 32.5 → 33');
  }
}

console.log(`\n정면 편위(측정·저장·표시) 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
