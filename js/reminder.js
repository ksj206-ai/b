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
// ⚠ 한계: 페이지 안의 타이머라 **탭이 열려 있을 때만** 동작한다. 탭을 닫으면 안 울린다 —
//   닫힌 뒤에도 보내려면 Service Worker + Web Push가 필요하고, 그건 푸시 구독을 보관할
//   서버를 뜻한다(이 앱은 서버가 없다). 별도 과제로 남긴다.
//
// ★ 그런데 "열려 있으면 온다"도 원래는 거짓이었다. 브라우저는 백그라운드 탭의 타이머를
//   1분에 1회로 조이고(오래 숨어 있으면 아예 얼린다), 옛 판정은 지금이 정확히 21:00인지를
//   물었다. 틱이 20:59:59 → 21:01:00으로 건너뛰면 21:00이라는 분 자체를 못 보고 지나간다.
//   그래서 판정을 "정각과 같은가"에서 **"지났는데 아직 안 보냈는가"**로 바꿨다(dueTimes).
// ═══════════════════════════════════════════════════════════
import { load, save, todayStr } from './store.js';
import { getTodayRoutine, isRoutineComplete } from './routine.js';

export const REMINDER_MAX = 3;                    // 하루 상한 — 절대 초과 금지
export const REMINDER_MSG = '손목 쉬어갈 시간이에요 ⭐';
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

// 놓침 보정 창(분) — 이만큼 안에 지난 알림만 뒤늦게 보낸다.
// 30분인 이유가 둘이다:
//   · 스로틀링으로 놓치는 폭은 1분 안쪽이라 30분이면 넉넉히 덮는다. 탭을 잠깐 닫았다
//     연 경우까지 살리려는 것이고, 두 시간 지난 "쉬어갈 시간이에요"는 근거가 없다.
//   · 프리셋 간격이 가장 좁은 곳이 2시간 30분(10:30→13:00)이라, 이 창으로는 두 알림이
//     겹쳐 밀리지 않는다.
export const CATCHUP_MIN = 30;

/**
 * 지금 보내야 할 시각들 — 판정은 이 함수 하나가 쥔다(시계를 안 읽어서 테스트가 날짜를 박는다).
 * 조건: ① 오늘 아직 안 보냄 ② 이미 지남 ③ 지난 지 CATCHUP_MIN 이내.
 * 시각 문자열이 깨져 있으면(NaN) 아무 조건도 통과하지 못한다 — 안 보내는 쪽이 안전하다.
 * @returns {string[]} 보낼 시각(HH:MM). 빈 배열이면 보낼 것 없음.
 */
export function dueTimes(r, now = new Date(), date = todayStr()) {
  if (!r || !r.enabled || !r.times || !r.times.length) return [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // firedAt은 하루치만 의미가 있다 — 날짜가 다르면 어제 기록이라 오늘은 아무것도 안 보낸 것.
  const fired = (r.firedAt && r.firedAt.date === date) ? r.firedAt.times : [];
  return r.times.filter((t) => {
    if (fired.includes(t)) return false;
    const [h, m] = String(t).split(':').map(Number);
    const late = nowMin - (h * 60 + m);
    return late >= 0 && late <= CATCHUP_MIN;
  });
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
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const date = todayStr();
  const due = dueTimes(r, new Date(), date);
  if (!due.length) return;

  // 밀린 시각이 둘이어도 알림은 하나만 띄우고 전부 "보냄"으로 적는다. 같은 tag라 어차피
  // 트레이에서 하나로 합쳐지고, 밀린 만큼 연달아 울리는 건 도배다. 적어 두지 않으면
  // 남은 하나가 20초 뒤에 다시 뜬다.
  const fired = (r.firedAt && r.firedAt.date === date) ? r.firedAt.times : [];
  saveReminder({ firedAt: { date, times: [...fired, ...due] } }, state);

  // 오늘 루틴을 이미 완주했으면 조용히 스킵 (위에서 이미 "보냄"으로 적었으므로 다시 안 뜬다)
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
