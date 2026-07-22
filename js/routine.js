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
// ⚠ 규제 원칙(웰니스 판단기준): 측정값은 "더 순하게(안전)" 방향으로만
//   루틴에 반영한다 — 측정이 크게 나빠지면(red 신호) 순한 코스로 쉬어가기(§4.4).
//   반대로 측정으로 "더 세게" 처방하거나 부족/이상을 진단·라벨링하지 않으며,
//   사용자에게 "약함/나빠짐"을 노출하지 않는다(조용히).
//
// 확장 지점: ids 원소는 현재 가이드 id 문자열. 향후 게임 슬롯이
//   필요하면 { type:'game', id } 원소 도입으로 확장.
// ═══════════════════════════════════════════════════════════
import { load, save, todayStr, isRedSignal, getAdapt } from './store.js';
import { ROUTINE, DEBUG_ADAPT } from './config.js';
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

/** 오늘 순한 코스로 갈지 — 제안일 뿐, 판정 아님. 두 안전 신호 중 하나면 발동:
 *   1) 어제 컨디션이 'stiff' (기존)
 *   2) 최근 측정이 직전 대비 크게 나빠짐 (red 신호, store.isRedSignal — 신규 §4.4)
 *  둘 다 "더 순하게" 방향이라 안전. 사용자에겐 순한 코스만 보일 뿐(조용히). */
function isGentleDay(state, date) {
  const last = (state.conditions || [])[state.conditions.length - 1];
  const stiffYesterday = !!last && last.condition === 'stiff' && dayDiff(last.at, date) === 1;
  return stiffYesterday || isRedSignal(state, date);
}

/** 순한 코스가 발동한 "이유" — 문구 분기 전용. isGentleDay와 같은 신호를 읽되
 *  bool 대신 사유를 돌려준다(판정 로직 자체는 건드리지 않음).
 *   · 'stiff': 사용자가 직접 고른 컨디션(자기보고) → 공감 문구 OK
 *   · 'red'  : 앱이 측정 추이로 조용히 추론한 신호(store.isRedSignal) → 중립 문구
 *   · null   : 순한 코스 아님
 *  둘 다면 'stiff' 우선(자기보고가 red 추론보다 구체적이라). */
export function gentleReason(state = load(), date = todayStr()) {
  const last = (state.conditions || [])[state.conditions.length - 1];
  const stiffYesterday = !!last && last.condition === 'stiff' && dayDiff(last.at, date) === 1;
  if (stiffYesterday) return 'stiff';
  if (isRedSignal(state, date)) return 'red';
  return null;
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

// ═══════════════════════════════════════════════════════════
// 측정 기반 맞춤 — 방향 특이적 reps 조정 (설계 §4.2·§4.3)
// adapt.focus(약한 방향)에 해당하는 운동의 reps만 소폭↑해 재생한다.
// 운동을 빼거나 바꾸지 않고 "반복만 조금 더"라 안전 방향. 조정 후에도 상한
// (ROUTINE.adaptReps.cap)을 절대 넘지 않으며, focus=null이면 손대지 않는다.
// 순수 계산 + 재생용 가이드 사본 생성만 — 저장·판정·인식은 건드리지 않는다.
// (reps는 판정이 아니라 "몇 번 재생할지" 파라미터다 — stepEngine 판정 로직 불변.)
// ═══════════════════════════════════════════════════════════

/**
 * 방향 특이적 조정 reps — focus(약한 방향)의 대상 운동이면 기본 reps를 소폭↑.
 * 저장·부수효과 없는 순수 계산. 대상이 아니거나 focus=null이면 기본 reps 그대로.
 *   · focusSoft(둘 다 40°↑ 참고 코칭 등, §4.1)면 증가폭을 더 작게
 *   · 조정 후에도 cap(§4.3 자동 상승 상한) 초과 금지. 기본 reps가 이미 cap 이상이면
 *     올리지도 내리지도 않는다(절대 base 아래로 내려가지 않음)
 * @returns {number} 재생할 reps
 */
export function computeReps(guideId, baseReps, state = load()) {
  const { focus, focusSoft } = getAdapt(state);
  const cfg = ROUTINE.adaptReps;
  const target = focus ? cfg.focusGuide[focus] : null; // focus 방향이 조정할 운동
  if (target !== guideId) return baseReps;             // 대상 아님/focus=null → 그대로(안전 폴백)
  if (baseReps >= cfg.cap) return baseReps;            // 이미 상한 이상 → 그대로(내리지 않음)
  const bonus = focusSoft ? cfg.bonusSoft : cfg.bonus;
  return Math.min(baseReps + bonus, cfg.cap);          // 소폭↑ 후 상한 clamp
}

/**
 * 재생용 가이드 — 방향 특이적 reps 조정(computeReps)을 얹은 사본을 돌려준다.
 * 원본 GUIDES는 불변으로 둔다(공유 배열 오염 방지): follow 스텝의 reps만 교체한
 * 얕은 사본을 만들고, anim·detect·base 등 판정·인식 파라미터는 그대로 복사한다.
 * 조정이 없으면(대상 아님·focus=null·상한) 원본을 그대로 반환 — 불필요한 사본 안 만듦.
 * (루틴 모드 재생 진입점에서만 호출; 둘러보기는 기본 reps 그대로.)
 */
export function getRoutineGuide(guideId, state = load()) {
  const g = getGuide(guideId);
  if (!g) return null;
  let changed = false;
  const steps = g.steps.map((s) => {
    if (s.type !== 'follow' || s.reps == null) return s;
    const reps = computeReps(guideId, s.reps, state);
    if (reps === s.reps) return s;
    if (DEBUG_ADAPT) {
      console.log('[adapt] reps', { guideId, focus: getAdapt(state).focus, base: s.reps, adjusted: reps });
    }
    changed = true;
    return { ...s, reps };
  });
  return changed ? { ...g, steps } : g;
}
