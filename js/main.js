// ═══════════════════════════════════════════════════════════
// main.js — 진입점
// UI 초기화 → 홈 상태 반영. 측정 화면 진입 시 tracking/measurement를
// 지연 로드해 라이브 인식 프리뷰를 구동(파이프라인 확인용).
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

  onScreenChange((name) => {
    if (name === SCREENS.MEASURE) initMeasurePreview();
    else stopMeasurePreview();
  });

  console.log('[손목 정원] 부팅 완료');
}

// ─── 측정 화면: 라이브 인식 프리뷰 (지연 로드) ───
let measure = null; // { tracking, tracker, rom, running }

async function initMeasurePreview() {
  if (measure && measure.wired) return;
  const tracking = await import('./tracking.js');
  const { createWristTracker, createRomMeasurer } = await import('./measurement.js');

  const $ = (id) => document.getElementById(id);
  const els = {
    video: $('camVideo'), badge: $('camBadge'), hint: $('mzHint'),
    startBtn: $('startTrackBtn'), metrics: $('metrics'), actions: $('measureActions'),
    neutralBtn: $('neutralBtn'), romOut: $('romOut'), romHold: $('romHold'),
    det: $('mDet'), rel: $('mRel'), comp: $('mComp'), grip: $('mGrip'),
    spread: $('mSpread'), tip: $('mTip'), pinch: $('mPinch'), pose: $('mPose'),
  };

  const tracker = createWristTracker('measure');
  const rom = createRomMeasurer();
  measure = { tracking, tracker, rom, els, running: false, wired: true, neutralSet: false };

  els.startBtn.addEventListener('click', () => startCam());
  els.neutralBtn.addEventListener('click', () => {
    // 짧게 표본을 모아 중립 확정 (원본 카운트다운 축약판)
    tracker.beginNeutral();
    els.neutralBtn.textContent = '중립 잡는 중…';
    setTimeout(() => {
      const n = tracker.commitNeutral();
      rom.reset();
      measure.neutralSet = Number.isFinite(n);
      els.neutralBtn.textContent = measure.neutralSet ? '① 중립 다시 잡기' : '① 중립 잡기(손 보이게)';
    }, 700);
  });
}

async function startCam() {
  const m = measure; if (!m || m.running) return;
  const { tracking, tracker, rom, els } = m;
  try {
    els.badge.textContent = '모델 로딩…';
    els.startBtn.disabled = true;
    await tracking.initModels();
    els.badge.textContent = '카메라 여는 중…';
    await tracking.startCamera(els.video);
    els.badge.textContent = '인식 중';
    els.hint.hidden = true; els.startBtn.hidden = true;
    els.metrics.hidden = false; els.actions.hidden = false;
    m.running = true;

    tracking.startLoop(({ hand, pose }) => {
      const snap = tracker.update(hand, pose, { usePose: true });
      renderMetrics(els, snap);
      if (m.neutralSet && snap.detected) {
        const r = rom.feed(snap.rel, performance.now(), snap.comp);
        renderRom(els, r);
      }
    }, { pose: true });
  } catch (e) {
    els.badge.textContent = '오류';
    els.startBtn.disabled = false;
    els.hint.hidden = false;
    els.hint.textContent = '카메라/모델을 열 수 없어요: ' + e.message;
    console.error('[measure] 시작 실패:', e);
  }
}

function renderMetrics(els, snap) {
  els.det.textContent = snap.detected ? '✓ 보임' : '✗ 안보임';
  els.det.className = snap.detected ? 'ok' : 'no';
  els.rel.textContent = snap.smooth === null ? '–'
    : (snap.rel >= 0 ? '+' : '') + Math.round(snap.rel) + '°';
  els.comp.textContent = snap.comp ? '⚠️ 감지' : '없음';
  els.comp.className = snap.comp ? 'no' : 'ok';
  els.pose.textContent = snap.usePose ? '사용(팔 보임)' : '미사용(손만)';
  const f = snap.fingers;
  els.grip.textContent = f ? f.grip.toFixed(2) : '–';
  els.spread.textContent = f ? f.spread.toFixed(2) : '–';
  els.tip.textContent = f ? f.tipMCP.toFixed(2) : '–';
  els.pinch.textContent = f ? f.pinch.toFixed(2) : '–';
}

function renderRom(els, r) {
  // rel<0 = 굽힘(A), rel>0 = 폄(B)
  els.romOut.textContent = `굽힘 ${r.maxA}° · 폄 ${r.maxB}°`;
  const pct = Math.round(r.progress * 100);
  els.romHold.textContent = pct > 0 && pct < 100 ? `유지 ${pct}%` : (r.captured ? '저장됨 ✓' : '');
}

function stopMeasurePreview() {
  if (measure && measure.running) {
    measure.tracking.stopTracking();
    measure.running = false;
    if (measure.els) {
      measure.els.badge.textContent = '카메라 꺼짐';
      measure.els.metrics.hidden = true;
      measure.els.actions.hidden = true;
      measure.els.startBtn.hidden = false;
      measure.els.startBtn.disabled = false;
      measure.els.hint.hidden = false;
    }
    measure.neutralSet = false;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
