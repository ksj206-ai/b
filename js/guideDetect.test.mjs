// ═══════════════════════════════════════════════════════════
// guideDetect.test.mjs — 손가락 벌리기 판정기(fingerSpread) 테스트
// 실행: `node js/guideDetect.test.mjs` (실패 시 exit 1).
//
// 이 파일이 못 박아 두는 사실(회귀 방지):
//   ① fingers.spread(너클 폭÷손바닥)는 손가락을 벌려도 '안 변한다' — 외전 지표가 아니다.
//   ② fingers.fanSpan(손끝 폭÷너클 폭)만 외전에 반응한다.
//   ③ finger_spread에 tendonGlide를 물리면 카운트가 구조적으로 0이다(과거 버그).
//   ④ fingerSpread는 벌림·모음 왕복 1세트를 1회로 센다.
//   ⑤ 손가락을 굽히면 손끝 폭도 줄지만 grip 게이트가 오탐을 막는다.
//   ⑥ guideData의 finger_spread가 실제로 fingerSpread에 배선돼 있다.
//
// 합성 손 랜드마크로 검증한다 — 카메라·MediaPipe 없이 fingerMetrics가 읽는 10개 점만
// 해부학적 비율에 맞춰 만든다. 절대 좌표가 아니라 '비율'을 재는 지표라 이걸로 충분하다.
// ═══════════════════════════════════════════════════════════
import { fingerMetrics } from './measurement.js';
import { createDetector, createStepEngine } from './guide/stepEngine.js';
import { getGuide } from './guide/guideData.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };

// ─── 합성 손 ───────────────────────────────────────────────
// 손목 (0,0), MCP 줄은 y=-9.5(중지 MCP가 정확히 손바닥 길이 9.5). 손가락은 각자의 MCP에서
// 부채꼴로 뻗는다. fan: 0=모음(살짝 수렴) ~ 1=활짝. curl: 0=편 손 ~ 1=주먹(길이 축소).
const MCP_X = { index: -2.7, middle: 0, ring: 2.7, pinky: 5.3 }; // 검지~새끼 너클 폭 8.0
const LEN = { index: 7.0, middle: 7.7, ring: 7.0, pinky: 5.5 };
const OFF = { index: -1, middle: -0.33, ring: 0.33, pinky: 1 };  // 부채꼴 중심에서의 위치

function makeHand({ fan = 0, curl = 0 } = {}) {
  const fanDeg = -6 + fan * 28;           // 0 → -6°(수렴) / 1 → +22°(활짝)
  const tip = (name) => {
    const th = (fanDeg * OFF[name]) * Math.PI / 180;
    const L = LEN[name] * (1 - 0.8 * curl);
    return { x: MCP_X[name] + L * Math.sin(th), y: -9.5 - L * Math.cos(th) };
  };
  const h = new Array(21).fill(null).map(() => ({ x: 0, y: 0 }));
  h[0] = { x: 0, y: 0 };                                        // WRIST
  h[5] = { x: MCP_X.index, y: -9.5 };  h[8] = tip('index');     // INDEX
  h[9] = { x: MCP_X.middle, y: -9.5 }; h[12] = tip('middle');   // MIDDLE
  h[13] = { x: MCP_X.ring, y: -9.5 };  h[16] = tip('ring');     // RING
  h[17] = { x: MCP_X.pinky, y: -9.5 }; h[20] = tip('pinky');    // PINKY
  h[4] = { x: -4.5, y: -6.0 };                                  // THUMB_TIP (핀치 무관)
  return h;
}
const snapOf = (opts) => ({ detected: true, rel: 0, comp: false, fingers: fingerMetrics(makeHand(opts)) });

// 1: spread는 외전에 반응하지 않는다 — 이 버그의 근본 원인
{
  const closed = fingerMetrics(makeHand({ fan: 0 }));
  const open = fingerMetrics(makeHand({ fan: 1 }));
  ok(Math.abs(open.spread - closed.spread) < 1e-9,
     `1 spread는 벌려도 불변 (모음 ${closed.spread.toFixed(3)} / 활짝 ${open.spread.toFixed(3)})`);
  ok(open.fanSpan - closed.fanSpan > 0.5,
     `1 fanSpan은 외전에 반응 (모음 ${closed.fanSpan.toFixed(2)} → 활짝 ${open.fanSpan.toFixed(2)})`);
  ok(closed.fanSpan <= 0.95 && open.fanSpan >= 1.15,
     `1 기본 임계(0.95/1.15) 바깥에 여유 있게 떨어진다`);
  ok(closed.grip > 1.45 && open.grip > 1.45, '1 편 손은 grip 게이트를 통과');
}

// 2: 과거 버그 재현 — tendonGlide로는 벌리기가 몇 번을 해도 0회
{
  const d = createDetector('tendonGlide');
  let counted = 0;
  for (let i = 0; i < 10; i++) {
    for (const fan of [1, 0]) if (d.feed(snapOf({ fan })).justCounted) counted++;
  }
  ok(counted === 0, `2 tendonGlide는 벌리기를 못 센다(구조적 0) — 실제 ${counted}`);
  ok(d.feed(snapOf({ fan: 1 })).hint.includes('갈고리'),
     '2 힌트가 시범과 어긋난 "갈고리"를 가리킨다(버그의 증상)');
}

// 3: fingerSpread — 왕복 1세트 = 1회
{
  const d = createDetector('fingerSpread');
  let counted = 0;
  for (let i = 0; i < 5; i++) {
    for (const fan of [1, 0]) if (d.feed(snapOf({ fan })).justCounted) counted++;
  }
  ok(counted === 5, `3 왕복 5세트 → 5회 (실제 ${counted})`);
}

// 4: 관대하되(§6) 아무거나 세지는 않는다.
//    기본 임계(0.95~1.15)의 사각지대는 이 픽스처에서 부채꼴 13%~39% 구간이다.
{
  const mid = [0.20, 0.30]; // fanSpan ≈ 1.01 / 1.08 — 둘 다 사각지대 안
  const d = createDetector('fingerSpread');
  let counted = 0;
  for (let i = 0; i < 10; i++) {
    for (const fan of mid) if (d.feed(snapOf({ fan })).justCounted) counted++;
  }
  ok(counted === 0, `4 사각지대 안 흔들림은 카운트 안 됨 (실제 ${counted})`);

  // 관대함: 활짝(100%)까지 안 가도 인정된다 — 가동범위가 좁은 사람도 완주할 수 있어야 한다
  const d2 = createDetector('fingerSpread');
  let partial = 0;
  for (let i = 0; i < 3; i++) {
    for (const fan of [0.45, 0.05]) if (d2.feed(snapOf({ fan })).justCounted) partial++;
  }
  ok(partial === 3, `4 부채꼴 45%만 벌려도 인정 (실제 ${partial}/3)`);
}

// 5: grip 게이트 — 손가락을 굽히면 손끝 폭도 줄지만 '모음'으로 오인하지 않는다
{
  const curled = fingerMetrics(makeHand({ fan: 1, curl: 1 }));
  ok(curled.grip < 1.45, `5 주먹은 grip 게이트에 걸린다 (grip ${curled.grip.toFixed(2)})`);
  const d = createDetector('fingerSpread');
  let counted = 0;
  for (let i = 0; i < 10; i++) {                       // 활짝 편 손 ↔ 주먹 반복
    if (d.feed(snapOf({ fan: 1 })).justCounted) counted++;
    if (d.feed(snapOf({ fan: 1, curl: 1 })).justCounted) counted++;
  }
  ok(counted === 0, `5 벌린 채 굽혔다 펴기는 벌리기로 안 센다 (실제 ${counted})`);
  ok(d.feed(snapOf({ fan: 1, curl: 1 })).hint.includes('편 채'), '5 굽히면 펴라고 안내');
}

// 6: 손 미검출 프레임은 안전하게 무시 (상태 오염 없음)
{
  const d = createDetector('fingerSpread');
  d.feed(snapOf({ fan: 1 }));
  ok(d.feed({ detected: false, rel: 0, comp: false, fingers: null }).justCounted === false,
     '6 미검출 프레임은 카운트 없음');
  ok(d.feed(snapOf({ fan: 0 })).justCounted === true, '6 미검출을 지나도 진행 중이던 왕복은 살아 있다');
}

// 7: guideData 배선 — 시범(벌리기)과 판정기가 같은 운동을 가리키는가
{
  const g = getGuide('finger_spread');
  const step = g.steps.find((s) => s.type === 'follow');
  ok(step.detect === 'fingerSpread', `7 finger_spread.detect === 'fingerSpread' (실제 '${step.detect}')`);
  ok(getGuide('tendon_glide').steps.find((s) => s.type === 'follow').detect === 'tendonGlide',
     '7 힘줄 활주는 그대로 tendonGlide');
}

// 8: 엔진 통합 — 실제 guideData로 intro→follow 5회→outro 완주
{
  const g = getGuide('finger_spread');
  let completed = false, armedAt = null, counts = [];
  const engine = createStepEngine(g, {
    onCount: (c) => counts.push(c),
    onNeedNeutral: () => { armedAt = 'pending'; },
    onComplete: () => { completed = true; },
  });
  let t = 0;
  engine.start(t);
  const step = (snap) => { t += 100; engine.update(t, snap); };
  const idle = snapOf({ fan: 0 });
  for (let i = 0; i < 40; i++) step(idle);              // intro 3초 통과 → follow 진입
  ok(armedAt === 'pending', '8 follow 진입 시 중립 요청(onNeedNeutral)');
  engine.arm(t);                                        // 컨트롤러가 중립 잡고 arm
  for (let i = 0; i < 5; i++) { step(snapOf({ fan: 1 })); step(snapOf({ fan: 0 })); }
  ok(counts.length && counts[counts.length - 1] === 5, `8 follow 5회 카운트 (실제 ${counts.join(',')})`);
  for (let i = 0; i < 40; i++) step(idle);              // outro 3초 통과
  ok(completed, '8 outro까지 자동 완주');
}

console.log(`\n손가락 벌리기 판정기 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
