// ═══════════════════════════════════════════════════════════
// main.js — 진입점
// UI 초기화 → 홈 상태 반영. 측정 화면 진입 시 tracking/measurement를
// 지연 로드해 라이브 인식 프리뷰를 구동(파이프라인 확인용).
// ═══════════════════════════════════════════════════════════
import { initUI, onScreenChange } from './ui.js';
import { load, save, recordActivity, currentStreak, todayStr } from './store.js';
import { SCREENS } from './config.js';

/** 홈 헤더의 연속 달성 배지를 현재 스트릭으로 갱신 */
function renderStreak() {
  const streakEl = document.getElementById('streak');
  if (!streakEl) return;
  const days = currentStreak();
  if (days > 0) {
    document.getElementById('streakDays').textContent = days;
    streakEl.hidden = false;
  } else {
    streakEl.hidden = true;
  }
}

function boot() {
  renderStreak();

  initUI();

  onScreenChange((name) => {
    if (name !== SCREENS.MEASURE) stopMeasure();
    if (name !== SCREENS.GUIDE) stopGuide();
    if (name === SCREENS.MEASURE) initMeasure();
    if (name === SCREENS.GUIDE) initGuide();
    if (name === SCREENS.RECORDS) renderRecords();
  });

  console.log('[손목 정원] 부팅 완료');
}

// ═══════════════════════════════════════════════════════════
// 측정 화면: 손목 가동범위(굽힘·폄) 측정 → 저장 (지연 로드)
// 흐름(phase): idle → neutral(중립 잡기) → measure(끝범위 유지-캡처) → result(저장)
// tracking.js/measurement.js의 검증된 로직 재사용. rel<0=굽힘(A), rel>0=폄(B).
// ═══════════════════════════════════════════════════════════
let measure = null;
const NEUTRAL_MS = 1600; // 중립 자세 유지 시간

async function initMeasure() {
  if (measure && measure.wired) { setMeasurePhase('idle'); return; }
  const tracking = await import('./tracking.js');
  const { createWristTracker, createRomMeasurer } = await import('./measurement.js');

  const $ = (id) => document.getElementById(id);
  const els = {
    camVideo: $('camVideo'), camBadge: $('camBadge'),
    mLive: $('mLive'), mLiveVal: $('mLiveVal'), mLiveCap: $('mLiveCap'),
    mProg: $('mProg'), mProgBar: $('mProgBar'), mGuide: $('mGuide'),
    mIdle: $('mIdle'), mStart: $('mStart'),
    mCapture: $('mCapture'), capFlex: $('capFlex'), capFlexV: $('capFlexV'),
    capExt: $('capExt'), capExtV: $('capExtV'), mComp: $('mComp'),
    mActions: $('mActions'), mReneutral: $('mReneutral'), mFinish: $('mFinish'),
    mResult: $('mResult'), rFlex: $('rFlex'), rExt: $('rExt'), rSum: $('rSum'),
    rDelta: $('rDelta'), mAgain: $('mAgain'),
  };

  const tracker = createWristTracker('measure');
  const rom = createRomMeasurer();
  measure = { wired: true, tracking, tracker, rom, els, running: false, phase: 'idle', neutralStart: null };

  els.mStart.addEventListener('click', () => startMeasure());
  els.mReneutral.addEventListener('click', () => { if (measure.running) enterNeutral(); });
  els.mFinish.addEventListener('click', () => finishMeasure());
  els.mAgain.addEventListener('click', () => { if (measure.running) enterNeutral(); else startMeasure(); });

  setMeasurePhase('idle');
}

async function startMeasure() {
  const m = measure; if (!m || m.running) return;
  const { tracking, els } = m;
  try {
    els.camBadge.textContent = '모델 로딩…'; els.mStart.disabled = true;
    await tracking.initModels();
    els.camBadge.textContent = '카메라 여는 중…';
    await tracking.startCamera(els.camVideo);
    els.camBadge.textContent = '인식 중';
    m.running = true;
    m.tracker.reset(); m.rom.reset();
    enterNeutral();
    tracking.startLoop(({ hand, pose, now }) => {
      measureFrame(now, m.tracker.update(hand, pose, { usePose: true }));
    }, { pose: true });
  } catch (e) {
    els.camBadge.textContent = '오류'; els.mStart.disabled = false;
    els.mGuide.textContent = '카메라/모델을 열 수 없어요: ' + e.message;
    console.error('[measure] 시작 실패:', e);
  }
}

/** 중립 재수집 시작 */
function enterNeutral() {
  measure.neutralStart = null;
  measure.rom.reset();
  setMeasurePhase('neutral');
}

const fmtLive = (rel) => {
  const a = Math.round(Math.abs(rel));
  if (a < 3) return '중립 0°';
  return (rel < 0 ? '굽힘 ' : '폄 ') + a + '°';
};
const setCapVal = (el, v) => { el.textContent = v > 0 ? v + '°' : '–'; };
const setProg = (p) => { measure.els.mProgBar.style.width = (Math.max(0, Math.min(1, p)) * 100) + '%'; };
function pulseCap(chip) { chip.classList.remove('pop'); void chip.offsetWidth; chip.classList.add('pop'); }

function measureFrame(now, snap) {
  const m = measure, e = m.els;

  if (m.phase === 'neutral') {
    if (snap.detected) {
      if (m.neutralStart == null) { m.neutralStart = now; m.tracker.beginNeutral(); }
      const p = Math.min(1, (now - m.neutralStart) / NEUTRAL_MS);
      setProg(p);
      e.mLiveVal.textContent = '중립 잡는 중';
      e.mLiveCap.textContent = `손목을 곧게 편 채 유지 (${Math.ceil((NEUTRAL_MS - (now - m.neutralStart)) / 1000)}s)`;
      if (p >= 1) { m.tracker.commitNeutral(); m.rom.reset(); m.neutralStart = null; setMeasurePhase('measure'); }
    } else {
      m.neutralStart = null; setProg(0);
      e.mLiveVal.textContent = '손을 보여주세요';
      e.mLiveCap.textContent = '';
    }
    return;
  }

  if (m.phase === 'measure') {
    e.mLiveVal.textContent = snap.detected ? fmtLive(snap.rel) : '손을 보여주세요';
    e.mLiveCap.textContent = snap.detected ? '최대한 굽혔다 → 폈다' : '';
    const r = m.rom.feed(snap.rel, now, snap.comp || !snap.detected);
    setCapVal(e.capFlexV, r.maxA); setCapVal(e.capExtV, r.maxB);
    if (r.captured) pulseCap(r.captured.side === 'A' ? e.capFlex : e.capExt);
    setProg(r.progress > 0 && r.progress < 1 ? r.progress : 0);
    e.mComp.hidden = !(snap.comp && snap.detected);
    e.mFinish.disabled = !(r.maxA > 0 || r.maxB > 0);
    return;
  }
}

function finishMeasure() {
  const m = measure, e = m.els, r = m.rom.state;
  const flex = r.maxA, ext = r.maxB, sum = flex + ext;

  const s = load();
  s.measurements = s.measurements || [];
  const prev = s.measurements[s.measurements.length - 1] || null;
  s.measurements.push({ at: todayStr(), flex, ext, rom: sum });
  save(s);
  recordActivity(s); // 측정도 오늘 활동으로 스트릭 반영
  renderStreak();

  e.rFlex.textContent = flex + '°'; e.rExt.textContent = ext + '°'; e.rSum.textContent = sum + '°';
  if (prev) {
    const d = sum - prev.rom;
    e.rDelta.textContent = `지난 측정 ${prev.rom}° 대비 ${d > 0 ? '+' : ''}${d}° (참고값)`;
  } else {
    e.rDelta.textContent = '첫 측정이에요. 다음부터 지난 기록과 비교해 드려요.';
  }
  setMeasurePhase('result');
}

/** 화면 단계 전환: 패널 노출/문구/진행바 초기화 */
function setMeasurePhase(phase) {
  const m = measure; if (!m) return;
  m.phase = phase;
  const e = m.els, show = (el, on) => { if (el) el.hidden = !on; };

  show(e.mIdle, phase === 'idle');
  show(e.mCapture, phase === 'measure');
  show(e.mActions, phase === 'measure');
  show(e.mResult, phase === 'result');
  show(e.mLive, phase === 'neutral' || phase === 'measure');
  show(e.mProg, phase === 'neutral' || phase === 'measure');
  show(e.mComp, false);

  if (phase === 'idle') {
    show(e.mGuide, true);
    e.mGuide.textContent = '손목을 옆에서 보이게 하고(팔꿈치까지 나오면 더 좋아요), 측정을 시작하세요.';
    e.mStart.disabled = false; setProg(0);
    e.camBadge.textContent = m.running ? '인식 중' : '카메라 꺼짐';
  } else if (phase === 'neutral') {
    show(e.mGuide, true);
    e.mGuide.textContent = '손목을 곧게 편 중립 자세로 잠깐 유지해요.';
    setProg(0);
  } else if (phase === 'measure') {
    show(e.mGuide, true);
    e.mGuide.textContent = '천천히 최대한 굽혔다가, 최대한 펴세요. 끝에서 잠깐 멈추면 기록돼요.';
    setCapVal(e.capFlexV, 0); setCapVal(e.capExtV, 0);
    e.mFinish.disabled = true; setProg(0);
  } else if (phase === 'result') {
    show(e.mGuide, false);
  }
}

function stopMeasure() {
  const m = measure; if (!m) return;
  if (m.running) { m.tracking.stopTracking(); m.running = false; }
  m.neutralStart = null;
  setMeasurePhase('idle');
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
  // 기록 저장 + 스트릭 갱신
  const s = load();
  s.guideDone = s.guideDone || [];
  s.guideDone.push({ id: g.id, name: g.name, at: todayStr() });
  save(s);
  recordActivity(s);   // 오늘 활동으로 스트릭 반영
  renderStreak();      // 홈 배지 즉시 갱신(홈 복귀 전 반영)
}

function stopGuideSession() {
  if (!guide) return;
  clearTimeout(guide.neutralTimer);
  if (guide.running) { guide.tracking.stopTracking(); guide.running = false; }
  guide.engine = null; guide.anim = null; guide.tracker = null;
  if (guide.els) guide.els.cam.textContent = '카메라';
}

function stopGuide() { stopGuideSession(); }

// ═══════════════════════════════════════════════════════════
// 기록 화면: ROM 추이(캔버스 라인차트) + 가이드 완료 히스토리
// 카메라 없음 — 화면 진입 시 store를 읽어 매번 새로 렌더.
// ═══════════════════════════════════════════════════════════
let recordsEls = null;
let guideNameMap = null; // id → name (옛 기록에 name 없을 때 보완)

const fmtMd = (iso) => { const p = String(iso).split('-'); return p[2] ? `${+p[1]}/${+p[2]}` : String(iso); };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function renderRecords() {
  const $ = (id) => document.getElementById(id);
  if (!recordsEls) {
    recordsEls = {
      range: $('recRange'), trendWrap: $('recTrendWrap'), trendEmpty: $('recTrendEmpty'),
      latest: $('recLatest'), delta: $('recDelta'), best: $('recBest'),
      canvas: $('recCanvas'), trendHint: $('recTrendHint'),
      guideCount: $('recGuideCount'), history: $('recHistory'), historyEmpty: $('recHistoryEmpty'),
    };
  }
  if (!guideNameMap) {
    const { GUIDES } = await import('./guide/guideData.js');
    guideNameMap = Object.fromEntries(GUIDES.map((g) => [g.id, g.name]));
  }
  const s = load();
  renderTrend(recordsEls, s.measurements || []);
  renderHistory(recordsEls, s.guideDone || []);
}

function renderTrend(e, ms) {
  if (!ms.length) {
    e.trendWrap.hidden = true; e.trendEmpty.hidden = false; e.range.textContent = '';
    return;
  }
  e.trendEmpty.hidden = true; e.trendWrap.hidden = false;

  const last = ms[ms.length - 1];
  const prev = ms[ms.length - 2] || null;
  const best = Math.max(...ms.map((m) => m.rom));

  e.latest.textContent = last.rom + '°';
  e.best.textContent = best + '°';
  if (prev) {
    const d = last.rom - prev.rom;
    e.delta.textContent = (d > 0 ? '+' : '') + d + '°';
    e.delta.className = d > 0 ? 'up' : (d < 0 ? 'down' : '');
  } else {
    e.delta.textContent = '—'; e.delta.className = '';
  }
  e.range.textContent = ms.length > 1 ? `${fmtMd(ms[0].at)} ~ ${fmtMd(last.at)}` : fmtMd(last.at);
  e.trendHint.textContent = ms.length < 2 ? '측정을 2번 이상 하면 변화 추이가 그려져요.' : `총 ${ms.length}회 측정 · 참고값`;

  drawTrend(e.canvas, ms.map((m) => m.rom));
}

/** 총 가동범위(°) 수열을 시간순 라인차트로 그림 */
function drawTrend(canvas, data) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 460, cssH = 170;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 34, padR = 14, padT = 14, padB = 22;
  const w = cssW - padL - padR, h = cssH - padT - padB;
  const n = data.length;

  let mn = Math.min(...data), mx = Math.max(...data);
  if (mn === mx) { mn -= 10; mx += 10; }
  const gap = (mx - mn) * 0.15; mn = Math.max(0, mn - gap); mx += gap;

  const X = (i) => padL + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const Y = (v) => padT + h - ((v - mn) / (mx - mn)) * h;

  // 기준선 3개 + y라벨
  ctx.font = '10px Jua, sans-serif'; ctx.textBaseline = 'middle';
  for (let g = 0; g <= 2; g++) {
    const val = mn + (mx - mn) * g / 2, yy = Y(val);
    ctx.strokeStyle = 'rgba(120,200,132,.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + w, yy); ctx.stroke();
    ctx.fillStyle = '#8aa38e'; ctx.fillText(Math.round(val) + '°', 4, yy);
  }

  const linePath = () => { ctx.beginPath(); data.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };

  // 면적 채우기
  linePath();
  ctx.lineTo(X(n - 1), padT + h); ctx.lineTo(X(0), padT + h); ctx.closePath();
  ctx.fillStyle = 'rgba(120,200,132,.14)'; ctx.fill();

  // 선
  linePath();
  ctx.strokeStyle = '#54ac63'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

  // 점 (마지막 강조)
  data.forEach((v, i) => {
    const x = X(i), y = Y(v), lastPt = i === n - 1;
    ctx.beginPath(); ctx.arc(x, y, lastPt ? 5 : 3.5, 0, 7);
    ctx.fillStyle = lastPt ? '#469a54' : '#7fd28a'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  });
}

function renderHistory(e, done) {
  if (!done.length) {
    e.history.hidden = true; e.historyEmpty.hidden = false; e.guideCount.textContent = '';
    return;
  }
  e.historyEmpty.hidden = true; e.history.hidden = false;
  e.guideCount.textContent = `총 ${done.length}회`;

  const recent = [...done].reverse();
  const shown = recent.slice(0, 20);
  const rows = shown.map((g) => {
    const name = g.name || guideNameMap[g.id] || g.id;
    return `<li class="rh-item"><span class="rh-date">${fmtMd(g.at)}</span><span class="rh-name">${escapeHtml(name)}</span></li>`;
  });
  if (recent.length > shown.length) rows.push(`<li class="rh-more">그 외 ${recent.length - shown.length}회</li>`);
  e.history.innerHTML = rows.join('');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
