// ═══════════════════════════════════════════════════════════
// guideData.js — 가이드 콘텐츠 (명세서 §4·§5)
// 가이드 추가 = 이 배열에 항목 추가 (플레이어·엔진은 공용).
// anim: [[t(s), {param부분집합}], ...]  base: 애니메이션에 없는 고정 파라미터
// ═══════════════════════════════════════════════════════════

export const GUIDES = [
  // ① 손목 굽힘·폄 (side) — 마일스톤
  {
    // 이름에 '스트레칭'을 쓰지 않는다 — 이 운동은 끝범위 유지가 없는 능동 가동(AROM)이라
    // 스트레칭이 아니다. 유지 있는 정적 스트레칭은 timed 스텝의 별도 운동으로 둔다.
    id: 'flex_ext', name: '손목 굽혔다 펴기', view: 'side', emoji: '✋', cat: 'mobility', short: '굽힘·폄',
    steps: [
      { type: 'intro', text: '팔을 편하게 두고 손에 힘을 빼요', dur: 3, pose: { wristAngle: 0, curl: 0.15 } },
      {
        type: 'follow', text: '천천히 굽혔다 펴세요', reps: 5, detect: 'flexExt',
        base: { curl: 0.15 },
        anim: [[0, { wristAngle: 0 }], [1.5, { wristAngle: -35 }], [2.5, { wristAngle: -35 }],
               [4, { wristAngle: 30 }], [5, { wristAngle: 30 }], [6, { wristAngle: 0 }]],
      },
      { type: 'outro', text: '잘했어요! 가볍게 털어주세요', dur: 3, pose: { wristAngle: 0, curl: 0.15 } },
    ],
  },

  // ② 좌우 편위 (front)
  {
    id: 'deviation', name: '손목 좌우 편위', view: 'front', emoji: '🖐️', cat: 'mobility', short: '좌우 편위',
    steps: [
      { type: 'intro', text: '손을 카메라 정면으로 향해 주세요', dur: 3, pose: { devAngle: 0, spread: 0.5 } },
      {
        type: 'follow', text: '엄지쪽·새끼쪽으로 번갈아 기울여요', reps: 5, detect: 'deviation',
        base: { spread: 0.5 },
        anim: [[0, { devAngle: 0 }], [1.2, { devAngle: -20 }], [2.0, { devAngle: -20 }],
               [3.5, { devAngle: 25 }], [4.3, { devAngle: 25 }], [5.3, { devAngle: 0 }]],
      },
      { type: 'outro', text: '좋아요! 손목을 편하게 풀어요', dur: 3, pose: { devAngle: 0, spread: 0.5 } },
    ],
  },

  // ③ 힘줄 활주: 쫙→갈고리→주먹 (front)
  {
    id: 'tendon_glide', name: '힘줄 활주 운동', view: 'front', emoji: '🤚', cat: 'glide', short: '힘줄 활주',
    steps: [
      { type: 'intro', text: '손바닥을 펴고 시작해요', dur: 3, pose: { curl: 0, curlTip: 0, spread: 0.8 } },
      {
        type: 'follow', text: '쫙 → 갈고리 → 주먹 순서로 바꿔요', reps: 3, detect: 'tendonGlide',
        anim: [[0, { curl: 0, curlTip: 0, spread: 0.8 }], [1.2, { curl: 0, curlTip: 0, spread: 0.8 }],
               [2.0, { curl: 0.15, curlTip: 1.0, spread: 0.5 }], [3.2, { curl: 0.15, curlTip: 1.0, spread: 0.5 }],
               [4.0, { curl: 1.0, curlTip: 1.0, spread: 0.4 }], [5.2, { curl: 1.0, curlTip: 1.0, spread: 0.4 }],
               [6.0, { curl: 0, curlTip: 0, spread: 0.8 }]],
      },
      { type: 'outro', text: '수고했어요! 손을 털어요', dur: 3, pose: { curl: 0, curlTip: 0, spread: 0.8 } },
    ],
  },

  // ④ 핀치 (front)
  {
    id: 'pinch_hold', name: '핀치 집기', view: 'front', emoji: '🤏', cat: 'hold', short: '핀치',
    steps: [
      { type: 'intro', text: '엄지와 검지를 준비해요', dur: 3, pose: { pinchGap: 1, spread: 0.4 } },
      {
        type: 'follow', text: '엄지·검지로 집고 잠깐 유지해요', reps: 5, detect: 'pinchHold',
        base: { spread: 0.4 },
        anim: [[0, { pinchGap: 1 }], [0.8, { pinchGap: 0 }], [2.8, { pinchGap: 0 }], [3.4, { pinchGap: 1 }]],
      },
      { type: 'outro', text: '잘했어요! 손가락을 펴 주세요', dur: 3, pose: { pinchGap: 1, spread: 0.4 } },
    ],
  },

  // ⑤ 악력 유지 (front)
  {
    id: 'grip_hold', name: '악력 유지', view: 'front', emoji: '✊', cat: 'hold', short: '악력',
    steps: [
      { type: 'intro', text: '손을 편하게 펴 주세요', dur: 3, pose: { curl: 0.2, spread: 0.4 } },
      {
        type: 'follow', text: '주먹을 꽉 쥐고 잠깐 유지해요', reps: 5, detect: 'gripHold',
        base: { spread: 0.4 }, // intro/outro pose와 동일하게 (스텝 전환 시 점프 방지)
        anim: [[0, { curl: 0.2 }], [0.6, { curl: 1.0 }], [3.6, { curl: 1.0 }], [4.4, { curl: 0.2 }]],
      },
      { type: 'outro', text: '수고했어요! 손을 털어요', dur: 3, pose: { curl: 0.2, spread: 0.4 } },
    ],
  },

  // ⑥ 손가락 벌리기 (front)
  {
    id: 'finger_spread', name: '손가락 벌리기', view: 'front', emoji: '🖐️', cat: 'glide', short: '벌리기',
    steps: [
      { type: 'intro', text: '손바닥을 펴 주세요', dur: 3, pose: { spread: 0.3, curl: 0 } },
      {
        // detect는 반드시 fingerSpread — tendonGlide를 쓰면 카운트가 구조적으로 0이 된다.
        // (tendonGlide의 poseOf는 grip>1.45면 무조건 'open'이라, 손을 편 채 벌렸다 모으는
        //  동안 상태가 'open'에 고정돼 두 번째 게이트 '갈고리'를 영원히 기다린다.)
        type: 'follow', text: '손가락을 활짝 벌렸다 모아요', reps: 5, detect: 'fingerSpread',
        base: { curl: 0 },
        anim: [[0, { spread: 0.3 }], [1, { spread: 1.0 }], [2.5, { spread: 1.0 }], [3.5, { spread: 0.3 }]],
      },
      { type: 'outro', text: '좋아요! 손을 편하게 두세요', dur: 3, pose: { spread: 0.3, curl: 0 } },
    ],
  },

  // ⑦⑧ 전완 스트레칭 (timed · 카메라 없음)
  //
  // 데일리 코스(ROUTINE.course)에 넣지 않는다. 풀코스는 이미 3분 예산이 꽉 찼고,
  // 정적 부하를 끊는 건 지속시간이 아니라 빈도라 — 스트레칭은 하루 한 블록보다
  // 짧게 여러 번이 맞다. 리마인더 마이크로 루틴의 몸통으로 쓴다.
  //
  // ★문구는 임상 파라미터다(안전선). 구현 재량이 아니라 스펙이므로 임의로 다듬지 않는다:
  //   중단 기준·강도 큐·호흡 큐·반동 금지·자세 큐가 각각 행동 가능한 자리에 놓여야 한다.
  //
  // 좌우를 reps 2가 아니라 별도 timed 스텝 둘로 나눈 이유: 한 스텝 안의 라운드에는
  // "이제 반대쪽" 큐를 붙일 자리가 없다(엔진이 라운드별 문구를 갖지 않는다). 스텝을
  // 나누면 기존 배관 그대로 각 팔에 제 문구가 붙는다. dose는 dosable 스텝 '전부'에
  // 같은 값으로 적용되므로 좌우가 어긋나지 않는다(routine.getRoutineGuide).
  //
  // holdCapSec을 반드시 적는다 — 없으면 config 기본값 15가 걸려 base 20이 곧 상한이 되고
  // hold가 영원히 안 오른다(유효상한 = max(cap, base) 가드가 절삭은 막지만 성장은 못 연다).
  // 20 → 30초는 정적 스트레칭 용량 진행의 표준 범위다.
  //
  // ⚠ 알려진 한계: hold가 상한에 닿은 뒤 남는 dose 단계는 reps로 넘어가고, reps 상한은
  //   전역값(ROUTINE.adaptReps.cap = 10)이라 이론상 "한쪽을 10번"까지 오른다. 스트레칭엔
  //   과하다. 지금은 실제로 발생하지 않는다 — 이 운동들은 focusGuide 대상이 아니라
  //   doseLevel이 0에 머문다. 조건부 데일리 슬롯을 붙일 때(항목 5) 스텝별 reps 상한을
  //   같이 넣어야 한다.
  {
    id: 'extensor_stretch', name: '전완 신전근 스트레칭', view: 'side', emoji: '🤲',
    cat: 'stretch', short: '신전근',
    steps: [
      { type: 'intro', text: '팔꿈치를 편 채 손등을 아래로 — 지그시, 튕기지 않고', dur: 5,
        pose: { wristAngle: 0, curl: 0.1 } },
      { type: 'timed', text: '오른팔 · 숨을 천천히 내쉬면서 유지해요',
        hint: '시원하게 당기는 느낌까지만, 통증 직전에서 멈춰요 · 저릿하거나 아프면 바로 멈추세요',
        reps: 1, holdSec: 20, doseAxis: 'hold', holdCapSec: 30,
        pose: { wristAngle: -45, curl: 0.1 } },
      { type: 'timed', text: '왼팔 · 숨을 천천히 내쉬면서 유지해요',
        hint: '시원하게 당기는 느낌까지만, 통증 직전에서 멈춰요 · 저릿하거나 아프면 바로 멈추세요',
        reps: 1, holdSec: 20, doseAxis: 'hold', holdCapSec: 30,
        pose: { wristAngle: -45, curl: 0.1 } },
      { type: 'outro', text: '천천히 풀어요', dur: 3, pose: { wristAngle: 0, curl: 0.1 } },
    ],
  },

  {
    id: 'flexor_stretch', name: '전완 굴곡근 스트레칭', view: 'side', emoji: '🖐',
    cat: 'stretch', short: '굴곡근',
    steps: [
      { type: 'intro', text: '팔꿈치를 편 채 손바닥을 위로 — 지그시, 튕기지 않고', dur: 5,
        pose: { wristAngle: 0, curl: 0.1 } },
      { type: 'timed', text: '오른팔 · 숨을 천천히 내쉬면서 유지해요',
        hint: '시원하게 당기는 느낌까지만, 통증 직전에서 멈춰요 · 저릿하거나 아프면 바로 멈추세요',
        reps: 1, holdSec: 20, doseAxis: 'hold', holdCapSec: 30,
        pose: { wristAngle: 40, curl: 0.05 } },
      { type: 'timed', text: '왼팔 · 숨을 천천히 내쉬면서 유지해요',
        hint: '시원하게 당기는 느낌까지만, 통증 직전에서 멈춰요 · 저릿하거나 아프면 바로 멈추세요',
        reps: 1, holdSec: 20, doseAxis: 'hold', holdCapSec: 30,
        pose: { wristAngle: 40, curl: 0.05 } },
      { type: 'outro', text: '천천히 풀어요', dur: 3, pose: { wristAngle: 0, curl: 0.1 } },
    ],
  },
];

export const getGuide = (id) => GUIDES.find((g) => g.id === id) || null;

/**
 * 이 가이드가 카메라를 필요로 하는가 — follow(인식 카운트) 스텝이 하나라도 있으면 true.
 *
 * timed 전용 가이드(스트레칭 등)는 카메라를 아예 안 켠다. 권한 프롬프트도 뜨지 않는다:
 * 사무실에서 카메라를 켜는 건 사회적 비용이 커서, 그것만으로 안 하게 되는 종류의 마찰이다.
 *
 * ★프레임 구동 경로를 고르는 유일한 기준이기도 하다(main.startGuide). 카메라 루프와
 *  카메라 없는 루프가 동시에 돌면 engine.update가 프레임마다 두 번 불려 timed 타이머가
 *  2배속으로 흐른다 — 육안으로는 "좀 빠른데?" 정도라 알아채기 어렵다. 그래서 시작 지점을
 *  하나로 두고 이 술어로만 분기한다.
 */
export const needsCamera = (g) => !!g && (g.steps || []).some((s) => s.type === 'follow');
