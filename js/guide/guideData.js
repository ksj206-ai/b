// ═══════════════════════════════════════════════════════════
// guideData.js — 가이드 콘텐츠 데이터 (GUIDES 배열)
// [가이드 단계 구현 예정] 명세서 §4·§5 참조.
// 가이드 추가 = 이 배열에 항목 추가 (플레이어는 공용).
// ═══════════════════════════════════════════════════════════

export const GUIDES = [
  // 예시 골격 (명세서 §5) — 실제 값은 가이드 단계에서 채움
  // {
  //   id: 'flex_ext', name: '손목 굽힘·폄 스트레칭', view: 'side',
  //   steps: [
  //     { type:'intro',  text:'팔을 편하게 두고 손에 힘을 빼요', dur:3, pose:{ wristAngle:0 } },
  //     { type:'follow', text:'천천히 굽혔다 펴세요', reps:5, detect:'flexExt',
  //       anim:[[0,{wristAngle:0}],[1.5,{wristAngle:-35}],[2.5,{wristAngle:-35}],
  //             [4,{wristAngle:30}],[5,{wristAngle:30}],[6,{wristAngle:0}]] },
  //     { type:'outro',  text:'잘했어요! 가볍게 털어주세요', dur:3, pose:{ wristAngle:0 } },
  //   ],
  // },
];
