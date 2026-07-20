// ═══════════════════════════════════════════════════════════
// store.js — localStorage 저장/조회 (영상 미저장, 좌표·수치만)
// 하나의 루트 키(wristGarden) 아래 JSON 트리로 보관.
// ═══════════════════════════════════════════════════════════
import { STORAGE_KEYS } from './config.js';
import { CONSTELLATIONS, getConstellation, constellationsBySeason } from './constellations.js';

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
    schemaVersion: 1,     // 저장 구조 버전 — 구조가 바뀌면 올리고 load()에서 마이그레이션
    streakDays: 0,        // 연속 달성일 (마지막 활동일 기준으로 누적)
    lastActiveDate: null, // 마지막으로 활동(가이드 완료·측정)한 날 (YYYY-MM-DD, 로컬)
    lastFreezeAt: null,   // 스트릭 프리즈로 건너뛴 공백일 (YYYY-MM-DD) — 주 1회 자동
    lastVisit: null,      // ISO 날짜
    measurements: [],     // ROM 측정 기록 — v1: { v, at, hand: 'left'|'right'|null, flex, ext, rom }
    lastMeasureHand: null, // 마지막으로 측정한 손 — 측정 화면의 기본 선택값
    guideDone: [],        // 완료한 가이드 기록 (가이드 모듈 이후)
    // 오늘의 루틴 캐시 — 반드시 null 유지(부분 객체 금지: load()의 얕은
    // 머지가 내부 키를 보호하지 못함). 생성·갱신은 routine.js가 담당.
    routine: null,
    routineLog: [],       // 데일리 루틴 진행 기록 — 하루 1엔트리 { at, done, total }
    conditions: [],       // 손목 컨디션 기록 — 하루 1엔트리 { at, condition: good|soso|stiff }
    // 리마인더 설정 — null이면 온보딩 전. 생성·갱신은 reminder.js가 담당
    // (부분 객체 기본값 금지 — routine과 같은 얕은 머지 함정)
    reminder: null,
    // 우주(별자리) 상태 — null이면 아직 배정 전. routine/reminder와 같은 이유로
    // null 기본값(얕은 머지 함정 회피). 구조 생성·갱신은 아래 sky 헬퍼가 담당.
    sky: null,
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

// ═══════════════════════════════════════════════════════════
// 우주(별자리) 상태 — 오늘의 별자리 / 켠 별 / 완성 누적
// 데이터·판정 로직만 제공한다. 화면 렌더와 실제 호출부는 다음 단계에서 붙인다.
// sky 구조:
//   { today: { constellationId, litStars:[], complete, date, plan:[6] } | null,
//     constellations: [{ id, name, date, starCount }] }
// (today는 배정 전 null. plan/date는 렌더·재배정 판정에 필요해 추가한 필드.)
// ═══════════════════════════════════════════════════════════

/** 계절 판정 (로컬 월 기준): 3~5 봄 / 6~8 여름 / 9~11 가을 / 12~2 겨울 */
export function seasonOf(date = todayStr()) {
  const m = Number(String(date).split('-')[1]);
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'fall';
  return 'winter';
}

/** sky 기본 구조 (null 기본값에서 필요 시 생성) */
function defaultSky() {
  return { today: null, constellations: [] };
}

/** 현재 sky 반환 (없으면 기본 구조 — 저장은 하지 않음) */
export function getSky(state = load()) {
  return state.sky || defaultSky();
}

/** 날짜 문자열 → 안정 해시 (같은 날 = 같은 별자리 배정) */
function hashDate(dateStr) {
  let h = 0;
  const s = String(dateStr);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 별 개수를 운동 slots개에 배분: 고르게 나눈 뒤 나머지를 서로 다른 칸에 랜덤 배치.
 *  반환: 길이 slots의 정수 배열(합 = starCount). 점등은 별 인덱스(그리는 순서)대로. */
export function distributeStars(starCount, slots = 6) {
  const n = Math.max(0, starCount | 0);
  const base = Math.floor(n / slots);
  const rem = n % slots;
  const plan = new Array(slots).fill(base);
  const idx = [...Array(slots).keys()];
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  for (let k = 0; k < rem; k++) plan[idx[k]]++;
  return plan;
}

/** 오늘의 별자리 배정: 계절에 맞는 별자리 중 하나(최근 완성한 것은 가능하면 회피).
 *  같은 날 재호출 시 동일 결과(멱등). force=true면 재배정.
 *  반환: 배정된 별자리 객체(없으면 null). 아직 호출부 없음 — 다음 단계에서 연결. */
export function assignTodayConstellation(state = load(), date = todayStr(), force = false) {
  const sky = getSky(state);
  if (!force && sky.today && sky.today.date === date) {
    state.sky = sky;
    return getConstellation(sky.today.constellationId);
  }
  const pool = constellationsBySeason(seasonOf(date));
  if (pool.length === 0) return null;
  const recent = new Set((sky.constellations || []).slice(-3).map((c) => c.id));
  let candidates = pool.filter((c) => !recent.has(c.id));
  if (candidates.length === 0) candidates = pool;
  const chosen = candidates[hashDate(date) % candidates.length];
  sky.today = {
    constellationId: chosen.id,
    litStars: [],
    complete: false,
    date,
    plan: distributeStars(chosen.stars.length),
  };
  state.sky = sky;
  save(state);
  return chosen;
}

/** 다음 별 count개를 켠다(그리는 순서 = 별 인덱스 순). 완성되면 today.complete=true.
 *  반환: 갱신된 state. */
export function lightStars(state = load(), count = 1) {
  const sky = getSky(state);
  if (!sky.today) return state;
  const con = getConstellation(sky.today.constellationId);
  const total = con ? con.stars.length : 0;
  const lit = new Set(sky.today.litStars);
  for (let i = 0, added = 0; i < total && added < count; i++) {
    if (!lit.has(i)) { lit.add(i); added++; }
  }
  sky.today.litStars = [...lit].sort((a, b) => a - b);
  sky.today.complete = total > 0 && sky.today.litStars.length >= total;
  state.sky = sky;
  save(state);
  return state;
}

/** 오늘의 별자리 완성 판정 (모든 별이 켜졌는가) */
export function isTodayComplete(state = load()) {
  const sky = getSky(state);
  if (!sky.today) return false;
  const con = getConstellation(sky.today.constellationId);
  return !!con && sky.today.litStars.length >= con.stars.length;
}

/** 완성한 오늘의 별자리를 누적 목록에 추가(같은 날 중복 방지). 반환: 갱신된 state. */
export function completeTodayConstellation(state = load(), date = todayStr()) {
  const sky = getSky(state);
  if (!sky.today || !isTodayComplete(state)) return state;
  const con = getConstellation(sky.today.constellationId);
  if (con) {
    sky.today.complete = true;
    const dup = (sky.constellations || []).some((c) => c.id === con.id && c.date === date);
    if (!dup) {
      sky.constellations = [
        ...(sky.constellations || []),
        { id: con.id, name: con.name, date, starCount: con.stars.length },
      ];
    }
  }
  state.sky = sky;
  save(state);
  return state;
}
