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
import { load, save, todayStr, isRedSignal, isImproving, getAdapt, saveAdapt } from './store.js';
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

/** 오늘 컨디션 저장 — 하루 1엔트리 (다시 저장하면 덮어씀).
 *  comp(세션 보상동작 비율 %)가 주어지면 함께 보관한다 — 진행/후퇴 판정(§4.3
 *  "보상동작 적음")의 대리 신호. 없으면(null) 필드를 남기지 않는다(옛 기록 호환). */
export function recordCondition(condition, state = load(), date = todayStr(), comp = null) {
  state.conditions = state.conditions || [];
  const prev = state.conditions.find((c) => c.at === date);
  if (prev) { prev.condition = condition; if (comp != null) prev.comp = comp; }
  else state.conditions.push({ at: date, condition, ...(comp != null ? { comp } : {}) });
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
// 측정 기반 맞춤 — 강도(dose) 조정 (설계 §4.2 방향 특이적 · §4.3 진행 · §4.4 후퇴)
// adapt.focus(약한 방향)의 대상 운동에 대해, focus 보정(§4.2) + doseLevel 진행(§4.3)을
// 합쳐 reps(필요 시 hold)만 조용히 조정해 재생한다. 운동 제거·교체 없이 "반복만
// 조금 더", 상한(reps=adaptReps.cap / hold=adaptDose.holdCapSec)을 절대 넘지 않는다.
// 안전 규칙: 후퇴(하강·원위치)가 상승보다 항상 우선, 조정은 focus 방향 guideId만,
// 하루 1회(멱등). reps/hold는 판정이 아니라 "몇 번/얼마나 재생" 파라미터 —
// measurement/tracking/stepEngine 판정 로직은 건드리지 않는다.
// ═══════════════════════════════════════════════════════════

// condition 순위(직전 대비 하락 판정용): good > soso > stiff. 낮을수록 나쁨.
const CONDITION_RANK = { good: 2, soso: 1, stiff: 0 };

/**
 * dose 단계·focus 보정을 base reps/hold에 분배 — 순수 계산(저장·부수효과 없음).
 * 규칙(§4.3): reps를 cap까지 먼저 소진, 그다음 hold를 올린다(한 단계 = 한 변수만).
 * 상한(repCap / holdCap)을 절대 초과하지 않으며, hold 없는(reps 기반) 운동은 hold=null 유지.
 * @returns {{ reps:number, holdSec:(number|null) }}
 */
function distributeDose({ baseReps, baseHoldSec = null, focusBonus = 0, levels = 0 }) {
  const dz = ROUTINE.adaptDose;
  const repCap = ROUTINE.adaptReps.cap;
  let reps = Math.min(baseReps + focusBonus, repCap);   // focus 보정(§4.2) 먼저, cap clamp
  let remaining = Math.max(0, levels | 0);
  // ① reps를 cap까지 소진
  const repRoom = Math.max(0, repCap - reps);
  const repLevels = Math.min(remaining, Math.floor(repRoom / dz.repStep));
  reps = Math.min(reps + repLevels * dz.repStep, repCap);
  remaining -= repLevels;
  // ② 남은 단계는 hold로 (hold 기반 운동만 — 현재 focus 대상 flex_ext는 reps 기반이라 미발동)
  let holdSec = baseHoldSec;
  if (baseHoldSec != null) holdSec = Math.min(baseHoldSec + remaining * dz.holdStepSec, dz.holdCapSec);
  return { reps, holdSec };
}

/** 지정 doseLevel에서의 reps/hold — canProgress(상한 도달) 판정과 computeDose가 공유하는 순수 계산 */
function doseAtLevel(state, guideId, level) {
  const g = getGuide(guideId);
  const step = g && g.steps.find((s) => s.type === 'follow' && s.reps != null);
  if (!step) return { reps: null, holdSec: null };
  const { focus, focusSoft } = getAdapt(state);
  const cfg = ROUTINE.adaptReps;
  const target = focus ? cfg.focusGuide[focus] : null;
  const focusBonus = target === guideId ? (focusSoft ? cfg.bonusSoft : cfg.bonus) : 0;
  const baseHoldSec = step.holdSec ?? null; // 현재 가이드엔 없음(reps 기반) — 향후 hold 운동 대비
  return distributeDose({ baseReps: step.reps, baseHoldSec, focusBonus, levels: level });
}

/**
 * 운동의 조정된 reps/hold — focus 보정(§4.2) + 저장된 doseLevel(§4.3)을 합성한 순수 계산.
 * 대상 아님·focus=null·doseLevel 0이면 기본값 그대로(안전 폴백). 상한을 절대 초과하지 않음.
 * F1: 그 날이 red(측정 급락, isRedSignal)면 focus 대상 운동을 base로 클램프해 재생한다(아래 참조).
 * @returns {{ reps:(number|null), holdSec:(number|null) }}
 */
export function computeDose(state = load(), guideId, date = todayStr()) {
  const adapt = getAdapt(state);
  const level = (adapt.doseLevel || {})[guideId] || 0;
  const dose = doseAtLevel(state, guideId, level);

  // F1(표시용 클램프): red(측정 급락) 날에는 focus 대상 운동을 base로 재생 — focus 보너스와
  // doseLevel 증가분을 '모두' 무시하고 원본 기본값(step.reps/holdSec)으로 돌려, 순한 코스의
  // "쉬어가기"와 결을 맞춘다. ★상태(doseLevel·toleratedStreak·focusSoft)는 절대 안 바꾼다
  // (computeDose는 순수 계산) — red는 지나가는 하루짜리 신호라 doseLevel을 실제로 깎으면 red가
  // 걷힌 다음날 dose가 눌린 채 남는 새 버그가 된다. 상태를 안 건드리므로 red가 걷히면(isRedSignal
  // false) 다음날 저장된 dose로 저절로 복귀하고, 진행/후퇴(decideDose)와도 충돌하지 않는다.
  // red 한정 — stiff는 이미 reset-stiff로 doseLevel 0이라 별개 사안(여기서 확장 안 함).
  const target = adapt.focus ? ROUTINE.adaptReps.focusGuide[adapt.focus] : null;
  if (target === guideId && isRedSignal(state, date)) {
    const step = getGuide(guideId)?.steps.find((s) => s.type === 'follow' && s.reps != null);
    if (step) {
      if (DEBUG_ADAPT) console.log('[adapt] red clamp → base', { guideId, from: dose.reps, base: step.reps });
      return { reps: step.reps, holdSec: step.holdSec ?? null };
    }
  }
  return dose;
}

/**
 * 재생용 가이드 — dose 조정(computeDose)을 얹은 사본을 돌려준다. 원본 GUIDES는
 * 불변으로 둔다(공유 배열 오염 방지): follow 스텝의 reps(있으면 holdSec)만 교체하고
 * anim·detect·base 등 판정·인식 파라미터는 그대로 복사한다. 조정이 없으면 원본 그대로
 * 반환(불필요한 사본 안 만듦). 루틴 모드 재생 진입점에서만 호출; 둘러보기는 기본값 그대로.
 */
export function getRoutineGuide(guideId, state = load(), date = todayStr()) {
  const g = getGuide(guideId);
  if (!g) return null;
  const dose = computeDose(state, guideId, date);
  let changed = false;
  const steps = g.steps.map((s) => {
    if (s.type !== 'follow' || s.reps == null) return s;
    const next = {};
    if (dose.reps != null && dose.reps !== s.reps) next.reps = dose.reps;
    if (dose.holdSec != null && s.holdSec != null && dose.holdSec !== s.holdSec) next.holdSec = dose.holdSec;
    if (!Object.keys(next).length) return s;
    changed = true;
    return { ...s, ...next };
  });
  if (changed && DEBUG_ADAPT) {
    console.log('[adapt] dose', { guideId, focus: getAdapt(state).focus, reps: dose.reps, holdSec: dose.holdSec });
  }
  return changed ? { ...g, steps } : g;
}

/**
 * 진행/후퇴 판정 (설계 §4.3·§4.4) — 순수 계산(저장 안 함). condition은 루틴 '후'
 * 기록이라 "최근 vs 직전" 2개 기록으로 판단한다. 조정 대상은 focus 방향 guideId만.
 * 안전 규칙(우선순위):
 *   1) stiff(자기보고 뻐근) → focus 대상 doseLevel 0으로 원위치 + streak 0 (§4.4)
 *      (순한 코스 전환은 isGentleDay가 별도로 처리)
 *   2) 직전 대비 하락(good→soso 등) → focus 대상 doseLevel 1단계 하강 + streak 0 (§4.4)
 *   3) 위 후퇴가 없고 3조건(무난 3세션 연속 · 직전대비 악화없음 · comp 낮음) 모두면
 *      focus 대상 doseLevel 1단계 상승(상한 도달 시 정지) + streak 0 (§4.3)
 *   그 외(조건 미달·focus 없음·컨디션 부족) → 유지. 상승은 reps→cap→hold 중 하나만.
 * @returns 판정 결과(대상·전후 doseLevel·streak·사유 등) — 저장은 updateDose가.
 */
export function decideDose(state = load(), date = todayStr()) {
  const adapt = getAdapt(state);
  const cfg = ROUTINE.adaptReps;
  const dz = ROUTINE.adaptDose;
  const target = adapt.focus ? cfg.focusGuide[adapt.focus] : null;
  const doseLevel = { ...(adapt.doseLevel || {}) };
  let streak = adapt.toleratedStreak || 0;

  const conds = state.conditions || [];
  const latest = conds[conds.length - 1] || null;
  const prev = conds[conds.length - 2] || null;

  const isStiff = !!latest && latest.condition === 'stiff';
  const worsened = !!latest && !!prev
    && (CONDITION_RANK[latest.condition] ?? 1) < (CONDITION_RANK[prev.condition] ?? 1);
  const comp = latest && typeof latest.comp === 'number' ? latest.comp : null;
  const compLow = comp != null && comp <= dz.compProgressMax;
  const before = target ? (doseLevel[target] || 0) : 0;

  let action;
  if (!target) {
    action = 'no-focus';                       // focus 없음 → 조정 대상 없음(안전 폴백)
  } else if (!latest) {
    action = 'no-condition';                    // 컨디션 기록 없음 → 판정 불가(유지)
  } else if (isStiff) {                          // ── 후퇴(우선): stiff → 원위치
    doseLevel[target] = 0; streak = 0; action = 'reset-stiff';
  } else if (worsened) {                         // ── 후퇴(우선): 직전 대비 하락 → 1단계 하강
    doseLevel[target] = Math.max(0, before - 1); streak = 0; action = 'down';
  } else {                                       // ── 무난 세션 → streak 누적 후 상승 판정
    streak = Math.min(streak + 1, dz.progressStreak);
    const streakOK = streak >= dz.progressStreak;
    if (!streakOK) action = 'hold-streak';            // 아직 3세션 미만 → 유지
    else if (!compLow) action = 'hold-comp';          // 보상동작 많음/미상 → 유지
    else {
      const cur = doseAtLevel(state, target, before);
      const nxt = doseAtLevel(state, target, before + 1);
      const canProgress = nxt.reps !== cur.reps || nxt.holdSec !== cur.holdSec;
      if (canProgress) { doseLevel[target] = before + 1; streak = 0; action = 'up'; } // 1단계 상승 후 리셋
      else action = 'cap';                             // 상한 도달 → 정지
    }
  }

  return {
    action, target, doseBefore: before, doseAfter: target ? (doseLevel[target] || 0) : 0,
    doseLevel, toleratedStreak: streak,
    latest: latest?.condition ?? null, prev: prev?.condition ?? null,
    worsened, isStiff, comp, compLow,
  };
}

/**
 * 진행/후퇴 반영·저장 — condition 기록 직후 1회 호출(멱등). decideDose 판정을
 * adapt.doseLevel·toleratedStreak에 반영하고 lastAdaptedAt으로 같은 날 재적용을 막는다.
 * 화면 변화 없음(조용히). 판정 근거는 DEBUG_ADAPT 로그로만 확인.
 * @returns decideDose 결과(로그·테스트용). 같은 날 재호출이면 { action:'already', skipped:true }.
 */
export function updateDose(state = load(), date = todayStr()) {
  const adapt = getAdapt(state);
  if (adapt.lastAdaptedAt === date) {
    return { action: 'already', target: adapt.focus ? ROUTINE.adaptReps.focusGuide[adapt.focus] : null, skipped: true };
  }
  const res = decideDose(state, date);
  saveAdapt(state, {
    doseLevel: res.doseLevel, toleratedStreak: res.toleratedStreak,
    lastAdaptedAt: date, lastDoseAction: res.action, // 6단계 긍정 신호가 "오늘 하강한 날" 판정에 읽음
  });
  if (DEBUG_ADAPT) {
    console.log('[adapt] dose update', {
      action: res.action, target: res.target, dose: `${res.doseBefore}→${res.doseAfter}`,
      streak: res.toleratedStreak, prev: res.prev, latest: res.latest,
      worsened: res.worsened, stiff: res.isStiff, comp: res.comp, compLow: res.compLow,
    });
  }
  return res;
}

// ═══════════════════════════════════════════════════════════
// 측정 기반 맞춤 — 개선 시 긍정 신호 (설계 §4.5 · §0 대원칙)
// 지금까지 "조용히"였다면 이건 유일하게 사용자에게 보이는 맞춤 신호 —
// 대신 개선일 때만 가끔 1회, 악화·정체엔 절대 아무것도 안 띄운다(부정 프레이밍 금지).
// ═══════════════════════════════════════════════════════════

// 긍정 문구 — 개선 표현만. "약함/부족/나빠짐/수치"는 절대 노출하지 않는다.
const IMPROVE_MESSAGE = '손목이 부드러워지고 있어요 ✨';

/**
 * 긍정 신호로 보여줄 문구(설계 §4.5) — 표시할 문구 또는 null.
 * ★호출 순서: updateDose(§4.3·§4.4)가 컨디션 기록 직후(루틴 끝) 먼저 돌아 adapt
 *   (toleratedStreak·lastDoseAction·lastAdaptedAt)를 저장해 두면, 홈 재렌더에서 이 함수가
 *   fresh load로 '갱신된' 값을 읽는다 — 순서가 영속(persist)으로 보장돼 별도 updateDose 호출이
 *   필요 없다. (홈 말풍선에서만 판정하므로 루틴 도중 강제 표시도 없음.)
 * "모두" 충족해야 1회 표시:
 *   · isImproving === true (측정 개선 + 하락 가드 통과)
 *   · toleratedStreak ≥ minToleratedStreak (견딤은 streak'만' — 하강한 날은 streak=0이라 자동 차단)
 *   · 오늘 updateDose가 down/reset-stiff가 아님 (벨트+멜빵 — 하강한 날 스킵)
 *   · lastImproveShownAt 로부터 minGapDays 이상 경과 (도배 방지)
 * 표시하기로 하면 lastImproveShownAt=오늘 저장. 오늘 이미 표시했으면 같은 문구를 그대로
 * 유지한다(재저장·깜빡임 없음). 악화·정체·간격 미달·재료 부족이면 null(아무것도 안 함).
 */
export function improveSignal(state = load(), date = todayStr()) {
  const adapt = getAdapt(state);
  const cfg = ROUTINE.adaptImprove;

  // 오늘 이미 표시함 → 같은 문구 유지(깜빡임 방지, 재저장 안 함)
  if (adapt.lastImproveShownAt === date) {
    if (DEBUG_ADAPT) console.log('[adapt] improve: shown-today');
    return IMPROVE_MESSAGE;
  }

  const streak = adapt.toleratedStreak || 0;
  const toleratedOK = streak >= cfg.minToleratedStreak;
  // 오늘 updateDose가 하강/리셋한 날이면 스킵(벨트+멜빵). lastDoseAction으로 판정.
  const retreatedToday = adapt.lastAdaptedAt === date
    && (adapt.lastDoseAction === 'down' || adapt.lastDoseAction === 'reset-stiff');
  const improving = isImproving(state, date);
  const gapDays = adapt.lastImproveShownAt ? dayDiff(adapt.lastImproveShownAt, date) : Infinity;
  const gapOK = Number.isNaN(gapDays) || gapDays >= cfg.minGapDays;
  const show = improving && toleratedOK && !retreatedToday && gapOK;

  if (DEBUG_ADAPT) {
    console.log('[adapt] improve', {
      improving, streak, toleratedOK, retreatedToday,
      lastShown: adapt.lastImproveShownAt, gapDays, gapOK, show,
    });
  }
  if (!show) return null;
  saveAdapt(state, { lastImproveShownAt: date });
  return IMPROVE_MESSAGE;
}
