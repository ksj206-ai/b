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
//   navigate(name)    = pushState + 화면 전환      ← 사용자 이동(클릭·딥스타트)만 부른다
//   pushView(view)    = pushState만(전환 없음)      ← 서브뷰 진입(호출자가 이미 그렸다)
//   applyScreen(n, v) = 화면 전환만(push 일절 없음) ← popstate·초기 표시가 부른다
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

/** 사용자 이동 — History에 한 칸 쌓고 전환한다 (서브뷰는 벗겨진 기본 뷰로) */
export function navigate(name) {
  if (name === currentScreen && currentView === null) return; // 같은 자리 재진입은 안 쌓는다
  if (!document.querySelector(`.screen[data-screen="${name}"]`)) {
    console.warn(`[ui] 알 수 없는 화면: ${name}`);
    return;
  }
  history.pushState({ screen: name, view: null }, '');
  applyScreen(name, null);
}

/** 서브뷰 진입 — History에 한 칸만 얹는다(화면 전환·리스너 호출 없음: 호출자가 이미 그렸다).
 *  덕분에 화면 "← 뒤로"(history.back)와 기기 뒤로가 똑같이 원래 뷰로 떨어진다. */
export function pushView(view) {
  if (!currentScreen || currentView === view) return; // 복원 직후 재-push 방지
  currentView = view;
  history.pushState({ screen: currentScreen, view }, '');
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
  history.replaceState({ screen: DEFAULT_SCREEN, view: null }, ''); // baseline 엔트리
  applyScreen(DEFAULT_SCREEN);
}
