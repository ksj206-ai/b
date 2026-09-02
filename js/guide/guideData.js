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
