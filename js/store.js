// ═══════════════════════════════════════════════════════════
// store.js — localStorage 저장/조회 (영상 미저장, 좌표·수치만)
// 하나의 루트 키(wristGarden) 아래 JSON 트리로 보관.
// ═══════════════════════════════════════════════════════════
import { STORAGE_KEYS } from './config.js';

const ROOT = STORAGE_KEYS.ROOT;

/** 전체 상태 로드 (없으면 기본 구조) */
export function load() {
  try {
    const raw = localStorage.getItem(ROOT);
    if (!raw) return defaults();
    return { ...defaults(), ...JSON.parse(raw) };
  } catch (e) {
    console.warn('[store] 로드 실패, 기본값 사용', e);
    return defaults();
  }
}

/** 전체 상태 저장 */
export function save(state) {
  try {
    localStorage.setItem(ROOT, JSON.stringify(state));
  } catch (e) {
    console.warn('[store] 저장 실패', e);
  }
}

/** 부분 갱신 후 저장 */
export function update(patch) {
  const next = { ...load(), ...patch };
  save(next);
  return next;
}

function defaults() {
  return {
    streakDays: 0,        // 연속 달성일 (마지막 활동일 기준으로 누적)
    lastActiveDate: null, // 마지막으로 활동(가이드 완료·측정)한 날 (YYYY-MM-DD, 로컬)
    lastFreezeAt: null,   // 스트릭 프리즈로 건너뛴 공백일 (YYYY-MM-DD) — 주 1회 자동
    lastVisit: null,      // ISO 날짜
    measurements: [],     // ROM 측정 기록 (2단계 이후)
    guideDone: [],        // 완료한 가이드 기록 (가이드 모듈 이후)
    // 오늘의 루틴 캐시 — 반드시 null 유지(부분 객체 금지: load()의 얕은
    // 머지가 내부 키를 보호하지 못함). 생성·갱신은 routine.js가 담당.
    routine: null,
    routineLog: [],       // 데일리 루틴 진행 기록 — 하루 1엔트리 { at, done, total }
    conditions: [],       // 손목 컨디션 기록 — 하루 1엔트리 { at, condition: good|soso|stiff }
    // 리마인더 설정 — null이면 온보딩 전. 생성·갱신은 reminder.js가 담당
    // (부분 객체 기본값 금지 — routine과 같은 얕은 머지 함정)
    reminder: null,
  };
}

// ═══════════════════════════════════════════════════════════
// 스트릭(연속 달성) — 활동일 기준 계산
// 정책: 하루에 한 번이라도 활동(가이드 완료·측정 저장)하면 그 날은 "달성".
//   · 같은 날 반복 활동 → 스트릭 변화 없음
//   · 어제 이어서 오늘 활동 → +1
//   · 하루 공백 → 그 주(월~일)에 프리즈 미사용이면 자동 프리즈로 유지 🧊
//   · 같은 주 두 번째 공백부터, 또는 이틀 이상 공백 → 1부터 다시 시작
// 표시(currentStreak)는 마지막 활동이 오늘/어제면 살아있고,
// 그저께여도 어제 공백을 프리즈가 덮을 수 있으면 살아있는 것으로 본다.
// ═══════════════════════════════════════════════════════════

/** 로컬 기준 오늘 날짜 (YYYY-MM-DD) */
export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 두 YYYY-MM-DD 사이 일수 차 (b - a). 파싱 실패 시 NaN */
function dayDiff(a, b) {
  const pa = Date.parse(`${a}T00:00:00`);
  const pb = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return NaN;
  return Math.round((pb - pa) / 86400000);
}

/** YYYY-MM-DD에 n일 더한 날짜 문자열 */
function addDays(dateStr, n) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return todayStr(dt);
}

/** 그 날짜가 속한 주의 월요일 (주 단위 프리즈 판정 기준) */
function weekStart(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // 월=0 … 일=6
  return todayStr(dt);
}

/** 공백일(missedDay)이 속한 주에 프리즈를 아직 안 썼는가 */
function freezeAvailable(state, missedDay) {
  const ws = weekStart(missedDay);
  return !!ws && (!state.lastFreezeAt || weekStart(state.lastFreezeAt) !== ws);
}

/** 이번 주에 프리즈를 사용했는가 (기록 화면 "🧊 이번 주 프리즈 사용됨" 표시용) */
export function freezeUsedThisWeek(state = load(), date = todayStr()) {
  return !!state.lastFreezeAt && weekStart(state.lastFreezeAt) === weekStart(date);
}

/** 활동 발생 → 스트릭 갱신 후 저장. 반환: 갱신된 state */
export function recordActivity(state = load(), date = todayStr()) {
  const last = state.lastActiveDate;
  const diff = last ? dayDiff(last, date) : null;
  if (!last || Number.isNaN(diff)) {
    state.streakDays = 1;
  } else if (diff <= 0) {
    // 같은 날(또는 시계 되돌림) → 유지
  } else if (diff === 1) {
    state.streakDays = (state.streakDays || 0) + 1;
  } else if (diff === 2 && freezeAvailable(state, addDays(last, 1))) {
    // 하루 공백 — 주 1회 자동 프리즈로 스트릭 유지 🧊
    state.lastFreezeAt = addDays(last, 1);
    state.streakDays = (state.streakDays || 0) + 1;
  } else {
    state.streakDays = 1; // 같은 주 두 번째 공백, 또는 이틀 이상 공백 → 리셋
  }
  state.lastActiveDate = date;
  save(state);
  return state;
}

/** 표시용 현재 스트릭: 오늘/어제 활동이면 살아있음.
 *  그저께 활동(어제 공백)이어도 프리즈가 남아 있으면 살아있는 것으로 표시 */
export function currentStreak(state = load(), date = todayStr()) {
  if (!state.lastActiveDate || !state.streakDays) return 0;
  const diff = dayDiff(state.lastActiveDate, date);
  if (Number.isNaN(diff)) return 0;
  if (diff <= 1) return state.streakDays;
  if (diff === 2 && freezeAvailable(state, addDays(state.lastActiveDate, 1))) return state.streakDays;
  return 0;
}
