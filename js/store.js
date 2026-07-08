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
    streakDays: 0,     // 연속 달성일
    lastVisit: null,   // ISO 날짜
    measurements: [],  // ROM 측정 기록 (2단계 이후)
    guideDone: [],     // 완료한 가이드 기록 (가이드 모듈 이후)
  };
}
