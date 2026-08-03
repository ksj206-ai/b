// ═══════════════════════════════════════════════════════════
// ui.js — 화면 전환 (라우터)
// [data-nav="<screen>"] 클릭 → 해당 화면 표시. [data-back] 클릭 → 직전 화면.
// 각 화면은 <section class="screen" data-screen="<name>">.
//
// 뒤로가기는 브라우저 History '하나'만 단일 소스로 쓴다(자체 히스토리 스택 없음).
// 그래서 진입점을 둘로 나눈다 — 이 분리가 popstate↔push 무한루프를 구조적으로 막아준다
// (suppressPush 같은 억제 플래그가 필요 없는 이유):
//   navigate(name)    = pushState + 화면 전환   ← 사용자 이동(클릭·딥스타트)만 부른다
//   applyScreen(name) = 화면 전환만(push 일절 없음) ← popstate·초기 표시가 부른다
// ═══════════════════════════════════════════════════════════
import { DEFAULT_SCREEN } from './config.js';

let currentScreen = null;
const listeners = new Set();

/** 화면 전환 콜백 등록: (screenName) => void */
export function onScreenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 화면 전환만 — history는 건드리지 않는다 (popstate 복원 경로) */
export function applyScreen(name) {
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
  // 루트(홈)에선 뒤로 버튼을 감춘다 — 루트에서 history.back()은 앱 밖으로 나가버린다.
  document.querySelectorAll('[data-back]').forEach((el) => {
    el.hidden = name === DEFAULT_SCREEN;
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
  listeners.forEach((fn) => fn(name));
}

/** 사용자 이동 — History에 한 칸 쌓고 전환한다 */
export function navigate(name) {
  if (name === currentScreen) return; // 같은 화면 재진입은 엔트리를 쌓지 않는다
  if (!document.querySelector(`.screen[data-screen="${name}"]`)) {
    console.warn(`[ui] 알 수 없는 화면: ${name}`);
    return;
  }
  history.pushState({ screen: name }, '');
  applyScreen(name);
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
    applyScreen((e.state && e.state.screen) || DEFAULT_SCREEN);
  });
  history.replaceState({ screen: DEFAULT_SCREEN }, ''); // baseline 엔트리
  applyScreen(DEFAULT_SCREEN);
}
