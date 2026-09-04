// ═══════════════════════════════════════════════════════════
// games/session.js — 게임 화면 세션 배관
//
// 게임 파일(starPick 등)은 '그리기와 조작'만 갖는다. 그 바깥의 것 — 어떤 운동의
// 게임인지 · 반복수 · 판정기 · 카메라 생명주기 · 화면 문구 — 은 전부 여기 있다.
// 게임마다 그걸 다시 쓰기 시작하면, 게임이 강도를 스스로 정하는 샛길이 열린다
// (설계서 §2: 게임은 판정·강도를 따로 정하지 않는다).
//
// 어떤 게임이 어떤 운동에 붙는지는 registry.js가 갖는다 — 그 표는 DOM을 안 타서
// 플레인 node 테스트가 검증할 수 있고, 이 파일은 못 한다(카메라·캔버스).
//
// 게임은 새 보상 체계가 아니다. 완주하면 markRoutineDone(대응 guideId) 하나를
// 부르고 끝이며, 별자리 점등은 홈에서 syncStarsToProgress가 기존 경로로 한다
// (점등 주체를 하나로 유지 — 설계서 §1의 이중 계산 방지).
// ═══════════════════════════════════════════════════════════
import { recordActivity } from '../store.js';
import { markRoutineDone } from '../routine.js';
import { createDetector } from '../guide/stepEngine.js';
import { createWristTracker, viewFits } from '../measurement.js';
import { NEUTRAL, VIEW_FIT } from '../config.js';
import * as tracking from '../tracking.js';
import { GAME_REGISTRY, ABSENT_LEAD, pickGame, gameReps } from './registry.js';

let s = null;   // 세션 상태 — enterGame에서 한 번 만든다

// ─── 화면 ─────────────────────────────────────────────────
function collectEls() {
  const $ = (id) => document.getElementById(id);
  return {
    canvas: $('gmCanvas'), idle: $('gmIdle'), pip: $('gmPip'), video: $('gmVideo'),
    camIco: $('gmCamIco'), camTxt: $('gmCamTxt'), priv: $('gmPriv'),
    hint: $('gmHint'), lead: $('gmLead'), slot: $('gmSlot'),
    title: $('gmTitle'), exName: $('gmExName'),
    idleEmoji: $('gmIdleEmoji'), idleTitle: $('gmIdleTitle'), idleText: $('gmIdleText'),
    count: $('gmCount'), countNum: $('gmCountNum'),
    countOf: document.querySelector('#gmCount .gm-count-of'),
    start: $('gmStart'), quit: $('gmQuit'),
  };
}

function setCam(ico, txt) {
  if (!s?.els) return;
  s.els.camIco.textContent = ico;
  s.els.camTxt.textContent = txt;
}

export function renderIdle() {
  if (!s?.els) return;
  const e = s.els, st = pickGame();
  e.idle.hidden = false;
  e.pip.hidden = true;
  e.priv.hidden = true;
  e.hint.textContent = '';
  e.quit.hidden = true;
  e.start.hidden = false;
  s.id = st.id;

  if (st.kind === 'absent') {
    // 루틴에 없는 운동을 게임으로 시키지 않는다 — 완료로 기록될 슬롯이 없다.
    // 지목할 게임이 없으므로 문구도 게임 이름을 안 쓴다. 여기서 안 채우면
    // index.html의 첫 페인트용 문구("게임을 불러오는 중이에요")가 그대로 남는다.
    e.title.textContent = '🎮 오늘의 게임';
    e.exName.textContent = '🎮 오늘의 게임';
    e.idleEmoji.textContent = '🌙';
    e.idleTitle.textContent = '오늘은 게임이 쉬어요';
    e.idleText.textContent = '내일 다시 만나요.';
    e.slot.textContent = '오늘은 쉬어요';
    e.lead.textContent = ABSENT_LEAD;
    e.count.hidden = true;
    e.start.disabled = true;
    return;
  }

  const def = GAME_REGISTRY[st.id];
  e.title.textContent = def.title;
  e.exName.textContent = def.exName;
  e.idleEmoji.textContent = def.idleEmoji;
  e.idleTitle.textContent = def.idleTitle;
  e.idleText.innerHTML = def.idleText;   // 이 파일의 리터럴만 들어온다(사용자 입력 없음)

  s.reps = gameReps(st.id);
  e.count.hidden = false;
  e.start.disabled = false;
  e.countNum.textContent = '0';
  if (e.countOf) e.countOf.textContent = `/ ${s.reps}`;

  if (st.kind === 'done') {
    s.practice = true;
    e.slot.textContent = '오늘 몫 완료';
    e.lead.textContent = def.practiceLead;
    e.start.textContent = '한 번 더';
  } else {
    s.practice = false;
    e.slot.textContent = '오늘의 루틴 중 하나';
    e.lead.textContent = def.lead;
    e.start.textContent = '시작하기';
  }
}

// ─── 중립 잡기 (각도 판정 게임 전용) ──────────────────────
/**
 * 한 프레임 처리 — 중립이 확정되면 true, 아직이면 false(아직 게임을 시작하지 않는다).
 *
 * 규칙은 가이드 화면과 같다(config.NEUTRAL): 손이 보이는 프레임이 충분히 모이면 확정하고,
 * 타임아웃이어도 최소 몇 프레임은 봐야 확정한다 — 허공을 중립으로 잡지 않기 위해서다.
 * 규칙이 갈리면 "가이드에선 잡히는데 게임에선 안 잡히는" 자리가 생긴다.
 *
 * 자세 게이트가 앞에 붙는 이유: 어긋난 자세로 모은 중립은 기준 자체가 틀어진다.
 * 측정 화면과 같은 관대함을 쓴다 — relaxMs 동안은 붙잡고, 그 뒤에는 놓아준다.
 *
 * ★게이트에 걸리는 동안 수집을 '버리고' 다시 시작하는 것이 핵심이다. tracker의 중립
 *   버퍼는 update()마다 쌓이므로, 게이트만 걸고 버퍼를 안 비우면 어긋난 자세의 표본이
 *   그대로 평균에 들어간다(측정 화면이 beginNeutral을 다시 부르는 것과 같은 이유).
 */
function stepNeutral(n, snap, now, tracker, def, e) {
  if (def.view) {
    if (viewFits(snap.fingers, def.view)) {
      n.badSince = null;
    } else {
      if (n.badSince == null) n.badSince = now;
      if (now - n.badSince < VIEW_FIT.relaxMs) {
        n.collecting = false; n.frames = 0;   // 모으던 것을 버린다
        e.hint.textContent = def.viewHint;
        return false;
      }
      // relaxMs 초과 — 자세를 못 맞추는 사람을 게임에서 배제하지 않는다. 그냥 진행한다.
    }
  }

  if (!n.collecting) {
    tracker.beginNeutral();
    n.collecting = true; n.frames = 0; n.started = now;
    e.hint.textContent = '준비… 손을 편하게 보여주세요';
  }
  if (snap.detected) n.frames++;

  const timedOut = now - n.started > NEUTRAL.maxMs;
  if (n.frames >= NEUTRAL.frames || (timedOut && n.frames >= NEUTRAL.minFrames)) {
    tracker.commitNeutral();
    return true;
  }
  // 손을 전혀 못 본 채 타임아웃 — 확정하지 않고 창만 새로 연다(진행을 원하면 [그만하기]가 있다)
  if (timedOut) { tracker.beginNeutral(); n.frames = 0; n.started = now; }
  return false;
}

// ─── 세션 ─────────────────────────────────────────────────
async function startSession() {
  if (!s || s.running) return;
  const st = pickGame();
  if (st.kind === 'absent') return;
  const e = s.els, def = GAME_REGISTRY[st.id];
  const gen = ++s.startGen;

  s.id = st.id;
  s.practice = st.kind === 'done';
  s.reps = gameReps(st.id);
  if (e.countOf) e.countOf.textContent = `/ ${s.reps}`;
  e.countNum.textContent = '0';
  e.start.hidden = true;
  e.quit.hidden = false;
  e.idle.hidden = true;
  e.pip.hidden = false;
  e.priv.hidden = false;
  setCam('📷', '카메라 여는 중…');

  const tracker = createWristTracker('live');
  s.tracker = tracker;
  // 판정기는 가이드와 같은 것 — 임계값·유지시간을 게임이 따로 정하지 않는다
  const detector = createDetector(def.detect);

  let createGame;
  try {
    createGame = await def.load();
    if (s.startGen !== gen) return;                              // 이탈 → 중단
  } catch (err) {
    console.error('[game] 게임 모듈을 불러오지 못했습니다', err);
    e.hint.textContent = '게임을 불러오지 못했어요. 새로고침해 주세요.';
    stopSession(); renderIdle();
    return;
  }

  const inst = createGame({
    canvas: e.canvas,
    reps: s.reps,
    detector,
    onCount: (n) => { e.countNum.textContent = String(n); },
    onHint: (h) => { e.hint.textContent = h; },
    onDone: () => onDone(),
  });
  s.game = inst;

  try {
    await tracking.initModels();
    if (s.startGen !== gen) return;                              // 이탈 → 중단
    await tracking.startCamera(e.video);
    if (s.startGen !== gen) { tracking.stopCamera(); return; }   // 이탈 사이 열렸으면 끄기
  } catch (err) {
    console.warn('[game] 카메라/모델 시작 실패', err);
    e.hint.textContent = '카메라를 열지 못했어요. 권한을 확인해 주세요.';
    stopSession(); renderIdle();
    return;
  }

  e.priv.hidden = true;
  setCam('🖐', '손을 보여주세요');
  s.running = true;
  inst.start();

  // 중립을 잡기 전에는 feed를 부르지 않는다. rel이 0에 고정된 프레임을 판정기에
  // 먹이면 가만히 있는데도 끝점 판정이 서는 수가 있다.
  let neutral = def.needsNeutral
    ? { collecting: false, frames: 0, started: 0, badSince: null }
    : null;
  if (neutral) e.hint.textContent = '준비… 손을 편하게 보여주세요';

  tracking.startLoop(({ hand, pose, now }) => {
    const snap = tracker.update(hand, pose, { usePose: def.usePose });
    if (neutral) {
      if (!stepNeutral(neutral, snap, now, tracker, def, e)) return;
      neutral = null;
      e.hint.textContent = '';
    }
    inst.feed(snap, now);
  });
}

function onDone() {
  if (!s) return;
  const e = s.els, def = GAME_REGISTRY[s.id];
  if (s.practice) {
    e.hint.textContent = def.practiceMsg;
  } else {
    markRoutineDone(s.id);
    recordActivity();
    e.hint.textContent = def.doneMsg;
  }
  stopSession();
  e.start.hidden = false;
  e.start.textContent = '한 번 더';
  e.quit.hidden = true;
}

function stopSession() {
  if (!s) return;
  s.startGen++;               // 진행 중이던 시작(모델 로딩·카메라 열기)을 무효화
  tracking.stopTracking();    // 로딩 중 이탈이라도 카메라를 확실히 끈다
  // destroy까지 부른다 — 세션마다 게임이 새 무대(ResizeObserver 포함)를 만들므로
  // stop()만 하면 관찰자가 세션 수만큼 쌓인다.
  s.game?.destroy();
  s.game = null; s.tracker = null;
  s.running = false;
  if (s.els) { s.els.pip.hidden = true; s.els.priv.hidden = true; setCam('📷', '카메라'); }
}

// ─── 화면 진입/이탈 (main.js의 라우터가 부른다) ───────────
export function enterGame() {
  if (!s) {
    s = {
      els: collectEls(), id: null, game: null, tracker: null,
      running: false, practice: false, reps: 0,
      startGen: 0, // 시작 세대 — 로딩 중 이탈 시 in-flight 시작 무효화(카메라 누수 방지)
    };
    s.els.start.addEventListener('click', () => startSession());
    s.els.quit.addEventListener('click', () => { stopSession(); renderIdle(); });
  }
  renderIdle();
}

export function stopGame() {
  if (s) stopSession();
}
