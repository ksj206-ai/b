// ═══════════════════════════════════════════════════════════
// a11y.js — 화면 낭독기에게만 들리는 안내 (live region)
//
// 이 앱의 피드백은 거의 전부 textContent 조용한 갱신이다. 눈으로 보면 회수가 오르고
// 스텝이 바뀌는 게 보이지만, 낭독기에는 **아무 일도 안 일어나는 화면**이었다.
// 무엇을 읽어 줄지는 여기서만 정한다.
//
// ★ 보이는 요소에 aria-live를 직접 걸지 않는 이유
//   힌트(gpHint)와 진행 바는 카메라 프레임마다 갱신된다. 거기 aria-live를 걸면 낭독기가
//   초당 수십 번 말한다 — 접근성이 아니라 소음이고, 실제로는 아무것도 못 듣게 된다.
//   그래서 프레임이 아니라 **사건**만 고른다: 화면이 바뀔 때, 스텝이 바뀔 때, 회수가
//   오를 때, 끝났을 때, 그리고 오류.
//
// ★ 왜 전용 영역인가 — 숨겨진 요소는 안 읽힌다
//   live 영역은 내용이 바뀌는 순간 **화면에 있어야** 읽힌다. hidden이었다가 글자를 넣고
//   보여 주는 순서(이 앱의 흔한 패턴: `el.textContent = t; el.hidden = !t`)로는 낭독기가
//   변화를 놓친다. 그래서 body 맨 위에 늘 살아 있는 빈 영역을 두고 거기에만 적는다.
// ═══════════════════════════════════════════════════════════

const LIVE_ID = 'srLive';    // role="status"  — 보통 안내(하던 말이 끝나면 읽는다)
const ALERT_ID = 'srAlert';  // role="alert"   — 오류처럼 즉시 끊고 읽어야 하는 것

// 같은 문장을 연달아 적으면 낭독기는 "바뀐 게 없다"고 보고 넘긴다. 비웠다가 다음
// 틱에 채우면 같은 문장도 다시 읽는다. 이 지연이 그 틈이다(사람이 느낄 길이는 아니다).
const REFILL_MS = 60;

function region(id) {
  if (typeof document === 'undefined') return null;   // node 테스트에서는 조용히 없음
  return document.getElementById(id);
}

/**
 * 낭독기에 한 줄 읽어 준다. 화면에는 아무 변화도 없다.
 * @param {string} msg 읽을 문장. 빈 문자열이면 아무 일도 안 한다.
 * @param {{assertive?: boolean}} opt assertive면 하던 말을 끊는다 — 오류에만 쓴다.
 * @returns {boolean} 실제로 적었는지 (영역이 없으면 false)
 */
export function announce(msg, { assertive = false } = {}) {
  const el = region(assertive ? ALERT_ID : LIVE_ID);
  if (!el || !msg) return false;
  clearTimeout(el._srTimer);          // 영역마다 따로 — 오류가 일반 안내를 지우면 안 된다
  el.textContent = '';
  el._srTimer = setTimeout(() => { el.textContent = msg; }, REFILL_MS);
  return true;
}

/** 오류 — 하던 말을 끊고 읽는다. announce(msg, {assertive:true})의 이름 있는 판. */
export function announceError(msg) {
  return announce(msg, { assertive: true });
}

// ─── 문장 만들기 (순수 — DOM을 안 만진다, 그래서 테스트가 있다) ───

// 탭 라벨에서 이모지만 뺀 것. config.SCREENS의 모든 값이 여기 있어야 한다 —
// 화면을 늘리고 라벨을 빠뜨리면 그 화면만 조용해진다(a11y.test.mjs가 잡는다).
export const SCREEN_LABEL = {
  home: '홈',
  guide: '오늘의 루틴',
  measure: '손목 체크',
  records: '기록',
  sky: '밤하늘 도감',
  game: '게임',
};

/** 화면 전환 안내 — "기록 화면". 모르는 이름이면 빈 문자열(조용히 넘어간다). */
export function screenMessage(name) {
  const label = SCREEN_LABEL[name];
  return label ? `${label} 화면` : '';
}

/**
 * 스텝 전환 안내 — "2/3단계. 손목을 천천히 굽혔다 펴세요"
 * 스텝이 하나뿐인 운동에서는 "1/1단계"가 군더더기라 자리 표시를 뺀다.
 */
export function stepMessage(text, i, total) {
  const where = total > 1 ? `${i + 1}/${total}단계. ` : '';
  return `${where}${text || ''}`.trim();
}

/**
 * 회수 안내 — "3/5회", 마지막에는 "5/5회, 다 했어요".
 * 0회(스텝 진입 시 초기화)는 읽지 않는다 — 아직 아무 일도 일어나지 않았다.
 */
export function countMessage(count, reps) {
  if (!reps || !count || count < 0) return '';
  return count >= reps ? `${count}/${reps}회, 다 했어요` : `${count}/${reps}회`;
}
