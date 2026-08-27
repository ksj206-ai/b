# js/games/

미니게임 모듈. 설계: [`docs/미니게임_별따기_설계.md`](../../docs/미니게임_별따기_설계.md)

```
engine.js     공용 부품 — 캔버스 무대(DPR) · 파티클 · rAF 루프
starPick.js   ① 별 따기 (pinch_hold)
```

## 원칙 — 게임은 대응 운동의 두 번째 얼굴

게임은 새 보상 체계가 아니다. 완주하면 `markRoutineDone(대응 guideId)` 하나를
부르고 끝난다. 별자리 점등은 홈에서 `syncStarsToProgress`가 기존 경로로 한다.

그래서 게임은 **판정기도 반복수도 스스로 정하지 않는다** — `createDetector`와
`getRoutineGuide`에서 받아 쓴다. 따로 정하면 적응형 강도(`adapt.doseLevel`)를
우회하는 샛길이 된다.

## 남은 게임 (같은 원칙)

| 지표 | 게임 | 대응 운동 | 판정기 |
|---|---|---|---|
| `rel` 굽힘/폄 | 별 줍기 (2층) | `flex_ext` | `flexExt` |
| `rel` 좌우편위 | 유성우 받기 | `deviation` | `deviation` |
| `grip` 유지 | 별 점등 | `grip_hold` | `gripHold` |
| 손 모양 순서 | 별자리 잇기 | `tendon_glide` | `tendonGlide` |
| `spread` | 구름 걷기 | `finger_spread` | `tendonGlide` |

게임마다 파일 하나를 쓴다. 참고한 이전 프로젝트(BBB)는 게임 6종이 1160줄 한
파일에 `s.mode` 분기로 들어가 두 번째 게임부터 무너졌다.
