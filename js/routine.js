// ═══════════════════════════════════════════════════════════
// routine.js — 오늘의 루틴 구성·진행 (습관 형성 장치)
//
// 구성 규칙: 매일 동일한 풀코스 6종 (config ROUTINE.course, 고정 순서).
//   고민할 것이 없어야 매일 한다 — 로테이션·커스터마이징 없음.
//
// 관대한 판정: 중간에 끝내도 그날 활동으로 인정(스트릭은 운동 1개
//   완료 시점에 이미 반영). 풀코스 완주(6/6)는 ⭐ 추가 축하일 뿐이다.
//   진행은 routineLog에 "N/6"으로 하루 1엔트리 기록.
//
// ⚠ 규제 원칙(웰니스 판단기준): measurements(측정값)는 루틴 구성
//   분기의 입력으로 사용하지 않는다. 측정→운동 연결은 "제안" 문구
//   까지만 — 판정+처방 구조 금지.
//
// 확장 지점: ids 원소는 현재 가이드 id 문자열. 향후 게임 슬롯이
//   필요하면 { type:'game', id } 원소 도입으로 확장.
// ═══════════════════════════════════════════════════════════
import { load, save, todayStr } from './store.js';
import { ROUTINE } from './config.js';
import { getGuide } from './guide/guideData.js';

/** 두 YYYY-MM-DD 사이 일수 차 (b - a). 파싱 실패 시 NaN */
function dayDiff(a, b) {
  const pa = Date.parse(`${a}T00:00:00`);
  const pb = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(pa) || Number.isNaN(pb)) return NaN;
  return Math.round((pb - pa) / 86400000);
}

/** 측정 "제안" 시점: 한 번도 안 쟀거나 마지막 측정이 주기 이상 지났을 때 */
export function needMeasureSuggest(state = load(), date = todayStr()) {
  const ms = state.measurements || [];
  if (!ms.length) return true;
  const diff = dayDiff(ms[ms.length - 1].at, date);
  return Number.isNaN(diff) || diff >= ROUTINE.measureEveryDays;
}

// ─── 손목 컨디션 (피로·컨디션 언어만 — 통증 표현·판정·조언 금지) ───

/** 지정 날짜의 컨디션 기록 조회 */
export function conditionOf(state = load(), date = todayStr()) {
  return (state.conditions || []).find((c) => c.at === date) || null;
}

/** 오늘 컨디션 저장 — 하루 1엔트리 (다시 저장하면 덮어씀) */
export function recordCondition(condition, state = load(), date = todayStr()) {
  state.conditions = state.conditions || [];
  const prev = state.conditions.find((c) => c.at === date);
  if (prev) prev.condition = condition;
  else state.conditions.push({ at: date, condition });
  save(state);
  return state;
}

/** 어제 "뻐근해요"였으면 오늘은 순한 코스 — 제안일 뿐, 판정 아님 */
function isGentleDay(state, date) {
  const last = (state.conditions || [])[state.conditions.length - 1];
  return !!last && last.condition === 'stiff' && dayDiff(last.at, date) === 1;
}

/** 오늘의 코스 운동 id 목록 (존재하는 가이드만 — id 변경·삭제 대비) */
function courseIds(state, date) {
  const base = isGentleDay(state, date) ? ROUTINE.gentleCourse : ROUTINE.course;
  return base.filter((id) => getGuide(id));
}

/** 오늘의 루틴 취득 — 같은 날 + 같은 코스면 캐시, 아니면 새로 구성 */
export function getTodayRoutine(state = load(), date = todayStr()) {
  const ids = courseIds(state, date);
  const r = state.routine;
  const sameCourse = r && r.date === date && Array.isArray(r.ids)
    && r.ids.length === ids.length && r.ids.every((id, i) => id === ids[i]);
  if (sameCourse) return r;

  state.routine = {
    v: 2, date, ids,
    gentle: isGentleDay(state, date),
    // 같은 날 코스 구성이 바뀐 경우(예: 앱 업데이트) 완료 표시는 승계
    doneIds: (r && r.date === date && Array.isArray(r.doneIds))
      ? r.doneIds.filter((id) => ids.includes(id)) : [],
    suggestMeasure: needMeasureSuggest(state, date),
    completedAt: null,
  };
  save(state);
  return state.routine;
}

/** 슬롯 i 충족 여부 */
export function isSlotDone(r, i) {
  return r.doneIds.includes(r.ids[i]);
}

export function routineProgress(r) {
  const done = r.ids.reduce((n, id) => n + (r.doneIds.includes(id) ? 1 : 0), 0);
  return { done, total: r.ids.length };
}

export function isRoutineComplete(r) {
  return r.ids.every((id) => r.doneIds.includes(id));
}

/** 다음에 할 운동 id — 코스 순서상 첫 미완료. 완주면 null */
export function nextRoutineExercise(r) {
  return r.ids.find((id) => !r.doneIds.includes(id)) ?? null;
}

/** 운동 완료 반영 + 오늘 진행(N/6) 로그 업서트 (자정 넘김 안전) */
export function markRoutineDone(guideId, state = load()) {
  const r = getTodayRoutine(state);
  if (!r.doneIds.includes(guideId)) r.doneIds.push(guideId);
  if (isRoutineComplete(r) && !r.completedAt) r.completedAt = new Date().toISOString();
  upsertRoutineLog(state, r);
  save(state);
  return r;
}

/** routineLog: 하루 1엔트리 { at, done, total } — 기록 화면 "N/6 완료" 표시용 */
function upsertRoutineLog(state, r) {
  const { done, total } = routineProgress(r);
  if (done === 0) return;
  state.routineLog = state.routineLog || [];
  const entry = { at: r.date, done, total };
  const last = state.routineLog[state.routineLog.length - 1];
  if (last && last.at === r.date) state.routineLog[state.routineLog.length - 1] = entry;
  else state.routineLog.push(entry);
}

/** 가이드 1개 예상 소요(초): intro/outro dur + follow reps × 애니 1사이클 길이 */
export function estimateGuideSec(g) {
  let sec = 0;
  for (const s of g.steps) {
    if (s.type === 'follow') {
      const cycle = s.anim?.length ? s.anim[s.anim.length - 1][0] : 5;
      sec += (s.reps || 1) * cycle;
    } else {
      sec += s.dur || 3;
    }
  }
  return sec;
}

/** 루틴 전체 예상 소요(초) */
export function estimateRoutineSec(r) {
  return r.ids.reduce((sum, id) => sum + estimateGuideSec(getGuide(id) || { steps: [] }), 0);
}
