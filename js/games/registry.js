// ═══════════════════════════════════════════════════════════
// games/registry.js — "게임 하나 = 운동 하나" 1:1을 담는 유일한 자리
//
// 전에는 main.js에 `const GAME_GUIDE_ID = 'pinch_hold'` 상수 하나로 박혀 있었다.
// 게임이 하나일 때만 성립하는 형태였다.
//
// ★이 파일은 DOM·카메라 모듈을 부르지 않는다. session.js와 갈라놓은 이유가 그것이다 —
//  플레인 node 테스트가 "레지스트리가 가리키는 운동·판정기가 실제로 있는가"를 확인할 수
//  있어야 한다. 캔버스 게임 자체는 자동 검증이 안 되지만, 이 표가 틀리는 것은 잡을 수 있다.
//  (게임 모듈은 load()로 지연 로드하므로 이 파일을 불러오는 것만으로는 딸려오지 않는다.)
//
// 문구가 여기 있는 이유: 게임마다 다르다. 안전 안내(gm-note)와 개인정보 문구는 게임이
// 바뀌어도 같은 말이라 index.html에 남는다.
//
// idleText만 HTML을 받는다(굵게 표시할 조각이 있다). 전부 이 파일의 리터럴이고
// 사용자 입력이 섞이지 않으므로 innerHTML로 넣어도 된다.
// ═══════════════════════════════════════════════════════════
import { load } from '../store.js';
import { getTodayRoutine, getRoutineGuide } from '../routine.js';

export const GAME_REGISTRY = {
  pinch_hold: {
    title: '🌠 별 따기',
    exName: '🤏 오늘의 핀치 집기',
    detect: 'pinchHold',
    // 핀치는 rel(각도)이 아니라 손끝 거리를 본다 — 중립도 자세 게이트도 필요 없다.
    // 손만 보이면 바로 판정된다.
    usePose: false,
    needsNeutral: false,
    view: null,
    viewHint: null,
    load: () => import('./starPick.js').then((m) => m.createStarPick),
    idleEmoji: '🌠',
    idleTitle: '여기에 별이 떠요',
    idleText: '떠도는 별을 <b>엄지와 검지로 집어</b> 잠깐 들고 있으면<br>'
            + '별이 고양이에게 모입니다. 오른쪽 <b>시작하기</b>를 누르면 카메라가 켜집니다.',
    lead: '엄지와 검지로 별을 집어 보세요. 다 모으면 오늘의 핀치 집기를 한 것으로 기록돼요.',
    practiceLead: '오늘 몫은 다 했어요. 이건 그냥 재미로 🌠',
    doneMsg: '다 모았어요! 오늘의 핀치 집기 완료 ✨ 홈에서 별을 확인해 보세요.',
    practiceMsg: '다 모았어요! 오늘 몫은 이미 끝나 있어요 🌠',
  },

  flex_ext: {
    title: '🌟 별 줍기',
    exName: '✋ 오늘의 손목 굽혔다 펴기',
    detect: 'flexExt',
    // 각도(rel) 판정 — 중립을 잡아야 시작된다. 중립이 없으면 rel이 0에 고정돼
    // 판정기가 영원히 안 센다(게임은 도는데 카운트만 안 오르는, 조용한 고장).
    needsNeutral: true,
    // 옆모습 — 손날이 카메라를 봐야 굽힘·폄이 화면 평면에 나온다.
    view: 'side',
    viewHint: '손날이 카메라를 보게 옆으로 세워주세요 ✋',
    // 가이드와 같이 usePose를 끈다: 팔꿈치 인식이 오락가락하면 각도 좌표계가
    // '팔뚝 상대각 ↔ 화면 절대각'으로 뒤바뀌어 rel이 ±90°대로 튄다.
    usePose: false,
    load: () => import('./starScoop.js').then((m) => m.createStarScoop),
    idleEmoji: '🌟',
    idleTitle: '위아래 두 층에 별이 있어요',
    // ★방향을 문구로 못 박지 않는다. 판정기는 화면 기준 rel을 그대로 보고(가이드와 동일),
    //   손별 부호 정규화(flexExtRel)를 쓰지 않는다 — 어느 손이냐에 따라 굽힘이 위로 갈 수도
    //   아래로 갈 수도 있다. 채반이 손을 실시간으로 따라가므로 방향은 한 번 움직이면 안다.
    //   여기서 "펴면 위로"라고 적으면 절반의 사용자에게 틀린 말이 된다.
    idleText: '손목을 천천히 <b>굽혔다 폈다</b> 하면 채반이 위아래로 따라 움직여요.<br>'
            + '두 층의 별을 한 번씩 주우면 1회예요. 오른쪽 <b>시작하기</b>를 누르면 카메라가 켜집니다.',
    lead: '손목을 천천히 굽혔다 펴면서 위아래 두 층의 별을 주워 보세요. 다 채우면 오늘의 손목 굽혔다 펴기를 한 것으로 기록돼요.',
    practiceLead: '오늘 몫은 다 했어요. 이건 그냥 재미로 🌟',
    doneMsg: '다 주웠어요! 오늘의 손목 굽혔다 펴기 완료 ✨ 홈에서 별을 확인해 보세요.',
    practiceMsg: '다 주웠어요! 오늘 몫은 이미 끝나 있어요 🌟',
  },

  deviation: {
    title: '☄️ 유성우 받기',
    exName: '🖐️ 오늘의 손목 좌우 편위',
    detect: 'deviation',
    needsNeutral: true,
    // 정면 — 손바닥이 카메라를 봐야 좌우 편위가 화면 평면에 나온다.
    view: 'front',
    viewHint: '손바닥이 카메라를 보게 돌려주세요 🖐',
    usePose: false,
    load: () => import('./meteorCatch.js').then((m) => m.createMeteorCatch),
    idleEmoji: '☄️',
    idleTitle: '양쪽 끝에 유성이 떠 있어요',
    // 별 줍기와 같은 이유로 좌/우를 문구로 못 박지 않는다(deviationRel을 안 쓴다).
    idleText: '손목을 <b>좌우로 천천히 기울이면</b> 바구니가 따라 움직여요.<br>'
            + '양쪽 끝의 유성을 한 번씩 받으면 1회예요. 오른쪽 <b>시작하기</b>를 누르면 카메라가 켜집니다.',
    lead: '손목을 좌우로 천천히 기울여 양쪽 유성을 받아 보세요. 유성은 재촉하지 않고 기다립니다. 다 채우면 오늘의 손목 좌우 편위를 한 것으로 기록돼요.',
    practiceLead: '오늘 몫은 다 했어요. 이건 그냥 재미로 ☄️',
    doneMsg: '다 받았어요! 오늘의 손목 좌우 편위 완료 ✨ 홈에서 별을 확인해 보세요.',
    practiceMsg: '다 받았어요! 오늘 몫은 이미 끝나 있어요 ☄️',
  },
};

/** 게임 있는 운동이 오늘 코스에 하나도 없을 때 — 특정 게임을 지목할 수 없는 자리다. */
export const ABSENT_LEAD = '오늘 코스에는 게임으로 할 수 있는 운동이 없어요. 내일 다시 만나요 🌙';

// ─── 오늘 무엇을 띄울까 ───────────────────────────────────
/**
 * 오늘 코스에서 '게임이 있는 첫 미완료 운동' 하나만 고른다.
 *
 * state를 인자로 받는 이유: 플레인 node 테스트가 합성 상태로 이 규칙을 확인할 수
 * 있어야 한다. store.load()는 localStorage라 테스트에서 못 부른다.
 *
 * 격자로 늘어놓지 않는 이유: 매일 "뭘 할까"를 묻게 되어 원칙 ②(고민하게 만들면
 * 안 한다)와 충돌한다. 루틴이 다음 하나만 내미는 것과 같은 규칙을 쓴다.
 */
export function pickGame(state = load()) {
  const r = getTodayRoutine(state);
  const ids = r.ids.filter((id) => GAME_REGISTRY[id]);
  if (!ids.length) return { kind: 'absent', r, id: null };
  const todo = ids.find((id) => !r.doneIds.includes(id));
  if (todo) return { kind: 'ready', r, id: todo };
  // 오늘 몫을 다 한 경우 — 마지막 것을 연습 모드로. 보상은 새로 만들지 않는다(설계서 §5).
  return { kind: 'done', r, id: ids[ids.length - 1] };
}

/** 반복수는 게임이 정하지 않는다 — 적응형 dose가 얹힌 루틴 가이드에서 읽는다.
 *  게임이 자기 반복수를 정하면 adapt.doseLevel을 우회하는 샛길이 된다(설계서 §2). */
export function gameReps(id, state = load()) {
  const g = getRoutineGuide(id, state);
  const step = g?.steps.find((st) => st.type === 'follow' && st.reps != null);
  return step?.reps ?? 5;
}
