// ═══════════════════════════════════════════════════════════
// reminder.js — 손목 리마인더 알림 (Notification API)
//
// 원칙:
//   · 고정 기본 시간 없음 — 사용자가 온보딩/설정에서 직접 고른다.
//     (건너뛰면 13:00 하나로 조용히 시작 — 권한 요청 없이)
//   · 권한은 사용자가 "알림 받기"를 눌렀을 때 한 번만 요청.
//     거부하면 조용히 비활성 — 재요청으로 조르지 않는다.
//   · 하루 알림 상한 3회 (times 배열이 3개를 절대 넘지 않음).
//   · 오늘 루틴을 이미 완주했으면 남은 알림은 조용히 스킵.
//
// ⚠ 한계: setInterval 기반이라 **탭이 켜져 있을 때만** 동작한다.
//   탭을 닫으면 알림이 울리지 않음 — 백그라운드 푸시는 향후
//   PWA(Service Worker + Push) 과제로 남긴다.
// ═══════════════════════════════════════════════════════════
import { load, save, todayStr } from './store.js';
import { getTodayRoutine, isRoutineComplete } from './routine.js';

export const REMINDER_MAX = 3;                    // 하루 상한 — 절대 초과 금지
export const REMINDER_MSG = '손목 쉬어갈 시간이에요 🌱';
export const REMINDER_PRESETS = [
  { emoji: '☀️', label: '오전 업무 중', time: '10:30' },
  { emoji: '🍽️', label: '점심 직후', time: '13:00' },
  { emoji: '💻', label: '오후 집중 후', time: '16:00' },
  { emoji: '🌙', label: '하루 마무리', time: '21:00' },
];

/** 리마인더 설정 조회 — null이면 온보딩 전 */
export function getReminder(state = load()) {
  return state.reminder;
}

/** 설정 저장 (부분 갱신). times는 중복 제거·정렬·상한 3개 강제 */
export function saveReminder(patch, state = load()) {
  const cur = state.reminder || { times: [], enabled: false, firedAt: null };
  state.reminder = { ...cur, ...patch };
  state.reminder.times = [...new Set(state.reminder.times)].sort().slice(0, REMINDER_MAX);
  save(state);
  return state.reminder;
}

/** 알림 권한 — 최초 1회만 실제 프롬프트. denied면 다시 묻지 않음 */
export async function requestPermission() {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

/** 켜져 있는데 브라우저 권한이 막혀 알림이 못 가는 상태인지 (설정 화면 안내용) */
export function isBlocked(r = getReminder()) {
  return !!r && r.enabled && typeof Notification !== 'undefined'
    && Notification.permission === 'denied';
}

// ─── 발송 루프 (탭이 켜져 있는 동안 20초마다 시각 확인) ───
let timer = null;

export function startReminderLoop() {
  clearInterval(timer);
  timer = setInterval(checkNow, 20000);
}

function checkNow() {
  const state = load();
  const r = state.reminder;
  if (!r || !r.enabled || !r.times.length) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (!r.times.includes(hhmm)) return;

  // 같은 시각 중복 발송 방지 (하루 단위 기록)
  const date = todayStr();
  const fired = (r.firedAt && r.firedAt.date === date) ? r.firedAt.times : [];
  if (fired.includes(hhmm)) return;
  saveReminder({ firedAt: { date, times: [...fired, hhmm] } }, state);

  // 오늘 루틴을 이미 완주했으면 조용히 스킵
  if (isRoutineComplete(getTodayRoutine(state))) return;

  const n = new Notification(REMINDER_MSG, {
    body: '오늘의 루틴, 2~3분이면 충분해요.',
    tag: 'wrist-garden-reminder',
  });
  // 클릭 → 홈 건너뛰고 바로 오늘의 루틴 시작
  n.onclick = () => {
    window.focus();
    location.href = '?routine=today';
    n.close();
  };
}
