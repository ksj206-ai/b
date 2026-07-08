// ═══════════════════════════════════════════════════════════
// ui.js — 화면 전환 (라우터)
// [data-nav="<screen>"] 클릭 → 해당 화면 표시.
// 각 화면은 <section class="screen" data-screen="<name>">.
// ═══════════════════════════════════════════════════════════
import { DEFAULT_SCREEN } from './config.js';

let currentScreen = null;
const listeners = new Set();

/** 화면 전환 콜백 등록: (screenName) => void */
export function onScreenChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 지정 화면으로 전환 */
export function showScreen(name) {
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
  listeners.forEach((fn) => fn(name));
}

export function getCurrentScreen() {
  return currentScreen;
}

/** 초기화: 네비 위임 바인딩 + 기본 화면 표시 */
export function initUI() {
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-nav]');
    if (!trigger) return;
    e.preventDefault();
    showScreen(trigger.dataset.nav);
  });
  showScreen(DEFAULT_SCREEN);
}
