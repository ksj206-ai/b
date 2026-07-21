// ═══════════════════════════════════════════════════════════
// main.js — 진입점
// UI 초기화 → 홈 상태 반영. 측정 화면 진입 시 tracking/measurement를
// 지연 로드해 라이브 인식 프리뷰를 구동(파이프라인 확인용).
// ═══════════════════════════════════════════════════════════
import { initUI, onScreenChange, getCurrentScreen, showScreen } from './ui.js';
import {
  load, save, recordActivity, currentStreak, freezeUsedThisWeek, todayStr,
  assignTodayConstellation, syncStarsToProgress, getSky,
  isTodayComplete, completeTodayConstellation,
} from './store.js';
import { renderSky } from './sky.js';
import { CONSTELLATIONS } from './constellations.js';
import { SCREENS, ROUTINE, HAND_LM, DEBUG_GUIDE, FUNCTIONAL_ROM } from './config.js';
import {
  getTodayRoutine, markRoutineDone, nextRoutineExercise,
  routineProgress, isRoutineComplete, isSlotDone, estimateGuideSec,
  needMeasureSuggest, conditionOf, recordCondition,
} from './routine.js';
import { getGuide } from './guide/guideData.js';
import {
  REMINDER_PRESETS, REMINDER_MAX, getReminder, saveReminder,
  requestPermission, isBlocked, startReminderLoop,
} from './reminder.js';

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

// ═══════════════════════════════════════════════════════════
// 홈: 오늘의 루틴 코스 카드
// 상태 3종 — 미시작 / 부분 완료(이어하기) / 완주(축하 + 한 번 더)
// ═══════════════════════════════════════════════════════════
let pendingGuideId = null; // 홈 딥스타트 → 가이드 화면 진입 시 1회 소비

function renderHome() {
  renderStreak();
  const $ = (id) => document.getElementById(id);
  const stage = $('skyStage');
  if (!stage) return;

  const r = getTodayRoutine();
  const { done, total } = routineProgress(r);
  const complete = isRoutineComplete(r);
  const nextId = nextRoutineExercise(r);
  const nextNo = nextId ? r.ids.indexOf(nextId) + 1 : 0; // 다음 미완료의 코스 순번

  // 남은 시간 — 미완료 운동만 합산
  const leftSec = r.ids.filter((id) => !r.doneIds.includes(id))
    .reduce((s, id) => s + estimateGuideSec(getGuide(id) || { steps: [] }), 0);
  const leftMin = Math.max(1, Math.ceil(leftSec / 60));

  $('rpText').textContent = complete ? `오늘 ${done}/${total} 완주 ⭐`
    : done > 0 ? `오늘 ${done}/${total} · 남은 시간 약 ${leftMin}분`
    : `${total}개 운동 · 약 ${leftMin}분`;

  // 오늘의 별자리: 진입 시 배정(멱등) → 완료한 운동 슬롯만큼 점등 복원 → SVG 렌더.
  // 슬롯별 배정 개수(plan)의 합만큼 그리는 순서대로 켜지므로, 홈을 나갔다 와도
  // 완료한 운동 수에 맞게 별이 유지되고 6개 완주 시 모든 별이 켜진다.
  const skyState = load();
  assignTodayConstellation(skyState);
  const doneSlots = r.ids.map((_, i) => i).filter((i) => isSlotDone(r, i));
  syncStarsToProgress(skyState, doneSlots);
  const sky = getSky(skyState);
  const today = sky.today;
  if (today) {
    // 이미 도감에 기록됐는가 = 이미 완성 연출을 봤는가 (재진입 시 연출 반복 방지)
    const already = (sky.constellations || [])
      .some((c) => c.id === today.constellationId && c.date === today.date);
    const con = renderSky(stage, today.constellationId, today.litStars);
    if (con) {
      $('skyName').textContent = con.name;
      stage.setAttribute('aria-label',
        `오늘의 별자리 · ${con.name} — 별 ${today.litStars.length}/${con.stars.length}`);
    }
    // 6개 완료로 방금 전부 켜졌고 아직 기록 전이면 → 도감 누적 + 완성 연출(1회)
    if (con && isTodayComplete(skyState) && !already) {
      completeTodayConstellation(skyState); // 도감에 누적 (멱등)
      celebrateSky(con);                    // 조용한 완성 축하 (한 번만)
    }
  }
  // 밤하늘 도감 수집 배지 (서로 다른 별자리 수 / 전체 16)
  const collected = new Set((getSky(skyState).constellations || []).map((c) => c.id)).size;
  const dexBadge = $('skyDexCount');
  if (dexBadge) dexBadge.textContent = `${collected}/${CONSTELLATIONS.length}`;

  const title = $('todayRoutine'), btn = $('routineStart'), speech = $('mascotSpeech');
  const streak = currentStreak();
  btn.disabled = complete;
  btn.classList.toggle('btn-done', complete);
  if (complete) {
    title.textContent = r.gentle
      ? '오늘 순한 코스 완주! 잘 쉬어가고 있어요 🌿'
      : '오늘 풀코스 완주! 정원이 활짝 피었어요 ⭐';
    btn.textContent = '오늘 완료! 내일 만나요';
    speech.textContent = '오늘 몫 끝! 내일 만나요 🌙';
  } else if (done > 0) {
    title.textContent = `잘하고 있어요! 이어서 ${getGuide(nextId).name}`;
    btn.textContent = `이어하기 (${nextNo}번째부터)`;
    speech.textContent = '아까 하던 거 이어서 할까요?';
  } else if (r.gentle) {
    title.textContent = `오늘은 순한 코스로 가볍게, ${leftMin}분이면 돼요`;
    btn.textContent = '시작하기 🌱';
    speech.textContent = '어제 뻐근했죠? 오늘은 살살 해요 🌿';
  } else {
    title.textContent = `오늘의 손목 풀코스, ${leftMin}분이면 돼요`;
    btn.textContent = '시작하기 🌱';
    speech.textContent = streak >= 2 ? `${streak}일 연속이에요! 🔥` : '오늘도 만나서 반가워요! 🌿';
  }

  // 마스코트(우주 고양이) 표정 — 말풍선과 같은 상태 조건 재사용.
  //   완주=happy / 스트릭 끊김·며칠 만 방문(이전 활동 있는데 스트릭 0)=sad / 그 외=idle
  const catImg = $('mascotImg');
  if (catImg) {
    const mood = complete ? 'happy'
      : (load().lastActiveDate && streak === 0) ? 'sad'
      : 'idle';
    if (catImg.dataset.mood !== mood) {
      catImg.dataset.mood = mood;
      catImg.src = `assets/cat-${mood}.png`;
    }
  }

  // 손목 체크 카드 주간 상태 칩 — 실시간 판정(체크 직후 홈 복귀 시 바로 갱신)
  const chip = $('measureChip');
  const need = needMeasureSuggest();
  chip.textContent = need ? '📏 이번 주 체크 전이에요' : '✓ 이번 주 체크 완료';
  chip.classList.toggle('is-need', need);

  renderRemindEntry();
}

// ═══════════════════════════════════════════════════════════
// 밤하늘 별자리 — 완성 연출(1회) + 도감 (완성한 별자리 격자 수집)
// 렌더는 sky.js renderSky를 그대로 재사용한다(도감 칸·크게보기 모두).
// ═══════════════════════════════════════════════════════════

/** 오늘의 별자리 완성 축하 — 별자리 은은한 샤인 + 완성 메시지 페이드. 조용하게, 한 번만. */
let skyCelebrateTimer = null;
function celebrateSky(con) {
  const stage = document.getElementById('skyStage');
  const banner = document.getElementById('skyCelebrate');
  if (!stage || !con) return;
  stage.classList.remove('celebrate'); void stage.offsetWidth; stage.classList.add('celebrate');
  if (banner) {
    const b = banner.querySelector('b');
    if (b) b.textContent = con.name;
    banner.hidden = false;
    banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
  }
  clearTimeout(skyCelebrateTimer);
  skyCelebrateTimer = setTimeout(() => {
    stage.classList.remove('celebrate');
    if (banner) { banner.classList.remove('show'); banner.hidden = true; }
  }, 3200);
}

/** 밤하늘 도감 렌더 — 16칸 격자. 완성=밝게(이름·날짜), 오늘=진행분, 나머지=흐릿(잠김). */
let skyDexEls = null;
function renderSkyDex() {
  const $ = (id) => document.getElementById(id);
  if (!skyDexEls) {
    skyDexEls = {
      grid: $('skyDexGrid'), progress: $('skyDexProgress'),
      modal: $('skyDexModal'), modalSky: $('skyDexModalSky'),
      modalName: $('skyDexModalName'), modalDate: $('skyDexModalDate'),
      modalClose: $('skyDexModalClose'),
    };
    skyDexEls.modalClose.addEventListener('click', () => { skyDexEls.modal.hidden = true; });
    // 배경(카드 바깥) 탭 → 닫기
    skyDexEls.modal.addEventListener('click', (e) => {
      if (e.target === skyDexEls.modal) skyDexEls.modal.hidden = true;
    });
  }
  const sky = getSky();
  const doneMap = new Map();                 // id → 최근 완성 날짜 (뒤 항목이 최신)
  for (const c of sky.constellations || []) doneMap.set(c.id, c.date);
  const todayId = sky.today ? sky.today.constellationId : null;
  const todayLit = (sky.today && sky.today.litStars) || [];

  skyDexEls.progress.textContent = `${doneMap.size}/${CONSTELLATIONS.length}`;

  skyDexEls.grid.innerHTML = '';
  for (const con of CONSTELLATIONS) {
    const done = doneMap.has(con.id);
    const isToday = con.id === todayId;
    // 완성한 칸만 탭 가능(크게 보기) → button, 나머지는 div
    const cell = document.createElement(done ? 'button' : 'div');
    cell.className = 'sky-dex-cell ' + (done ? 'is-done' : isToday ? 'is-today' : 'is-locked');
    const box = document.createElement('div');
    box.className = 'sky-dex-sky';
    const name = document.createElement('span');
    name.className = 'sky-dex-name';
    name.textContent = con.name;
    const meta = document.createElement('span');
    meta.className = 'sky-dex-meta';
    meta.textContent = done ? `${fmtMd(doneMap.get(con.id))} 완성` : isToday ? '오늘 진행 중' : '미완성';
    cell.append(box, name, meta);
    skyDexEls.grid.appendChild(cell);
    // 오늘 칸은 실제 진행분으로 그려 홈의 twinkle 기준(lastRender)을 오염시키지 않는다.
    const lit = done ? con.stars.map((_, i) => i) : isToday ? todayLit : [];
    renderSky(box, con.id, lit);
    if (done) cell.addEventListener('click', () => openSkyDexModal(con, doneMap.get(con.id)));
  }
}

/** 완성한 별자리를 크게 보기 (오버레이) */
function openSkyDexModal(con, date) {
  const e = skyDexEls;
  e.modalName.textContent = con.name;
  e.modalDate.textContent = date ? `${fmtMd(date)} 완성` : '';
  e.modalSky.setAttribute('aria-label', `${con.name} 별자리`);
  renderSky(e.modalSky, con.id, con.stars.map((_, i) => i));
  e.modal.hidden = false;
}

// ═══════════════════════════════════════════════════════════
// 리마인더 온보딩/설정 UI — 한 화면, 프리셋 + 직접 입력, 상한 3회
// 발송 로직·한계(탭 켜짐 필요)는 reminder.js 참고
// ═══════════════════════════════════════════════════════════
let remindEls = null;
let remindSel = []; // 패널에서 고른 시간들

function initReminderUI() {
  const $ = (id) => document.getElementById(id);
  remindEls = {
    panel: $('remindPanel'), title: $('remindTitle'), presets: $('remindPresets'),
    custom: $('remindCustom'), add: $('remindAdd'), selected: $('remindSelected'),
    note: $('remindNote'), save: $('remindSave'), off: $('remindOff'),
    skip: $('remindSkip'), entry: $('remindEntry'),
  };

  remindEls.presets.innerHTML = REMINDER_PRESETS.map((p) =>
    `<button class="remind-preset" data-time="${p.time}">` +
    `${p.emoji} ${p.label}<span>${p.time}</span></button>`).join('');
  for (const b of remindEls.presets.querySelectorAll('.remind-preset')) {
    b.addEventListener('click', () => toggleRemindTime(b.dataset.time));
  }
  remindEls.add.addEventListener('click', () => {
    if (remindEls.custom.value) toggleRemindTime(remindEls.custom.value);
  });
  remindEls.save.addEventListener('click', () => {
    saveReminder({ times: remindSel, enabled: true });
    closeRemindPanel();
    requestPermission(); // 첫 설정 시에만 실제 프롬프트 — 거부해도 다시 조르지 않음
  });
  remindEls.skip.addEventListener('click', () => {
    // 온보딩 건너뛰기 → 13:00 하나로 조용히 시작 (권한 요청 없음)
    if (!getReminder()) saveReminder({ times: ['13:00'], enabled: true });
    closeRemindPanel();
  });
  remindEls.off.addEventListener('click', () => {
    saveReminder({ enabled: false });
    closeRemindPanel();
  });
  // 칩=토글 헤더. 접힘→탭하면 펼침(미설정=온보딩/설정됨=설정), 펼침→탭하면 그냥 접힘(저장 없음).
  // (부팅 시 자동으로 펼치지 않는다: 알림은 부차 기능, 평소엔 접힌 카드로 둔다.)
  remindEls.entry.addEventListener('click', () => {
    if (remindEls.panel.hidden) openRemindPanel(getReminder() ? 'settings' : 'onboard');
    else closeRemindPanel();
  });

  renderRemindEntry(); // 부팅 시 renderHome은 remindEls 준비 전이라 여기서 첫 렌더
}

function toggleRemindTime(t) {
  if (remindSel.includes(t)) remindSel = remindSel.filter((x) => x !== t);
  else if (remindSel.length < REMINDER_MAX) remindSel = [...remindSel, t].sort();
  renderRemindPanel();
}

function openRemindPanel(mode) {
  const r = getReminder();
  remindSel = (mode === 'settings' && r) ? [...r.times] : [];
  remindEls.title.textContent = mode === 'settings'
    ? '🔔 알림 시간' : '하루 중 언제 손목을 챙기고 싶어요?';
  remindEls.save.textContent = mode === 'settings' ? '저장' : '알림 받기 🔔';
  remindEls.skip.textContent = mode === 'settings' ? '닫기' : '건너뛰기';
  remindEls.off.hidden = !(mode === 'settings' && r && r.enabled);
  remindEls.note.hidden = !isBlocked(r);
  remindEls.panel.hidden = false;
  renderRemindPanel();
  renderRemindEntry(); // 칩은 그대로 헤더로 두고 쉐브론만 펼침 상태로
}

function closeRemindPanel() {
  remindEls.panel.hidden = true;
  renderRemindEntry();
}

function renderRemindPanel() {
  for (const b of remindEls.presets.querySelectorAll('.remind-preset')) {
    b.classList.toggle('is-on', remindSel.includes(b.dataset.time));
  }
  remindEls.selected.innerHTML = remindSel.map((t) =>
    `<button class="remind-chip" data-time="${t}" aria-label="${t} 삭제">${t} ✕</button>`).join('');
  for (const c of remindEls.selected.querySelectorAll('.remind-chip')) {
    c.addEventListener('click', () => toggleRemindTime(c.dataset.time));
  }
  remindEls.save.disabled = remindSel.length === 0;
}

/** 알림 토글 헤더: 켜짐 → "⏰ 시간 알림 · 변경", 꺼짐 → "⏰ 알림 꺼짐 · 켜기",
 *  미설정 → "⏰ 알림 시간 정하기". 항상 보이며 탭으로 아래 패널을 펼치고/접는다
 *  (aria-expanded로 쉐브론 방향을 표시). */
function renderRemindEntry() {
  const e = remindEls?.entry;
  if (!e) return;
  const r = getReminder();
  e.hidden = false; // 토글 헤더 — 펼침/접힘과 무관하게 항상 노출
  e.setAttribute('aria-expanded', String(!remindEls.panel.hidden));
  e.textContent = (r && r.enabled && r.times.length)
    ? `⏰ ${r.times.join(' · ')} 알림 · 변경${isBlocked(r) ? ' (권한 꺼짐)' : ''}`
    : r                            // 설정했다 끈 상태 vs 아직 미설정을 구분
    ? '⏰ 알림 꺼짐 · 켜기'
    : '⏰ 알림 시간 정하기';
}

/** 홈/알림 → 루틴 원탭 진입 (중간 화면 없이 바로 재생) */
function startRoutineDeep() {
  const r = getTodayRoutine();
  pendingGuideId = nextRoutineExercise(r) || r.ids[0]; // 완주 후 "한 번 더"는 처음부터
  showScreen(SCREENS.GUIDE);
}

function boot() {
  renderHome();

  document.getElementById('routineStart').addEventListener('click', startRoutineDeep);

  initUI();

  onScreenChange((name) => {
    if (name !== SCREENS.MEASURE) stopMeasure();
    if (name !== SCREENS.GUIDE) stopGuide();
    if (name === SCREENS.HOME) renderHome();
    if (name === SCREENS.MEASURE) initMeasure();
    if (name === SCREENS.GUIDE) initGuide();
    if (name === SCREENS.RECORDS) renderRecords();
    if (name === SCREENS.SKY) renderSkyDex();
  });

  initReminderUI();
  startReminderLoop();

  // ?routine=today — 알림 클릭 진입: 홈 건너뛰고 바로 루틴 시작 (이미 완주면 홈 유지)
  const qp = new URLSearchParams(location.search);
  if (qp.get('routine') === 'today' && !isRoutineComplete(getTodayRoutine())) {
    startRoutineDeep();
  }

  console.log('[오늘의 별자리] 부팅 완료');
}

// ═══════════════════════════════════════════════════════════
// 측정 화면: 손목 가동범위(굽힘·폄) 측정 → 저장 (지연 로드)
// 흐름(phase): idle → neutral(중립 잡기) → measure(끝범위 유지-캡처) → result(저장)
// tracking.js/measurement.js의 검증된 로직 재사용. rel<0=굽힘(A), rel>0=폄(B)
// — 이 부호는 왼손 기준. 오른손은 화면상 각도가 거울 반대라 측정 시 부호를 반전한다.
// 손(left/right)은 사용자가 직접 선택한다 — MediaPipe handedness는 측면 뷰에서
// 신뢰할 수 없어 자동 인식을 쓰지 않는다. 마지막 선택은 lastMeasureHand로 기억.
// ═══════════════════════════════════════════════════════════
let measure = null;
let measureIniting = false; // import await 중 재진입으로 리스너가 이중 배선되는 것 방지
const NEUTRAL_MS = 1600; // 중립 자세 유지 시간

/** 카메라/모델 시작 실패를 원인별 한국어 안내로 변환 (기술 원문은 console.error로만).
 *  getUserMedia 오류는 DOMException.name으로 구분 — 그 외(모델 로딩 등)는 일반 안내. */
function cameraErrorMessage(e) {
  const name = e && e.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') {
    return '카메라 사용이 차단되어 있어요. 주소창의 자물쇠 아이콘 → 카메라 → 허용으로 바꾼 뒤 다시 시도해 주세요.';
  }
  if (name === 'NotFoundError' || name === 'NotReadableError' ||
      name === 'DevicesNotFoundError' || name === 'TrackStartError' || name === 'OverconstrainedError') {
    return '카메라를 찾을 수 없어요. 다른 앱이 카메라를 쓰고 있지 않은지 확인해 주세요.';
  }
  return '준비에 실패했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
}

async function initMeasure() {
  if (measure && measure.wired) { setMeasurePhase('idle'); return; }
  if (measureIniting) return;
  measureIniting = true;
  try {
    await wireMeasure();
  } finally {
    measureIniting = false;
  }
}

async function wireMeasure() {
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
    mResult: $('mResult'), rFlex: $('rFlex'), rExt: $('rExt'),
    rDelta: $('rDelta'), rFunc: $('rFunc'), rNarr: $('rNarr'), mAgain: $('mAgain'),
    mHandSel: $('mHandSel'), mHandChip: $('mHandChip'),
  };

  const tracker = createWristTracker('measure');
  const rom = createRomMeasurer();
  const savedHand = load().lastMeasureHand;
  measure = {
    wired: true, tracking, tracker, rom, els, running: false, phase: 'idle', neutralStart: null,
    startGen: 0, // 시작 세대 — 로딩 중 화면 이탈 시 in-flight 시작을 무효화 (카메라 누수·버튼 무반응 방지)
    hand: savedHand === 'left' ? 'left' : 'right', // 측정할 손 — 사용자가 선택 (마지막 선택 기억)
  };

  els.mStart.addEventListener('click', () => startMeasure());
  els.mReneutral.addEventListener('click', () => { if (measure.running) enterNeutral(); });
  els.mFinish.addEventListener('click', () => finishMeasure());
  els.mAgain.addEventListener('click', () => { if (measure.running) enterNeutral(); else startMeasure(); });
  for (const b of els.mHandSel.querySelectorAll('.m-hand-btn')) {
    b.addEventListener('click', () => setHand(b.dataset.hand));
  }
  els.mHandChip.addEventListener('click', () => setHand(measure.hand === 'right' ? 'left' : 'right'));

  renderHandUI();
  setMeasurePhase('idle');
}

async function startMeasure() {
  const m = measure; if (!m || m.running) return;
  const { tracking, els } = m;
  const gen = ++m.startGen; // 이 시작 시도의 세대 — 로딩 중 이탈하면 stopMeasure가 세대를 올림
  try {
    els.camBadge.textContent = '모델 로딩…'; els.mStart.disabled = true;
    await tracking.initModels();
    if (m.startGen !== gen) return;                         // 로딩 중 화면 이탈 → 조용히 중단
    els.camBadge.textContent = '카메라 여는 중…';
    await tracking.startCamera(els.camVideo);
    if (m.startGen !== gen) { tracking.stopCamera(); return; } // 이탈 사이 열렸으면 즉시 끄기
    els.camBadge.textContent = '인식 중';
    m.running = true;
    m.tracker.reset(); m.rom.reset();
    enterNeutral();
    tracking.startLoop(({ hand, pose, now }) => {
      measureFrame(now, m.tracker.update(hand, pose, { usePose: true }));
    }, { pose: true });
  } catch (e) {
    if (m.startGen !== gen) return;                         // 이미 이탈했으면 안내 표시 안 함
    els.camBadge.textContent = '카메라 꺼짐'; els.mStart.disabled = false;
    els.mGuide.textContent = cameraErrorMessage(e);         // 원인별 한국어 안내 (원문은 콘솔로만)
    console.error('[measure] 시작 실패:', e);
  }
}

/** 중립 재수집 시작 */
function enterNeutral() {
  measure.neutralStart = null;
  measure.rom.reset();
  setMeasurePhase('neutral');
}

/** 측정할 손 선택/전환 — 측정 중 전환 시 이미 캡처된 굽힘/폄 값도 서로 맞바꾼다
 *  (거울상 보정 방향이 바뀌면 기존 A/B 캡처의 물리적 의미가 뒤바뀌기 때문) */
function setHand(hand) {
  const m = measure;
  if (!m || (hand !== 'left' && hand !== 'right') || m.hand === hand) return;
  m.hand = hand;
  if (m.phase === 'measure') {
    const st = m.rom.state;
    [st.maxA, st.maxB] = [st.maxB, st.maxA];
    [st.latchA, st.latchB] = [st.latchB, st.latchA];
    st.holdRef = null; st.holdSamp = []; // 진행 중이던 끝범위 유지는 새로 시작
    setCapVal(m.els.capFlexV, st.maxA); setCapVal(m.els.capExtV, st.maxB);
    m.els.mFinish.disabled = !(st.maxA > 0 || st.maxB > 0);
  }
  renderHandUI();
}

/** 손 선택 UI 동기화: idle 선택 버튼 + 측정 중 전환 칩 */
function renderHandUI() {
  const m = measure; if (!m) return;
  for (const b of m.els.mHandSel.querySelectorAll('.m-hand-btn')) {
    b.classList.toggle('is-on', b.dataset.hand === m.hand);
  }
  m.els.mHandChip.textContent =
    `${m.hand === 'right' ? '🫱' : '🫲'} ${HAND_KO[m.hand]} 체크 중 · 바꾸기`;
}

const HAND_KO = { left: '왼손', right: '오른손' };

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
    // 왼손/오른손 거울상 보정 — 옆모습에서 두 손은 거울상이라 굽힘 때 기우는
    // 방향이 반대. rel 부호는 왼손 기준이므로 오른손이면 여기 한 곳에서 반전한다.
    const rel = m.hand === 'right' ? -snap.rel : snap.rel;
    e.mLiveVal.textContent = snap.detected ? fmtLive(rel) : '손을 보여주세요';
    e.mLiveCap.textContent = snap.detected ? '최대한 굽혔다 → 폈다' : '';
    const r = m.rom.feed(rel, now, snap.comp || !snap.detected);
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
  s.measurements.push({ v: 1, at: todayStr(), hand: m.hand, flex, ext, rom: sum });
  s.lastMeasureHand = m.hand; // 다음 측정의 기본 선택
  save(s);
  recordActivity(s); // 측정도 오늘 활동으로 스트릭 반영
  renderStreak();

  e.rFlex.textContent = flex + '°'; e.rExt.textContent = ext + '°';

  // 기능 기준(일상생활 참고) — 진척률만 표시. "정상인 대비 %"·"N도 남았어요" 같은
  // 부족 표현·처방 금지. 둘 다 기준 이상이면 잘 움직인다고, 아니면 부족한 방향의
  // (측정각 ÷ 기준 × 100) 진척률을(둘 다 미만이면 더 낮은 쪽 하나만) 보여준다.
  const F = FUNCTIONAL_ROM;
  if (flex >= F.flex && ext >= F.ext) {
    e.rFunc.textContent = '일상생활에 필요한 만큼 손목이 잘 움직여요 ✅';
  } else {
    const ratios = [];
    if (flex < F.flex) ratios.push(flex / F.flex);
    if (ext < F.ext) ratios.push(ext / F.ext);
    const pct = Math.round(Math.min(...ratios) * 100);
    e.rFunc.textContent = `일상생활 기준의 ${pct}%까지 왔어요 🌱`;
  }

  if (prev) {
    const f = (d) => `${d > 0 ? '+' : ''}${d}°`;
    e.rDelta.textContent = `지난 체크 대비 굽힘 ${f(flex - prev.flex)} · 폄 ${f(ext - prev.ext)} (참고값)`;
  } else {
    e.rDelta.textContent = '첫 체크예요. 다음부터 지난 기록과 비교해 드려요.';
  }

  // 서사 한 줄 — 이번 주(최근 7일) 루틴 완료 일수. 0회면 생략(질책 금지).
  const weekN = recentRoutineDays(s.routineLog || [], todayStr());
  e.rNarr.hidden = weekN < 1;
  if (weekN >= 1) {
    e.rNarr.textContent = `이번 주 루틴 ${weekN}회 완료 — 꾸준함이 기록으로 이어지고 있어요 🌱`;
  }

  setMeasurePhase('result');
}

/** 최근 days일(오늘 포함) 안의 루틴 완료 일수 — routineLog 엔트리 1개 = 완료한 하루 */
function recentRoutineDays(log, date, days = 7) {
  const end = Date.parse(`${date}T00:00:00`);
  if (Number.isNaN(end)) return 0;
  return log.filter((l) => {
    const d = Date.parse(`${l.at}T00:00:00`);
    if (Number.isNaN(d)) return false;
    const diff = Math.round((end - d) / 86400000);
    return diff >= 0 && diff < days;
  }).length;
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
  show(e.mHandChip, phase === 'neutral' || phase === 'measure');
  show(e.mComp, false);

  if (phase === 'idle') {
    show(e.mGuide, true);
    e.mGuide.textContent = '손목을 옆에서 보이게 하고(팔꿈치까지 나오면 더 좋아요), 체크를 시작하세요.';
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
  m.startGen++;                 // 진행 중이던 시작(모델 로딩·카메라 열기)을 무효화
  m.tracking.stopTracking();    // 로딩 중 이탈이라도 카메라를 확실히 끈다 (백그라운드 점등 방지)
  m.running = false;
  m.neutralStart = null;
  setMeasurePhase('idle');
}

// ═══════════════════════════════════════════════════════════
// 가이드 화면: 목록 + 플레이어 (지연 로드)
// ═══════════════════════════════════════════════════════════
let guide = null; // { mods, els, ... }

// 데스크톱(≥960px)에선 카메라를 오른쪽 열 상단으로 승격, 모바일은 시범 위 PiP 오버레이.
// 순수 CSS로는 grid 셀 간 이동이 안 돼(부모가 달라야 함) 뷰포트에 맞춰 DOM만 옮긴다.
// 요소 참조(video/lm/cam)는 그대로라 그리기 루프·스트림은 영향받지 않는다.
const GP_DESKTOP_MQ = window.matchMedia('(min-width:960px)');
function layoutPip() {
  const g = guide; if (!g || !g.els) return;
  const { pip, player, stage, text, video } = g.els;
  if (GP_DESKTOP_MQ.matches) {
    if (pip.parentElement !== player) player.insertBefore(pip, text); // 오른쪽 열 상단
  } else if (pip.parentElement !== stage) {
    stage.appendChild(pip); // 시범 캔버스 위 PiP
  }
  if (g.running) video.play?.().catch(() => {}); // 이동 후 일시정지 대비
}

/** 손 감지 칩 — 아이콘 + 라벨 분리(좁은 화면은 CSS가 라벨만 숨겨 아이콘만 노출) */
function setCamChip(ico, txt, ok) {
  const e = guide?.els; if (!e) return;
  e.camIco.textContent = ico;
  e.camTxt.textContent = txt;
  e.cam.classList.toggle('ok', !!ok);
}

/** 회수 표시 — 큰 숫자 "N/reps회" (reps 0이면 숨김: intro/outro 등 비카운트 스텝) */
function setCount(count, reps) {
  const e = guide?.els; if (!e) return;
  if (!reps) { e.count.hidden = true; return; }
  e.count.hidden = false;
  e.countNum.textContent = `${count}/${reps}`;
}

async function initGuide() {
  if (guide && guide.wired) { consumeAutoStart(); return; }
  const tracking = await import('./tracking.js');
  const { GUIDES, getGuide } = await import('./guide/guideData.js');
  const { drawGuideHand } = await import('./guide/guideHand.js');
  const { createAnimPlayer } = await import('./guide/animPlayer.js');
  const { createStepEngine } = await import('./guide/stepEngine.js');
  const { createWristTracker } = await import('./measurement.js');

  const $ = (id) => document.getElementById(id);
  const els = {
    list: $('guideList'), player: $('guidePlayer'), canvas: $('guideCanvas'),
    stage: $('gpStage'), video: $('guideVideo'), cam: $('gpCam'),
    camIco: $('gpCamIco'), camTxt: $('gpCamTxt'), pip: $('gpPip'), lm: $('gpLm'),
    name: $('gpName'), step: $('gpStep'), count: $('gpCount'), countNum: $('gpCountNum'),
    priv: $('gpPriv'),
    text: $('gpText'), dots: $('gpDots'), hint: $('gpHint'), idle: $('gpIdle'),
    skip: $('gpSkip'), quit: $('gpQuit'), done: $('gpDone'), toList: $('gpToList'),
    retry: $('gpRetry'), proceed: $('gpProceed'),
    doneEmoji: $('gpDoneEmoji'), doneText: $('gpDoneText'), rest: $('gpRest'),
    routineProg: $('gpRoutineProg'), next: $('gpNext'), measureGo: $('gpMeasureGo'),
    doneSub: $('gpDoneSub'),
    condition: $('gpCondition'), condSkip: $('gpCondSkip'),
    safe: document.querySelector('.gp-safe'), btns: document.querySelector('.gp-btns'),
  };

  guide = {
    wired: true, tracking, mods: { drawGuideHand, createAnimPlayer, createStepEngine, createWristTracker, getGuide },
    els, ctx: els.canvas.getContext('2d'),
    engine: null, tracker: null, anim: null, cur: null, running: false, neutralTimer: null,
    lastParams: null, poseBlend: null,
    routineMode: false, autoNextTimer: null, // 루틴 연속 재생 상태
    handSeen: false, seenN: 0, lostN: 0,     // 손 감지 칩 히스테리시스
    lmCtx: null, diagAt: 0,
    compN: 0, frameN: 0, lastCompRatio: null, // 세션 comp 비율 (추후 코칭 힌트용)
    neutralWait: null, baseWrist: null,       // ⓑ 중립 대기 / ⓐ 중립 시점 손목 기준점
    startGen: 0, // 시작 세대 — 로딩 중 화면 이탈 시 in-flight 시작 무효화 (카메라 누수 방지)
  };

  // 목록 구성
  els.list.innerHTML = '';
  for (const g of GUIDES) {
    const b = document.createElement('button');
    b.className = 'guide-card';
    b.dataset.guideId = g.id;
    b.innerHTML = `<span class="gc-emoji">${g.emoji}</span><span class="gc-name">${g.name}</span>` +
                  `<span class="gc-badge" hidden></span>`;
    b.addEventListener('click', () => startGuide(g.id, false));
    els.list.appendChild(b);
  }

  // 버튼
  els.quit.addEventListener('click', () => {
    // 루틴 모드: [오늘은 여기까지] — 중간에 끝내도 그날 완료로 인정 (관대함)
    if (guide.routineMode) endRoutineToday();
    else showGuideList();
  });
  els.toList.addEventListener('click', () => showGuideList());
  els.skip.addEventListener('click', () => { if (guide.engine) guide.engine.skip(performance.now()); });
  els.proceed.addEventListener('click', () => { if (guide.engine) guide.engine.skip(performance.now()); });
  els.retry.addEventListener('click', () => { guide.els.idle.hidden = true; });
  els.next.addEventListener('click', () => {
    if (guide.routineNextId) startGuide(guide.routineNextId, guide.routineMode);
  });
  // 컨디션 기록: 탭 즉시 저장 → 완료 화면 (추가 질문 없음)
  for (const b of els.condition.querySelectorAll('.gp-cond-btn')) {
    b.addEventListener('click', () => {
      recordCondition(b.dataset.cond);
      finishConditionAsk(b.dataset.cond);
    });
  }
  els.condSkip.addEventListener('click', () => finishConditionAsk(null));

  // 카메라 배치: 최초 1회 + 뷰포트가 데스크톱↔모바일 경계를 넘을 때 재배치
  layoutPip();
  GP_DESKTOP_MQ.addEventListener('change', layoutPip);

  consumeAutoStart();
}

/** 홈 딥스타트 소비 — 로딩 중 홈 복귀 시 오발화 방지(화면 재확인) */
function consumeAutoStart() {
  const id = pendingGuideId;
  pendingGuideId = null;
  if (id && getCurrentScreen() === SCREENS.GUIDE) startGuide(id, true); // 홈 원탭 = 루틴 모드
  else showGuideList();
}

function showGuideList() {
  if (!guide) return;
  stopGuideSession();
  refreshGuideBadges();
  guide.els.player.hidden = true;
  guide.els.list.hidden = false;
}

/** 목록 카드에 "오늘의 루틴" / "완료 🌸" 배지 반영 */
function refreshGuideBadges() {
  const r = getTodayRoutine();
  for (const card of guide.els.list.children) {
    const badge = card.querySelector('.gc-badge');
    if (!badge) continue;
    const slot = r.ids.indexOf(card.dataset.guideId);
    if (slot < 0) { badge.hidden = true; continue; }
    const done = isSlotDone(r, slot);
    badge.textContent = done ? '완료 🌸' : '오늘의 루틴';
    badge.classList.toggle('gc-badge--done', done);
    badge.hidden = false;
  }
}

async function startGuide(id, routineMode = false) {
  const g = guide.mods.getGuide(id);
  if (!g) return;
  const { els, ctx, mods } = guide;
  const gen = ++guide.startGen; // 이 시작 시도의 세대 — 로딩 중 이탈 시 stopGuideSession이 올림
  clearTimeout(guide.autoNextTimer);
  guide.routineMode = routineMode;
  // 루틴 모드에선 그만두기 대신 [오늘은 여기까지] — 언제 끝내도 괜찮다는 신호
  els.quit.textContent = routineMode ? '오늘은 여기까지' : '그만두기';
  // 연속 진행(다음 운동): 카메라·스트림은 유지하고 감지 루프만 교체.
  // startLoop는 기존 rAF를 멈추지 않고 startCamera는 스트림을 누수하므로
  // 반드시 stopLoop 후 재시작하고 카메라 재호출은 건너뛴다.
  const chaining = guide.running;
  if (chaining) guide.tracking.stopLoop();
  guide.cur = g;
  guide.lastParams = null;
  guide.poseBlend = null;
  els.list.hidden = true;
  els.player.hidden = false;
  els.done.hidden = true;
  els.condition.hidden = true;
  els.btns.hidden = false;
  els.idle.hidden = true;
  els.name.textContent = `${g.emoji} ${g.name}`;
  els.pip.hidden = false;
  els.priv.hidden = chaining; // 카메라 여는 중엔 안심 안내 노출 (연속 재생은 이미 켜져 있어 생략)
  layoutPip();
  setCamChip('📷', '카메라 여는 중…', false);

  const tracker = mods.createWristTracker('live');
  guide.tracker = tracker;

  const engine = mods.createStepEngine(g, {
    onEnterStep: (step, i, total) => {
      els.step.textContent = `${i + 1}/${total}`;
      els.text.textContent = step.text;
      els.hint.textContent = '';
      els.idle.hidden = true;
      const reps = step.type === 'follow' ? step.reps : 0;
      buildDots(reps);
      setCount(0, reps);
      guide.anim = step.type === 'follow' && step.anim
        ? mods.createAnimPlayer(step.anim, step.base || {})
        : null;
      guide.staticPose = step.pose || {};
      // 정적 스텝 진입 시: 직전 프레임 파라미터에서 pose로 0.3s 모핑 (하드컷 방지, 명세서 §7③)
      guide.poseBlend = (!guide.anim && guide.lastParams)
        ? { from: guide.lastParams, start: null }
        : null;
    },
    onCount: (count, reps) => { fillDots(count, reps); setCount(count, reps); if (count > 0) repFeedback(count); },
    // comp는 힌트를 덮지 않는다 — 감지만 집계(관대한 판정, 코칭 힌트는 추후)
    onStatus: ({ hint, idle }) => {
      els.hint.textContent = hint || '';
      els.hint.classList.remove('warn');
      els.idle.hidden = !idle;
    },
    // ⓑ 중립 견고화: 고정 타이머 대신 "손이 보이는 프레임"이 충분히 모이면
    //   루프에서 commit (미감지 시 타임아웃까지 연기 — 허공 중립 방지)
    onNeedNeutral: () => {
      els.text.textContent = '준비… 손을 편하게 보여주세요';
      tracker.beginNeutral();
      guide.neutralWait = { frames: 0, started: performance.now() };
    },
    onComplete: () => onGuideComplete(g),
  });
  guide.engine = engine;

  try {
    if (!chaining) {
      await guide.tracking.initModels();
      if (guide.startGen !== gen) return;                          // 로딩 중 화면 이탈 → 중단
      await guide.tracking.startCamera(els.video);
      if (guide.startGen !== gen) { guide.tracking.stopCamera(); return; } // 이탈 사이 열렸으면 끄기
    }
    guide.handSeen = false; guide.seenN = 0; guide.lostN = 0;
    guide.compN = 0; guide.frameN = 0; // 세션 comp 비율 집계 (추후 코칭 힌트용)
    guide.neutralWait = null; guide.baseWrist = null;
    els.priv.hidden = true; // 스트리밍 시작 → 안심 안내 숨김
    setCamChip('🖐', '손을 화면에 보여주세요', false);
    guide.running = true;
    engine.start(performance.now());
    guide.tracking.startLoop(({ hand, pose, handLabel, now }) => {
      // 시범 손 그리기 (정적 스텝 진입 직후엔 직전 자세에서 모핑)
      let params = guide.anim ? guide.anim.sample(now) : (guide.staticPose || {});
      if (!guide.anim && guide.poseBlend) params = blendPose(guide, params, now);
      guide.lastParams = params;
      drawStage(ctx, guide.els.canvas, mods.drawGuideHand, params, g.view, now);
      // 인식 가시화: 감지 칩(히스테리시스) + 관절점 오버레이
      updateHandStatus(!!hand);
      drawLandmarks(hand);
      // 사용자 인식 → 스텝 진행.
      // 가이드는 usePose를 끈다(A안): 팔꿈치 인식이 오락가락하면 각도 좌표계가
      // "팔뚝 상대각 ↔ 화면 절대각"으로 뒤바뀌어 rel이 ±90°대로 튀는 문제의 근본 원인.
      // 절대각 단일 좌표계로 고정 (손목 체크 화면은 기존 usePose 유지 — 별도 경로).
      const snap = tracker.update(hand, pose, { usePose: false });

      // ⓑ 중립 대기: 손이 보이는 프레임이 모여야 commit.
      //   손을 전혀 못 본 채 타임아웃되면 commit하지 않고(중립=null 방지) 창만 갱신해
      //   계속 기다린다 — 진행을 원하면 [건너뛰기]가 항상 있다.
      const nw = guide.neutralWait;
      if (nw) {
        if (snap.detected) nw.frames++;
        const timedOut = now - nw.started > NEUTRAL_MAX_MS;
        if (nw.frames >= NEUTRAL_FRAMES || (timedOut && nw.frames >= 3)) {
          guide.neutralWait = null;
          tracker.commitNeutral();
          guide.baseWrist = hand ? { x: hand[HAND_LM.WRIST].x, y: hand[HAND_LM.WRIST].y } : null;
          engine.arm(now);
          guide.els.text.textContent = engine.step?.text || '';
        } else if (timedOut) {
          nw.started = now; nw.frames = 0;
        }
      }

      // ⓐ 가이드 전용 보상동작 지표: 중립 시점 손목점 대비 이동량을
      //   손 크기(손목~중지너클 거리)로 정규화 — 손목만 움직이면 손목점은 고정
      let compMove = 0;
      if (hand && guide.baseWrist) {
        const hw = hand[HAND_LM.WRIST];
        compMove = d2(hw, guide.baseWrist) / (d2(hw, hand[HAND_LM.MIDDLE_MCP]) || 0.001);
      }
      const compG = compMove > GUIDE_COMP_MOVE;
      if (snap.detected) { guide.frameN++; if (compG) guide.compN++; }

      // 진단 로그 — config.DEBUG_GUIDE를 켰을 때만 출력 (손 라벨·상대각·이동 지표)
      if (DEBUG_GUIDE && snap.detected && now - guide.diagAt > 250) {
        guide.diagAt = now;
        console.log(`[guide-diag] label=${handLabel} rel=${snap.rel.toFixed(1)}° move=${compMove.toFixed(2)} comp=${compG}`);
      }
      engine.update(now, snap);
    }, { pose: false });
  } catch (e) {
    if (guide.startGen !== gen) return;                    // 이미 이탈했으면 안내 표시 안 함
    setCamChip('⚠', '오류', false);
    els.text.textContent = cameraErrorMessage(e);          // 원인별 한국어 안내 (원문은 콘솔로만)
    console.error('[guide] 시작 실패:', e);
  }
}

/** 스텝 전환 모핑: 직전 파라미터 → 정적 pose로 0.3s 스무스 블렌드 (숫자 파라미터만) */
function blendPose(guide, to, now) {
  const bl = guide.poseBlend;
  if (bl.start == null) bl.start = now;
  const k = Math.min(1, (now - bl.start) / 300);
  if (k >= 1) { guide.poseBlend = null; return to; }
  const e = k * k * (3 - 2 * k);
  const out = { ...to };
  for (const key in out) {
    const a = bl.from[key];
    if (typeof a === 'number' && typeof out[key] === 'number') out[key] = a + (out[key] - a) * e;
  }
  return out;
}

/** 손 감지 칩 — 몇 프레임 연속일 때만 전환해 깜빡임 방지 */
const HAND_ON_FRAMES = 5, HAND_OFF_FRAMES = 12;
/** ⓑ 중립: 손 보이는 프레임 이 수만큼 모이면 확정 (타임아웃 시 강제) */
const NEUTRAL_FRAMES = 14, NEUTRAL_MAX_MS = 8000;
/** ⓐ 보상동작 임계: 손목점 이동량 / 손 크기 비율 */
const GUIDE_COMP_MOVE = 0.5;
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function updateHandStatus(seen) {
  const g = guide;
  if (seen) { g.seenN++; g.lostN = 0; } else { g.lostN++; g.seenN = 0; }
  const next = g.handSeen ? g.lostN < HAND_OFF_FRAMES : g.seenN >= HAND_ON_FRAMES;
  if (next === g.handSeen) return;
  g.handSeen = next;
  setCamChip(next ? '✓' : '🖐', next ? '손이 잘 보여요' : '손을 화면에 보여주세요', next);
}

/** 인식 관절점 오버레이 — 표시 영상이 거울(scaleX(-1)) + cover 크롭이라
 *  동일 매핑(x = 1 − x, cover 스케일·오프셋)을 적용해야 점이 손 위에 얹힌다 */
function drawLandmarks(hand) {
  const g = guide, cv = g.els.lm, v = g.els.video;
  const cw = cv.clientWidth, ch = cv.clientHeight;
  if (!cw || !ch) return;
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(cw * dpr), H = Math.round(ch * dpr);
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  const ctx = g.lmCtx || (g.lmCtx = cv.getContext('2d'));
  ctx.clearRect(0, 0, W, H);
  if (!hand || !v.videoWidth) return;
  const sc = Math.max(W / v.videoWidth, H / v.videoHeight);
  const ox = (W - v.videoWidth * sc) / 2, oy = (H - v.videoHeight * sc) / 2;
  ctx.fillStyle = 'rgba(183,169,247,.95)';
  ctx.strokeStyle = 'rgba(12,10,26,.55)';
  ctx.lineWidth = 1;
  for (const lm of hand) {
    const x = ox + (1 - lm.x) * v.videoWidth * sc;
    const y = oy + lm.y * v.videoHeight * sc;
    ctx.beginPath(); ctx.arc(x, y, 2 * dpr, 0, 7); ctx.fill(); ctx.stroke();
  }
}

/** 회수 인정 순간 피드백 — 방금 채워진 점 통통 + 카메라 테두리 초록 반짝 */
function repFeedback(count) {
  const g = guide;
  const dot = g.els.dots.children[count - 1];
  if (dot) { dot.classList.remove('pop'); void dot.offsetWidth; dot.classList.add('pop'); }
  const num = g.els.countNum;
  if (num) { num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); }
  g.els.pip.classList.remove('flash'); void g.els.pip.offsetWidth; g.els.pip.classList.add('flash');
}

function drawStage(ctx, canvas, drawGuideHand, params, view, now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 밀도: 시범 손을 살짝 키우고(1.08), 뷰별로 세로 중심을 맞춰 빈 여백을 줄인다.
  // front는 소매가 아래로 길어 무게중심이 아래로 치우쳐, 원점을 살짝 위로 올려 균형.
  const cx = canvas.width / 2;
  const cy = view === 'front' ? canvas.height / 2 - 26 : canvas.height / 2;
  const scale = 1.08;
  ctx.save();
  ctx.fillStyle = 'rgba(160,140,255,.07)';
  ctx.beginPath(); ctx.arc(cx, cy, 120, 0, 7); ctx.fill();
  ctx.restore();
  drawGuideHand(ctx, params, view, { cx, cy, scale, now });
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

/** 세션 comp 비율 집계 마감 — 추후 코칭 힌트 데이터로 승격 예정 */
function flushCompRatio() {
  const g = guide;
  if (!g || !g.frameN) return;
  g.lastCompRatio = Math.round((g.compN / g.frameN) * 100);
  // 진단 로그 — config.DEBUG_GUIDE를 켰을 때만 출력
  if (DEBUG_GUIDE) console.log(`[guide-diag] 세션 comp 비율: ${g.compN}/${g.frameN} (${g.lastCompRatio}%)`);
  g.compN = 0; g.frameN = 0;
}

function onGuideComplete(g) {
  flushCompRatio();
  const e = guide.els;
  e.btns.hidden = true;
  e.idle.hidden = true;
  e.dots.innerHTML = '';
  e.hint.textContent = '';
  e.text.textContent = '';
  e.pip.hidden = true; e.count.hidden = true;
  e.doneSub.hidden = true; // 격려 한 줄은 루틴 마무리(showRoutineDone)에서만
  e.done.hidden = false;
  // 기록 저장 + 스트릭 갱신
  const s = load();
  s.guideDone = s.guideDone || [];
  const entry = { id: g.id, name: g.name, at: todayStr() };
  if (getTodayRoutine(s).ids.includes(g.id)) entry.via = 'routine';
  s.guideDone.push(entry);
  save(s);
  recordActivity(s);   // 오늘 활동으로 스트릭 반영 (루틴 완주와 무관하게 1개면 유지)
  renderStreak();      // 홈 배지 즉시 갱신(홈 복귀 전 반영)

  // 루틴 진행 반영 → 완료 패널: 다음 운동 제안 or 완주 축하
  const r = markRoutineDone(g.id, s);
  const nextId = nextRoutineExercise(r);
  const { done, total } = routineProgress(r);
  guide.routineNextId = nextId;

  e.routineProg.innerHTML = r.ids.map((_, i) =>
    `<span class="gp-dot${isSlotDone(r, i) ? ' on' : ''}"></span>`).join('');
  e.routineProg.hidden = false;

  if (nextId) {
    const ng = guide.mods.getGuide(nextId);
    e.doneEmoji.textContent = '🌟';
    e.doneText.textContent = `잘하셨어요! 오늘의 루틴 ${done}/${total}`;
    e.next.textContent = `다음: ${ng.name} →`;
    e.next.hidden = false;
    e.measureGo.hidden = true;
    // 루틴 모드: 연속 재생 — 잠깐의 완료 비트 후 자동으로 다음 운동
    if (guide.routineMode) {
      clearTimeout(guide.autoNextTimer);
      guide.autoNextTimer = setTimeout(() => {
        if (guide.routineMode && guide.routineNextId && getCurrentScreen() === SCREENS.GUIDE) {
          startGuide(guide.routineNextId, true);
        }
      }, ROUTINE.nextAutoMs);
    }
  } else if (guide.routineMode) {
    askCondition(r);           // 풀코스 완주 — 컨디션 한 화면 → 새싹이 완료 멘트
  } else {
    e.doneEmoji.textContent = '🌼';
    e.doneText.textContent = '오늘의 루틴 완주! 정원이 활짝 피었어요';
    e.next.hidden = true;
    // 측정 "제안" — 괜찮을 때만, 판정 아님
    e.measureGo.hidden = !r.suggestMeasure;
  }
}

/** [오늘은 여기까지] — 중간에 끝내도 그날 완료. 한 것이 없으면 조용히 홈으로 */
function endRoutineToday() {
  const r = getTodayRoutine();
  if (routineProgress(r).done === 0) { showScreen(SCREENS.HOME); return; }
  askCondition(r);
}

/** 루틴 마무리 앞에 컨디션 한 화면 — 이미 오늘 기록했으면 건너뜀 (마찰 제거) */
function askCondition(r) {
  const e = guide.els;
  guide.routineMode = false;
  guide.pendingRoutine = r;
  stopGuideSession();
  const prev = conditionOf();
  if (prev) { showRoutineDone(r, prev.condition); return; }

  e.btns.hidden = true;
  e.idle.hidden = true;
  e.dots.innerHTML = '';
  e.hint.textContent = '';
  e.text.textContent = '';
  e.pip.hidden = true; e.count.hidden = true;
  e.done.hidden = true;
  e.condition.hidden = false;
}

/** 컨디션 탭/건너뛰기 → 완료 화면으로 */
function finishConditionAsk(condition) {
  guide.els.condition.hidden = true;
  showRoutineDone(guide.pendingRoutine || getTodayRoutine(), condition);
}

/** 루틴 마무리 화면 — 새싹이 멘트 + N/6 (풀코스면 ⭐) */
function showRoutineDone(r, condition = null) {
  const e = guide.els;
  guide.routineMode = false;
  stopGuideSession();
  const full = isRoutineComplete(r);

  e.btns.hidden = true;
  e.idle.hidden = true;
  e.dots.innerHTML = '';
  e.hint.textContent = '';
  e.text.textContent = '';
  e.pip.hidden = true; e.count.hidden = true;
  e.condition.hidden = true;
  e.done.hidden = false;
  e.doneEmoji.textContent = full ? '⭐' : '🌱';
  // 숫자(각도·개수) 없이 따뜻한 격려 — 루틴 완료의 끝맛(체크 결과의 담백한 리포트와 대비)
  e.doneText.textContent = full
    ? '오늘 풀코스 완주! 정원이 활짝 피었어요 ⭐'
    : '오늘도 손목에 물 줬어요 🌿 쉬엄쉬엄 가도 좋아요';
  // 격려 한 줄 — 스트릭이 쌓였으면 연속, 아니면 따뜻한 재회 인사 (부족 표현 없음)
  const streak = currentStreak();
  e.doneSub.textContent = streak >= 2
    ? `🔥 ${streak}일 연속 — 잘 돌보고 있어요`
    : '내일 또 물 주러 만나요 🌱';
  e.doneSub.hidden = false;
  // 뻐근해요: 쉬어가도 된다는 한 줄만 (판정·조언 아님)
  e.rest.hidden = condition !== 'stiff';
  e.routineProg.innerHTML = r.ids.map((_, i) =>
    `<span class="gp-dot${isSlotDone(r, i) ? ' on' : ''}"></span>`).join('');
  e.routineProg.hidden = false;
  e.next.hidden = true;
  // 측정 "제안" — 괜찮을 때만, 판정 아님
  e.measureGo.hidden = !(full && r.suggestMeasure);
}

function stopGuideSession() {
  if (!guide) return;
  guide.startGen++;              // 진행 중이던 시작(모델 로딩·카메라 열기)을 무효화
  flushCompRatio();
  clearTimeout(guide.neutralTimer);
  clearTimeout(guide.autoNextTimer);
  guide.tracking.stopTracking(); // 로딩 중 이탈이라도 카메라를 확실히 끈다 (백그라운드 점등 방지)
  guide.running = false;
  guide.engine = null; guide.anim = null; guide.tracker = null;
  guide.handSeen = false; guide.seenN = 0; guide.lostN = 0;
  guide.neutralWait = null; guide.baseWrist = null;
  if (guide.els) {
    setCamChip('📷', '카메라', false);
    guide.els.priv.hidden = true;
    guide.els.pip.classList.remove('flash');
    if (guide.lmCtx) guide.lmCtx.clearRect(0, 0, guide.els.lm.width, guide.els.lm.height);
  }
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
      routineCount: $('recRoutineCount'), routine: $('recRoutine'), routineEmpty: $('recRoutineEmpty'),
      week: $('recWeek'), freeze: $('recFreeze'),
    };
  }
  if (!guideNameMap) {
    const { GUIDES } = await import('./guide/guideData.js');
    guideNameMap = Object.fromEntries(GUIDES.map((g) => [g.id, g.name]));
  }
  const s = load();
  renderTrend(recordsEls, s.measurements || []);
  // 프리즈 사용 표시 — 숨기지 않고 그대로 보여준다 (신뢰)
  recordsEls.freeze.hidden = !freezeUsedThisWeek(s);
  renderWeek(recordsEls, s.conditions || [], s.lastFreezeAt);
  renderRoutineLog(recordsEls, s.routineLog || []);
  renderHistory(recordsEls, s.guideDone || []);
}

/** 최근 7일 컨디션 이모지 행 — 날짜별 표시 (프리즈 날 🧊, 기록 없으면 ·) */
const COND_EMOJI = { good: '😊', soso: '😐', stiff: '😣' };
function renderWeek(e, conditions, freezeAt) {
  const byDate = Object.fromEntries(conditions.map((c) => [c.at, c.condition]));
  const dayName = ['일', '월', '화', '수', '목', '금', '토'];
  const cells = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = todayStr(d);
    const emoji = COND_EMOJI[byDate[key]] || (key === freezeAt ? '🧊' : '·');
    cells.push(`<div class="rw-day${i === 0 ? ' is-today' : ''}">` +
               `<span class="rw-label">${dayName[d.getDay()]}</span>` +
               `<span class="rw-emoji">${emoji}</span></div>`);
  }
  e.week.innerHTML = cells.join('');
}

/** 데일리 루틴 기록: 날짜별 "N/6 완료" (풀코스면 ⭐) */
function renderRoutineLog(e, log) {
  if (!log.length) {
    e.routine.hidden = true; e.routineEmpty.hidden = false; e.routineCount.textContent = '';
    return;
  }
  e.routineEmpty.hidden = true; e.routine.hidden = false;
  const full = log.filter((l) => l.done >= l.total).length;
  e.routineCount.textContent = `총 ${log.length}일 · 완주 ${full}회`;

  const recent = [...log].reverse().slice(0, 14);
  e.routine.innerHTML = recent.map((l) => {
    const star = l.done >= l.total ? ' ⭐' : '';
    return `<li class="rh-item"><span class="rh-date">${fmtMd(l.at)}</span>` +
           `<span class="rh-name">${l.done}/${l.total} 완료${star}</span></li>`;
  }).join('');
}

function renderTrend(e, ms) {
  if (!ms.length) {
    e.trendWrap.hidden = true; e.trendEmpty.hidden = false; e.range.textContent = '';
    return;
  }
  e.trendEmpty.hidden = true; e.trendWrap.hidden = false;

  const flexes = ms.map((m) => m.flex || 0);
  const exts = ms.map((m) => m.ext || 0);
  const last = ms[ms.length - 1];
  const prev = ms[ms.length - 2] || null;
  const pair = (f, x) =>
    `<i class="rec-dot rec-dot--flex"></i>${f} <i class="rec-dot rec-dot--ext"></i>${x}`;

  e.latest.innerHTML = pair((last.flex || 0) + '°', (last.ext || 0) + '°');
  e.best.innerHTML = pair(Math.max(...flexes) + '°', Math.max(...exts) + '°');
  if (prev) {
    const sgn = (d) => (d > 0 ? '+' : '') + d + '°';
    e.delta.innerHTML = pair(sgn((last.flex || 0) - (prev.flex || 0)),
                             sgn((last.ext || 0) - (prev.ext || 0)));
  } else {
    e.delta.textContent = '—';
  }
  e.range.textContent = ms.length > 1 ? `${fmtMd(ms[0].at)} ~ ${fmtMd(last.at)}` : fmtMd(last.at);
  e.trendHint.textContent = ms.length < 2 ? '체크를 2번 이상 하면 변화 추이가 그려져요.' : `총 ${ms.length}회 체크 · 참고값`;

  drawTrend(e.canvas, [
    { data: flexes, color: '#b7a9f7', label: '굽힘' }, // --moss-dd
    { data: exts, color: '#5ab0e8', label: '폄' },     // --water-d
  ]);
}

/** 굽힘/폄(°) 시계열을 시간순 라인차트로 그림 — series: [{data, color, label}] */
function drawTrend(canvas, series) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 460, cssH = 170;
  canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  ctx.font = '10px Jua, sans-serif';
  const labelW = Math.max(...series.map((s) => ctx.measureText(s.label).width));
  const padL = 34, padR = 9 + labelW + 8, padT = 14, padB = 22;
  const w = cssW - padL - padR, h = cssH - padT - padB;
  const n = series[0].data.length;
  const all = series.flatMap((s) => s.data);

  let mn = Math.min(...all), mx = Math.max(...all);
  if (mn === mx) { mn -= 10; mx += 10; }
  const gap = (mx - mn) * 0.15; mn = Math.max(0, mn - gap); mx += gap;

  const X = (i) => padL + (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const Y = (v) => padT + h - ((v - mn) / (mx - mn)) * h;

  // 기준선 3개 + y라벨
  ctx.textBaseline = 'middle';
  for (let g = 0; g <= 2; g++) {
    const val = mn + (mx - mn) * g / 2, yy = Y(val);
    ctx.strokeStyle = 'rgba(180,175,230,.14)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + w, yy); ctx.stroke();
    ctx.fillStyle = '#a5a2ce'; ctx.fillText(Math.round(val) + '°', 4, yy);
  }

  // 선
  for (const s of series) {
    ctx.beginPath();
    s.data.forEach((v, i) => { const x = X(i), y = Y(v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = s.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  }

  // 점 (마지막 강조, 흰 테두리로 겹침 구분)
  for (const s of series) {
    s.data.forEach((v, i) => {
      const x = X(i), y = Y(v), lastPt = i === n - 1;
      ctx.beginPath(); ctx.arc(x, y, lastPt ? 5 : 3.5, 0, 7);
      ctx.fillStyle = s.color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
    });
  }

  // 끝점 라벨 — 겹치면 위아래로 밀어냄
  const ys = series.map((s) => Y(s.data[n - 1]));
  for (let a = 0; a < ys.length; a++) for (let b = a + 1; b < ys.length; b++) {
    const d = ys[b] - ys[a];
    if (Math.abs(d) < 12) { const push = (12 - Math.abs(d)) / 2; ys[a] += d >= 0 ? -push : push; ys[b] += d >= 0 ? push : -push; }
  }
  ctx.fillStyle = '#eae7fb';
  series.forEach((s, k) => ctx.fillText(s.label, X(n - 1) + 9, ys[k]));
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
