// ═══════════════════════════════════════════════════════════
// dataTools.test.mjs — 데이터 관리(내보내기·불러오기·삭제) 테스트
// 실행: `node js/dataTools.test.mjs` (실패 시 exit 1).
//
// 화면(버튼·파일 다이얼로그·다운로드)은 자동 검증이 안 되므로, 저장소를 실제로
// 바꾸는 순수 조각만 여기서 고정한다:
//   · 백업 겉봉 — 아무 JSON이나 복원되면 저장소가 통째로 오염된다
//   · 복원은 '교체'다 — 지금 상태와 섞이면 스트릭·별자리가 잡종이 된다
//   · ★삭제 후 focus 재판정 — 지운 기록이 계속 루틴을 바꾸는지가 이 파일의 핵심
//   · 전체 삭제는 ROOT만 — 테마(취향)까지 지우면 "기록 삭제"라는 말이 거짓이 된다
// ═══════════════════════════════════════════════════════════
if (typeof localStorage === 'undefined') {
  globalThis.localStorage = {
    _m: {}, getItem(k) { return this._m[k] ?? null; },
    setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; }, clear() { this._m = {}; },
  };
}

import {
  exportData, importData, deleteMeasurement, clearAllData,
  load, save, makeMeasurement, getAdapt, SCHEMA_VERSION,
} from './store.js';
import { STORAGE_KEYS, FUNCTIONAL_ROM } from './config.js';

let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  if (got === want) { pass++; return; }
  fail++;
  console.error(`FAIL ${msg}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };

const reset = () => localStorage.clear();
/** 며칠 전 날짜 (YYYY-MM-DD) */
const ago = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── E: 내보내기 겉봉 ──────────────────────────────────────
{
  reset();
  const s = load();
  s.measurements = [makeMeasurement({ at: ago(1), hand: 'right', flex: 30, ext: 20 })];
  save(s);

  const box = exportData();
  eq(box.kind, 'wristGarden.backup', 'E1 겉봉에 kind가 있다');
  eq(box.schemaVersion, SCHEMA_VERSION, 'E2 스키마 버전이 함께 실린다');
  ok(typeof box.at === 'string' && box.at.length > 0, 'E3 만든 시각이 실린다');
  eq(box.state.measurements.length, 1, 'E4 상태를 가공 없이 그대로 감싼다');
  ok(JSON.parse(JSON.stringify(box)).state.measurements[0].flex === 30,
     'E5 JSON 왕복 후에도 값이 보존된다(파일로 나갔다 오는 경로)');
}

// ── I: 불러오기 검증 ──────────────────────────────────────
{
  reset();
  // 겉봉이 아닌 것은 전부 거절 — 저장소를 건드리지도 않는다
  const bad = [
    ['깨진 JSON', '{나쁨'],
    ['null', null],
    ['빈 문자열', ''],
    ['겉봉 없는 순수 상태', JSON.stringify({ measurements: [] })],
    ['kind가 다름', JSON.stringify({ kind: 'other', state: {} })],
    ['state 없음', JSON.stringify({ kind: 'wristGarden.backup' })],
    ['state가 배열', JSON.stringify({ kind: 'wristGarden.backup', state: [] })],
  ];
  for (const [label, raw] of bad) {
    eq(importData(raw), null, `I1 거절: ${label}`);
  }
  eq(localStorage.getItem(STORAGE_KEYS.ROOT), null, 'I2 거절된 입력은 저장소를 안 건드린다');

  // 정상 백업 — 지금 상태를 '교체'한다(병합 아님)
  const backup = { kind: 'wristGarden.backup', state: { streakDays: 7, measurements: [
    makeMeasurement({ at: ago(2), hand: 'left', flex: 44, ext: 41 }),
  ] } };
  const cur = load();
  cur.streakDays = 99;
  cur.guideDone = [{ id: 'flex_ext', at: ago(0) }];
  save(cur);

  const next = importData(JSON.stringify(backup));
  ok(next !== null, 'I3 정상 백업은 복원된다');
  eq(next.streakDays, 7, 'I4 백업 값으로 교체된다(현재 99가 남지 않음)');
  eq(next.guideDone.length, 0, 'I5 현재 상태와 병합하지 않는다 — 잡종 방지');
  eq(load().measurements[0].flex, 44, 'I6 저장소에 실제로 반영된다');
  eq(load().schemaVersion, SCHEMA_VERSION, 'I7 옛 백업도 load()와 같은 마이그레이션을 탄다');

  // 필드가 빠진 옛 백업도 기본값 위에 병합돼 앱이 읽을 수 있는 형태가 된다
  const old = importData(JSON.stringify({ kind: 'wristGarden.backup', state: { measurements: [] } }));
  ok(Array.isArray(old.guideDone), 'I8 없는 필드는 기본값으로 채워진다');
}

// ── D: 측정 삭제 + ★focus 재판정 ─────────────────────────
{
  reset();
  const s = load();
  // 굽힘이 약한 기록(오래된 것) → 나중에 폄이 약한 기록. 지우면 판정이 되돌아가야 한다.
  s.measurements = [
    makeMeasurement({ at: ago(9), hand: 'right', flex: 12, ext: 38 }),  // focus = flex
    makeMeasurement({ at: ago(2), hand: 'right', flex: 38, ext: 12 }),  // focus = ext
  ];
  save(s);

  // 현재 상태를 판정에 반영 (측정 종료 시 앱이 하는 것과 같은 경로)
  const { refreshFocus } = await import('./store.js');
  refreshFocus(load());
  eq(getAdapt(load()).focus, 'ext', 'D1 최신 기록 기준으로 focus가 잡혀 있다');

  // 범위 밖 인덱스는 아무것도 안 한다
  eq(deleteMeasurement(9), false, 'D2 범위 밖 인덱스는 false');
  eq(deleteMeasurement(-1), false, 'D3 음수 인덱스는 false');
  eq(deleteMeasurement(1.5), false, 'D4 정수가 아니면 false');
  eq(load().measurements.length, 2, 'D5 실패한 삭제는 배열을 안 건드린다');

  // 최신 기록 삭제 → focus가 이전 기록 기준으로 되돌아가야 한다
  eq(deleteMeasurement(1), true, 'D6 마지막 기록 삭제');
  eq(load().measurements.length, 1, 'D7 하나가 지워졌다');
  eq(getAdapt(load()).focus, 'flex',
     "D8 ★지운 뒤 focus가 다시 판정된다 — 없는 기록이 루틴을 계속 바꾸지 않는다");

  // 전부 지우면 판정할 근거가 없다 → focus 없음
  eq(deleteMeasurement(0), true, 'D9 남은 하나도 삭제');
  eq(getAdapt(load()).focus, null, 'D10 기록이 없으면 focus도 비워진다');
}

// ── C: 전체 삭제 ─────────────────────────────────────────
{
  reset();
  const s = load();
  s.streakDays = 12;
  s.measurements = [makeMeasurement({ at: ago(1), flex: 30, ext: 30 })];
  save(s);
  localStorage.setItem('wg_theme', 'dark');          // 취향(theme.js) — 기록이 아니다

  eq(clearAllData(), true, 'C1 삭제 성공');
  eq(localStorage.getItem(STORAGE_KEYS.ROOT), null, 'C2 ROOT 키가 사라졌다');
  eq(localStorage.getItem('wg_theme'), 'dark',
     'C3 테마는 남는다 — "기록 전체 삭제"는 기록만 지운다');
  eq(load().measurements.length, 0, 'C4 삭제 후 load()는 빈 기본 상태');
  eq(load().streakDays, 0, 'C5 스트릭도 초기값으로');
}

// ── R: 왕복 — 내보내고 지우고 되돌리면 원래대로 ──────────
{
  reset();
  const s = load();
  s.streakDays = 5;
  s.measurements = [
    makeMeasurement({ at: ago(5), hand: 'left', flex: 33, ext: 29, radialDev: 14, ulnarDev: 16 }),
  ];
  save(s);
  const backup = JSON.stringify(exportData());

  clearAllData();
  eq(load().measurements.length, 0, 'R1 삭제 후 비어 있다');

  const back = importData(backup);
  ok(back !== null, 'R2 백업으로 되돌린다');
  eq(load().streakDays, 5, 'R3 스트릭 복원');
  eq(load().measurements.length, 1, 'R4 체크 기록 복원');
  eq(load().measurements[0].radialDev, 14, 'R5 편위 필드까지 그대로');
  ok(load().measurements[0].rom === 33 + 29, 'R6 파생 필드도 보존(rom = flex+ext)');
}

console.log(`\n데이터 관리(내보내기·불러오기·삭제) 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
