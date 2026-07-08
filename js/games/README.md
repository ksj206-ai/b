# js/games/

미니게임 모듈 (후속 단계에서 프로토타입 wrist-garden에서 이식).

프로토타입 모드 매핑 (명세서 §9 참조):
- `dig` — 두더지 잡기 (flexExt + armed 게이트)
- `glide` — 힘줄 활주 3자세 (grip/tipMCP)
- `pinch` — 핀치 수확 (pinch 유지)
- `isopump` — 악력 유지 (grip)
- 물주기 계열 — 좌우 편위 (deviation)

각 게임은 tracking.js/measurement.js의 지표를 공용으로 사용한다.
