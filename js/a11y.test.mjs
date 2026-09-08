// ═══════════════════════════════════════════════════════════
// a11y.test.mjs — 낭독기 안내 문장 만들기(순수) 테스트
// 실행: `node js/a11y.test.mjs` (실패 시 exit 1). DOM 불필요 —
// announce()는 document가 없으면 조용히 false를 돌려주고, 문장 조립만 여기서 검증한다.
//
// 이 파일이 지키는 것 중 하나는 "조용해지지 않기"다: 화면을 새로 늘리고 라벨을
// 빠뜨리면 그 화면만 아무 말도 안 하게 되는데, 눈으로는 아무 문제가 안 보인다.
// ═══════════════════════════════════════════════════════════
import { SCREENS } from './config.js';
import { announce, announceError, screenMessage, stepMessage, countMessage, SCREEN_LABEL } from './a11y.js';

let pass = 0, fail = 0;
const eq = (got, want, msg) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  fail++;
  console.error(`FAIL ${msg}: got ${g}, want ${w}`);
};

// ── A1: ★화면이 하나도 빠지지 않았다 ──
// config.SCREENS를 늘리면 여기서 먼저 깨진다. 라벨이 없으면 그 화면에 들어가도
// 낭독기는 아무 말도 안 한다 — 눈으로는 절대 안 보이는 종류의 구멍이다.
for (const [key, name] of Object.entries(SCREENS)) {
  eq(typeof SCREEN_LABEL[name] === 'string' && SCREEN_LABEL[name].length > 0, true,
     `A1 SCREENS.${key}('${name}')에 낭독 라벨이 있다`);
}
eq(Object.keys(SCREEN_LABEL).length, Object.keys(SCREENS).length,
   'A1b 라벨이 화면 수와 정확히 같다 (없는 화면의 유령 라벨 금지)');

// ── A2: 화면 안내 문장 ──
eq(screenMessage(SCREENS.RECORDS), '기록 화면', 'A2 기록 화면');
eq(screenMessage(SCREENS.SKY), '밤하늘 도감 화면', 'A2b 도감 화면');
eq(screenMessage('없는화면'), '', 'A2c 모르는 이름이면 조용히 넘어간다');
eq(screenMessage(undefined), '', 'A2d undefined도 조용히');

// ── A3: 스텝 안내 — 하나뿐인 스텝에서 "1/1단계"는 군더더기다 ──
eq(stepMessage('손목을 굽혔다 펴세요', 1, 3), '2/3단계. 손목을 굽혔다 펴세요', 'A3 자리 + 문장');
eq(stepMessage('쭉 펴서 유지', 0, 1), '쭉 펴서 유지', 'A3b 스텝이 하나면 자리 표시 생략');
eq(stepMessage('', 0, 3), '1/3단계.', 'A3c 문장이 비어도 어디인지는 알린다');

// ── A4: 회수 안내 ──
eq(countMessage(3, 5), '3/5회', 'A4 진행 중');
eq(countMessage(5, 5), '5/5회, 다 했어요', 'A4b 마지막은 끝났다고 말한다');
eq(countMessage(6, 5), '6/5회, 다 했어요', 'A4c 넘겨도 끝난 것으로 읽는다');
eq(countMessage(0, 5), '', 'A4d 0회는 안 읽는다 — 아직 아무 일도 없었다');
eq(countMessage(3, 0), '', 'A4e 회수를 안 세는 스텝(intro/outro)은 조용히');

// ── A5: DOM이 없으면 조용히 실패한다 (테스트·서버 환경에서 터지지 않게) ──
eq(announce('아무거나'), false, 'A5 document 없으면 false');
eq(announceError('오류'), false, 'A5b 오류 안내도 마찬가지');
eq(announce(''), false, 'A5c 빈 문장은 애초에 안 적는다');

console.log(`\n낭독기 안내 문장 테스트: ${pass} pass, ${fail} fail`);
if (typeof process !== 'undefined' && fail > 0) process.exitCode = 1;
