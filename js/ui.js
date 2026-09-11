// ═══════════════════════════════════════════════════════════
// ui.js — 화면 전환 (라우터)
// [data-nav="<screen>"] 클릭 → 해당 화면 표시. [data-back] 클릭 → 직전 화면.
// 각 화면은 <section class="screen" data-screen="<name>">.
//
// 뒤로가기는 브라우저 History '하나'만 단일 소스로 쓴다(자체 히스토리 스택 없음).
// history state는 {screen, view} 한 쌍 — view는 화면 위에 얹힌 서브뷰(가이드 플레이어)라
// 뒤로 한 번이면 원래 뷰로 돌아온다. 화면 안에서 뭘 그릴지는 리스너(main.js)가 정한다.
// 그래서 진입점을 셋으로 나눈다 — 이 분리가 popstate↔push 루프를 구조적으로 막아서 억제
// 플래그가 필요 없다:
//   navigate(name, v) = pushState + 화면 전환      ← 사용자 이동(클릭·딥스타트)만 부른다
//   pushView(view)    = pushState만(전환 없음)      ← 서브뷰 진입(호출자가 이미 그렸다)
//   replaceView(view) = 지금 엔트리의 서브뷰만 바꿈 ← 플레이어를 목록으로 접을 때
//   applyScreen(n, v) = 화면 전환만(push 일절 없음) ← popstate·초기 표시가 부른다
//
// ★홈은 루트다. 홈으로 가는 이동은 새 칸을 쌓지 않고 맨 처음 엔트리로 되돌아간다(depth).
//   전에는 홈을 위에 또 쌓아서, [홈으로]·운동 중 홈 탭·[오늘은 여기까지] 뒤에 기기 뒤로를
//   한 번 누르면 바로 아래의 플레이어 엔트리가 되살아나 방금 운동이 처음부터 돌고 카메라가
//   켜졌다. 이제 홈에서 뒤로는 여느 앱의 첫 화면처럼 앱을 떠난다.
// ═══════════════════════════════════════════════════════════
import { DEFAULT_SCREEN } from './config.js';

let currentScreen = null;
let currentView = null;
const listeners = new Set();

/** 화면 전환 콜백 등록: (screenName, view) => void */
export function onScreenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 화면 전환만 — history는 건드리지 않는다 (popstate 복원 경로) */
export function applyScreen(name, view = null) {
  const screens = document.querySelectorAll('.screen');
  let matched = false;
  screens.forEach((el) => {
    const active = el.dataset.screen === name;
    el.classList.toggle('is-active', active);
    if (active) matched = true;
  });
  if (!matched) {
    console.warn(`[ui] 알 수 없는 화면: ${name}`);
    return;
  }
  currentScreen = name;
  currentView = view;
  // 루트(홈)에선 뒤로 버튼을 감춘다 — 루트에서 history.back()은 앱 밖으로 나가버린다.
  document.querySelectorAll('[data-back]').forEach((el) => {
    el.hidden = name === DEFAULT_SCREEN;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  listeners.forEach((fn) => fn(name, view));
}

/** 지금 엔트리가 루트에서 몇 칸 위인가 (루트 = 앱을 연 첫 엔트리 = 홈) */
const depth = () => (history.state && history.state.depth) || 0;

/** 사용자 이동 — History에 한 칸 쌓고 전환한다. view를 주면 그 서브뷰로 바로 들어간다
 *  (홈 원탭 → 플레이어: 아래에 목록 칸을 안 깔아서 뒤로 한 번이면 홈이다). */
export function navigate(name, view = null) {
  if (name === currentScreen && currentView === view) return; // 같은 자리 재진입은 안 쌓는다
  if (!document.querySelector(`.screen[data-screen="${name}"]`)) {
    console.warn(`[ui] 알 수 없는 화면: ${name}`);
    return;
  }
  if (name === DEFAULT_SCREEN && view === null && depth() > 0) {
    history.go(-depth()); // 루트로 되감기 — popstate가 홈을 그린다(위 칸들은 버려진다)
    return;
  }
  history.pushState({ screen: name, view, depth: depth() + 1 }, '');
  applyScreen(name, view);
}

/** 서브뷰 진입 — History에 한 칸만 얹는다(화면 전환·리스너 호출 없음: 호출자가 이미 그렸다).
 *  덕분에 화면 "← 뒤로"(history.back)와 기기 뒤로가 똑같이 원래 뷰로 떨어진다. */
export function pushView(view) {
  if (!currentScreen || currentView === view) return; // 복원 직후 재-push 방지
  currentView = view;
  history.pushState({ screen: currentScreen, view, depth: depth() + 1 }, '');
}

/** 지금 엔트리의 서브뷰만 바꾼다(칸 수는 그대로). 플레이어를 목록으로 접을 때 쓴다 —
 *  그 자리에 뒤로로 돌아와도 플레이어가 아니라 목록이 뜬다. */
export function replaceView(view) {
  if (!currentScreen) return;
  currentView = view;
  history.replaceState({ screen: currentScreen, view, depth: depth() }, '');
}

export function getCurrentScreen() {
  return currentScreen;
}

/** 초기화: 네비/뒤로 위임 바인딩 + popstate 복원 + 기본 화면 표시 */
export function initUI() {
  document.addEventListener('click', (e) => {
    const back = e.target.closest('[data-back]');
    if (back) { e.preventDefault(); history.back(); return; } // 자체 pop 로직 없음
    const trigger = e.target.closest('[data-nav]');
    if (!trigger) return;
    e.preventDefault();
    navigate(trigger.dataset.nav);
  });
  // state가 비어 있는 엔트리(외부에서 되돌아온 경우 등)는 조용히 홈으로 폴백
  window.addEventListener('popstate', (e) => {
    applyScreen((e.state && e.state.screen) || DEFAULT_SCREEN, (e.state && e.state.view) || null);
  });
  history.replaceState({ screen: DEFAULT_SCREEN, view: null, depth: 0 }, ''); // 루트 엔트리
  applyScreen(DEFAULT_SCREEN);
}
