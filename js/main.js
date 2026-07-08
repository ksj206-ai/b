// ═══════════════════════════════════════════════════════════
// main.js — 진입점
// UI 초기화 → 저장된 상태로 홈 화면 채움.
// tracking/measurement/guide 모듈은 각 화면 진입 시 지연 로드 예정.
// ═══════════════════════════════════════════════════════════
import { initUI, onScreenChange } from './ui.js';
import { load } from './store.js';
import { SCREENS } from './config.js';

function boot() {
  const state = load();

  // 스트릭 표시
  const streakEl = document.getElementById('streak');
  if (streakEl && state.streakDays > 0) {
    document.getElementById('streakDays').textContent = state.streakDays;
    streakEl.hidden = false;
  }

  initUI();

  // 화면 진입 시 훅 (2단계부터 카메라 시작/정지 등 연결)
  onScreenChange((name) => {
    if (name === SCREENS.HOME) {
      // TODO: 진행 중 트래킹 정지
    }
    // TODO(2단계): guide/measure/game 진입 시 해당 모듈 동적 import
  });

  console.log('[손목 정원] 부팅 완료');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
