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
    lastVisit: null,      // ISO 날짜
    measurements: [],     // ROM 측정 기록 (2단계 이후)
    guideDone: [],        // 완료한 가이드 기록 (가이드 모듈 이후)
    // 오늘의 루틴 캐시 — 반드시 null 유지(부분 객체 금지: load()의 얕은
    // 머지가 내부 키를 보호하지 못함). 생성·갱신은 routine.js가 담당.
    routine: null,
  };
}

// ═══════════════════════════════════════════════════════════
// 스트릭(연속 달성) — 활동일 기준 계산
// 정책: 하루에 한 번이라도 활동(가이드 완료·측정 저장)하면 그 날은 "달성".
//   · 같은 날 반복 활동 → 스트릭 변화 없음
//   · 어제 이어서 오늘 활동 → +1
//   · 이틀 이상 비면 → 1부터 다시 시작
// 표시(currentStreak)는 마지막 활동이 오늘/어제면 살아있고, 그보다 과거면 끊김(0).
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
  } else {
    state.streakDays = 1; // 이틀 이상 공백 → 리셋
  }
  state.lastActiveDate = date;
  save(state);
  return state;
}

/** 표시용 현재 스트릭: 마지막 활동이 오늘/어제면 살아있음, 그보다 과거면 0(끊김) */
export function currentStreak(state = load(), date = todayStr()) {
  if (!state.lastActiveDate || !state.streakDays) return 0;
  const diff = dayDiff(state.lastActiveDate, date);
  if (Number.isNaN(diff)) return 0;
  return diff <= 1 ? state.streakDays : 0;
}
