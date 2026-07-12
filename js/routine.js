// ═══════════════════════════════════════════════════════════
// routine.js — 오늘의 루틴 구성·진행 (습관 형성 장치)
//
// 구성 규칙: 카테고리 3종(mobility→glide→hold)에서 각 1개.
//   같은 카테고리 안에서는 "가장 오래 안 한 운동" 우선, 동률이면
//   날짜 시드로 교대 → 매일 결정론적으로 6종이 이틀 주기 순환.
//
// 관대한 판정: 같은 카테고리 운동이면 어떤 것이든 슬롯 충족.
//   스트릭은 운동 1개만 해도 유지(recordActivity, 기존 동작) —
//   3슬롯 완주는 "추가 축하"일 뿐 스트릭의 조건이 아니다.
//
// ⚠ 규제 원칙(웰니스 판단기준): measurements(측정값)는 루틴 구성
//   분기의 입력으로 사용하지 않는다. 측정→운동 연결은 "제안" 문구
//   까지만 — 판정+처방 구조 금지. 루틴 구성 입력은 guideDone 이력뿐.
//
// 확장 지점: ids 원소는 현재 가이드 id 문자열. 향후 게임 슬롯이
//   필요하면 { type:'game', id } 원소 도입으로 확장.
// ═══════════════════════════════════════════════════════════
import { load, save, todayStr } from './store.js';
import { ROUTINE } from './config.js';
import { GUIDES, getGuide } from './guide/guideData.js';

const catOf = (id) => getGuide(id)?.cat || null;

/** YYYY-MM-DD 문자열 해시 → 동률 타이브레이크용 결정론적 시드 */
function hashDate(date) {
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0;
  return Math.abs(h);
}

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

/** 오늘의 루틴 취득 — 같은 날엔 캐시, 날이 바뀌면 새로 구성 */
export function getTodayRoutine(state = load(), date = todayStr()) {
  const r = state.routine;
  // 캐시 유효성: 같은 날 + 모든 id가 여전히 존재하는 가이드 (id 변경·삭제 대비)
  if (r && r.date === date && Array.isArray(r.ids) && r.ids.every((id) => getGuide(id))) return r;

  // 카테고리별 "가장 오래 안 한 운동" 스캔 (입력은 guideDone 이력뿐 — 측정값 미사용)
  const lastDoneAt = {};
  for (const d of state.guideDone || []) {
    if (!lastDoneAt[d.id] || d.at > lastDoneAt[d.id]) lastDoneAt[d.id] = d.at;
  }
  const seed = hashDate(date);
  const ids = ROUTINE.order.map((cat, k) => {
    const cands = GUIDES.filter((g) => g.cat === cat);
    cands.sort((a, b) => {
      const la = lastDoneAt[a.id] || '', lb = lastDoneAt[b.id] || '';
      if (la !== lb) return la < lb ? -1 : 1;            // 오래 안 한(기록 없는) 것 우선
      return (seed + k) % 2 === 0 ? -1 : 1;              // 동률 → 날짜 시드로 교대
    });
    return cands[0].id;
  });

  state.routine = {
    v: 1, date, ids, doneIds: [],
    suggestMeasure: needMeasureSuggest(state, date),
    completedAt: null,
  };
  save(state);
  return state.routine;
}

/** 슬롯 i 충족 여부 — 같은 카테고리 운동이면 인정 (관대한 판정) */
export function isSlotDone(r, i) {
  const cat = catOf(r.ids[i]);
  return r.doneIds.some((id) => catOf(id) === cat);
}

export function routineProgress(r) {
  const done = r.ids.reduce((n, _, i) => n + (isSlotDone(r, i) ? 1 : 0), 0);
  return { done, total: r.ids.length };
}

export function isRoutineComplete(r) {
  return r.ids.every((_, i) => isSlotDone(r, i));
}

/** 다음에 할 운동 id — 미충족 슬롯의 제안 운동. 완주면 null */
export function nextRoutineExercise(r) {
  const i = r.ids.findIndex((_, k) => !isSlotDone(r, k));
  return i >= 0 ? r.ids[i] : null;
}

/** 운동 완료 반영 → 갱신된 오늘 루틴 반환 (자정 넘김 안전: 항상 오늘 기준 재취득) */
export function markRoutineDone(guideId, state = load()) {
  const r = getTodayRoutine(state);
  if (!r.doneIds.includes(guideId)) r.doneIds.push(guideId);
  if (isRoutineComplete(r) && !r.completedAt) r.completedAt = new Date().toISOString();
  save(state);
  return r;
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
