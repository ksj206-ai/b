// ═══════════════════════════════════════════════════════════
// main.js — 진입점
// UI 초기화 → 홈 상태 반영. 측정 화면 진입 시 tracking/measurement를
// 지연 로드해 라이브 인식 프리뷰를 구동(파이프라인 확인용).
// ═══════════════════════════════════════════════════════════
import { initUI, onScreenChange } from './ui.js';
import { load, save } from './store.js';
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
    if (name !== SCREENS.MEASURE) stopMeasurePreview();
    if (name !== SCREENS.GUIDE) stopGuide();
    if (name === SCREENS.MEASURE) initMeasurePreview();
    if (name === SCREENS.GUIDE) initGuide();
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

// ═══════════════════════════════════════════════════════════
// 가이드 화면: 목록 + 플레이어 (지연 로드)
// ═══════════════════════════════════════════════════════════
let guide = null; // { mods, els, ... }

async function initGuide() {
  if (guide && guide.wired) { showGuideList(); return; }
  const tracking = await import('./tracking.js');
  const { GUIDES, getGuide } = await import('./guide/guideData.js');
  const { drawGuideHand } = await import('./guide/guideHand.js');
  const { createAnimPlayer } = await import('./guide/animPlayer.js');
  const { createStepEngine } = await import('./guide/stepEngine.js');
  const { createWristTracker } = await import('./measurement.js');

  const $ = (id) => document.getElementById(id);
  const els = {
    list: $('guideList'), player: $('guidePlayer'), canvas: $('guideCanvas'),
    video: $('guideVideo'), cam: $('gpCam'), name: $('gpName'), step: $('gpStep'),
    text: $('gpText'), dots: $('gpDots'), hint: $('gpHint'), idle: $('gpIdle'),
    skip: $('gpSkip'), quit: $('gpQuit'), done: $('gpDone'), toList: $('gpToList'),
    retry: $('gpRetry'), proceed: $('gpProceed'),
    safe: document.querySelector('.gp-safe'), btns: document.querySelector('.gp-btns'),
  };

  guide = {
    wired: true, tracking, mods: { drawGuideHand, createAnimPlayer, createStepEngine, createWristTracker, getGuide },
    els, ctx: els.canvas.getContext('2d'),
    engine: null, tracker: null, anim: null, cur: null, running: false, neutralTimer: null,
  };

  // 목록 구성
  els.list.innerHTML = '';
  for (const g of GUIDES) {
    const b = document.createElement('button');
    b.className = 'guide-card';
    b.innerHTML = `<span class="gc-emoji">${g.emoji}</span><span class="gc-name">${g.name}</span>`;
    b.addEventListener('click', () => startGuide(g.id));
    els.list.appendChild(b);
  }

  // 버튼
  els.quit.addEventListener('click', () => showGuideList());
  els.toList.addEventListener('click', () => showGuideList());
  els.skip.addEventListener('click', () => { if (guide.engine) guide.engine.skip(performance.now()); });
  els.proceed.addEventListener('click', () => { if (guide.engine) guide.engine.skip(performance.now()); });
  els.retry.addEventListener('click', () => { guide.els.idle.hidden = true; });

  showGuideList();
}

function showGuideList() {
  if (!guide) return;
  stopGuideSession();
  guide.els.player.hidden = true;
  guide.els.list.hidden = false;
}

async function startGuide(id) {
  const g = guide.mods.getGuide(id);
  if (!g) return;
  const { els, ctx, mods } = guide;
  guide.cur = g;
  els.list.hidden = true;
  els.player.hidden = false;
  els.done.hidden = true;
  els.btns.hidden = false;
  els.idle.hidden = true;
  els.name.textContent = `${g.emoji} ${g.name}`;
  els.cam.textContent = '카메라 여는 중…';

  const tracker = mods.createWristTracker('live');
  guide.tracker = tracker;

  const engine = mods.createStepEngine(g, {
    onEnterStep: (step, i, total) => {
      els.step.textContent = `${i + 1}/${total}`;
      els.text.textContent = step.text;
      els.hint.textContent = '';
      els.idle.hidden = true;
      buildDots(step.type === 'follow' ? step.reps : 0);
      guide.anim = step.type === 'follow' && step.anim
        ? mods.createAnimPlayer(step.anim, step.base || {})
        : null;
      guide.staticPose = step.pose || {};
    },
    onCount: (count, reps) => fillDots(count, reps),
    onStatus: ({ hint, comp, idle }) => {
      els.hint.textContent = comp ? '⚠ 팔은 그대로, 손목만 움직여요' : (hint || '');
      els.hint.classList.toggle('warn', !!comp);
      els.idle.hidden = !idle;
    },
    onNeedNeutral: () => {
      els.text.textContent = '준비… 손을 편하게 보여주세요';
      tracker.beginNeutral();
      clearTimeout(guide.neutralTimer);
      guide.neutralTimer = setTimeout(() => {
        tracker.commitNeutral();
        guide.engine.arm(performance.now());
        els.text.textContent = guide.engine.step?.text || '';
      }, 900);
    },
    onComplete: () => onGuideComplete(g),
  });
  guide.engine = engine;

  try {
    await guide.tracking.initModels();
    await guide.tracking.startCamera(els.video);
    els.cam.textContent = '인식 중';
    guide.running = true;
    engine.start(performance.now());
    guide.tracking.startLoop(({ hand, pose, now }) => {
      // 시범 손 그리기
      const params = guide.anim ? guide.anim.sample(now) : (guide.staticPose || {});
      drawStage(ctx, guide.els.canvas, mods.drawGuideHand, params, g.view);
      // 사용자 인식 → 스텝 진행
      const snap = tracker.update(hand, pose, { usePose: g.view === 'side' });
      engine.update(now, snap);
    }, { pose: g.view === 'side' });
  } catch (e) {
    els.cam.textContent = '오류';
    els.text.textContent = '카메라/모델을 열 수 없어요: ' + e.message;
    console.error('[guide] 시작 실패:', e);
  }
}

function drawStage(ctx, canvas, drawGuideHand, params, view) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 은은한 배경 원
  ctx.save();
  ctx.fillStyle = 'rgba(120,200,132,.08)';
  ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 128, 0, 7); ctx.fill();
  ctx.restore();
  drawGuideHand(ctx, params, view, { cx: canvas.width / 2, cy: canvas.height / 2, scale: 1 });
}

function buildDots(reps) {
  const el = guide.els.dots; el.innerHTML = '';
  for (let i = 0; i < reps; i++) {
    const d = document.createElement('span'); d.className = 'gp-dot'; el.appendChild(d);
  }
}
function fillDots(count, reps) {
  const dots = guide.els.dots.children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < count);
  guide.els.text.textContent = `${guide.cur?.steps[guide.engine.index]?.text || ''}`;
}

function onGuideComplete(g) {
  guide.els.btns.hidden = true;
  guide.els.idle.hidden = true;
  guide.els.dots.innerHTML = '';
  guide.els.hint.textContent = '';
  guide.els.text.textContent = '';
  guide.els.done.hidden = false;
  // 기록 저장
  const s = load();
  s.guideDone = s.guideDone || [];
  s.guideDone.push({ id: g.id, at: new Date().toISOString().slice(0, 10) });
  save(s);
}

function stopGuideSession() {
  if (!guide) return;
  clearTimeout(guide.neutralTimer);
  if (guide.running) { guide.tracking.stopTracking(); guide.running = false; }
  guide.engine = null; guide.anim = null; guide.tracker = null;
  if (guide.els) guide.els.cam.textContent = '카메라';
}

function stopGuide() { stopGuideSession(); }

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
