// ═══════════════════════════════════════════════════════════
// tracking.test.mjs — delegate GPU→CPU 폴백 헬퍼(createWithFallback) 테스트
// 실행: `node js/tracking.test.mjs` (실패 시 exit 1).
// initModels 전체는 브라우저 MediaPipe·WebGL이 필요해 자동 테스트가 어렵다. 여기서는
// 폴백 '순서/독립성/모두 실패 시 throw'만 mock 팩토리로 검증한다(실제 모델 생성은 수동 검증).
// createWithFallback은 MEDIAPIPE.delegates(=['GPU','CPU']) 순서를 읽는다.
// ═══════════════════════════════════════════════════════════
import { createWithFallback } from './tracking.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; return; } fail++; console.error(`FAIL ${msg}`); };

// 1: GPU 첫 시도 성공 → GPU만 시도, GPU 결과 반환(성능 회귀 없음)
{
  const tried = [];
  const lm = await createWithFallback('T1', (d) => { tried.push(d); return Promise.resolve(`lm-${d}`); });
  ok(lm === 'lm-GPU', '1 GPU 우선 성공');
  ok(tried.join(',') === 'GPU', '1 GPU만 시도(폴백 안 밟음)');
}

// 2: GPU 생성 실패 → CPU로 폴백 성공, 순서는 GPU→CPU
{
  const tried = [];
  const lm = await createWithFallback('T2', (d) => {
    tried.push(d);
    return d === 'GPU' ? Promise.reject(new Error('no webgl2')) : Promise.resolve(`lm-${d}`);
  });
  ok(lm === 'lm-CPU', '2 CPU 폴백 성공');
  ok(tried.join(',') === 'GPU,CPU', '2 GPU→CPU 순서');
}

// 3: 모든 delegate 실패 → 마지막(CPU) 에러를 그대로 throw(상위 에러 안내로)
{
  let threw = null;
  try { await createWithFallback('T3', (d) => Promise.reject(new Error(`fail-${d}`))); }
  catch (e) { threw = e; }
  ok(!!threw && threw.message === 'fail-CPU', '3 모두 실패 시 마지막 에러 throw');
}

// 4: 두 모델 독립 — Hand=GPU / Pose=CPU 혼합 허용(한쪽 실패가 다른 쪽을 강등 안 함)
{
  const hand = await createWithFallback('Hand', (d) => d === 'GPU' ? Promise.resolve('H-GPU') : Promise.reject(new Error()));
  const pose = await createWithFallback('Pose', (d) => d === 'GPU' ? Promise.reject(new Error('pose no gpu')) : Promise.resolve('P-CPU'));
  ok(hand === 'H-GPU' && pose === 'P-CPU', '4 Hand=GPU / Pose=CPU 독립');
}

console.log(`\ntracking delegate 폴백 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
