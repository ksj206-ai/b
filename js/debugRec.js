// ─── 실측 세션용 분포 기록기 ───
//
// 목적 하나: 기하학 추정치로 커밋된 임계값들을 실기기 값으로 확정할 때, 숫자를 눈으로
// 훑지 않게 하는 것.
//
// 왜 진단 로그로는 부족한가. 기존 [flexExt]/[fingerSpread]/[thumbOpp]/[view] 로그는
// 200ms 스로틀 텍스트라, 임계를 정하려면 흘러가는 줄에서 최대·최소를 눈으로 주워야 한다.
// 그렇게 정한 값은 "내가 본 몇 프레임"에만 맞고 꼬리를 못 본다 — 이 저장소가 이미 세 번
// 겪은 "값이 우연히 맞아떨어져 통과하는" 실수와 같은 종류다. 임계를 정하려면
// "여기 두면 몇 %가 새는가"를 말할 수 있어야 하고, 그러려면 분포가 있어야 한다.
//
// 평소엔 완전히 꺼져 있다 — rec()은 첫 줄에서 반환하고 배열도 안 만든다.
// 세션에서만 콘솔로 켠다:
//
//   __rec.on()        → 운동 수행 → __rec.report()  (표) / __rec.dump() (원자료 JSON)
//   __rec.reset()     다시 재기        __rec.off()   끄기
//
// config의 DEBUG_* 플래그에 묶지 않은 이유: 세션 때문에 소스를 고쳤다가 true인 채로
// 커밋되는 사고를 막고(그 플래그들은 프레임마다 console.log를 때린다), 브라우저만 열면
// 바로 잴 수 있게 하기 위해서다. 두 장치는 목적이 다르다 — 로그는 "지금 무슨 일이
// 일어나는가"(디버깅), 이 기록기는 "값이 어디에 모이는가"(임계 결정).

const MAX = 30000;      // 키당 표본 상한 — 60fps로 약 8분. 넘으면 더 받지 않는다.
const store = new Map();
let on = false;

/** 한 프레임의 값 하나. 꺼져 있으면 아무 일도 안 한다(핫 패스에 놓이므로). */
export function rec(key, v) {
  if (!on) return;
  if (!Number.isFinite(v)) return;   // 손 미검출 프레임의 NaN·undefined는 분포를 오염시킨다
  let a = store.get(key);
  if (!a) { a = []; store.set(key, a); }
  if (a.length < MAX) a.push(v);
}

/** 켜고 끄기 — window 없는 환경(테스트)에서도 배선이 실제로 값을 받는지 확인하려고 export한다.
 *  브라우저에서는 __rec.on()/off()가 이것을 부른다. */
export function recEnable(v) { on = !!v; }
export function recReset() { store.clear(); }
export function recSummary() { return summarize(); }

/** 정렬된 배열에서 분위수 — 선형보간 없이 가장 가까운 순위값(표본이 많아 차이가 없다). */
function q(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[i];
}

function summarize() {
  const rows = {};
  for (const [key, a] of [...store.entries()].sort()) {
    const s = [...a].sort((x, y) => x - y);
    rows[key] = {
      n: s.length,
      min: +q(s, 0).toFixed(3),
      p5: +q(s, 0.05).toFixed(3),
      p50: +q(s, 0.5).toFixed(3),
      p95: +q(s, 0.95).toFixed(3),
      max: +q(s, 1).toFixed(3),
    };
  }
  return rows;
}

if (typeof window !== 'undefined') {
  // 플레인 node 테스트 스위트도 이 모듈을 (stepEngine 경유로) 불러오므로 window를 가정하지 않는다.
  window.__rec = {
    on() { recEnable(true); console.log('[rec] 기록 시작 — 운동을 하고 __rec.report()'); },
    off() { recEnable(false); console.log('[rec] 기록 중지'); },
    reset() { recReset(); console.log('[rec] 비웠다'); },
    report() {
      const rows = summarize();
      if (!Object.keys(rows).length) { console.log('[rec] 표본 없음 — __rec.on() 했는지 확인'); return; }
      console.table(rows);
      return rows;
    },
    /** 임계 결정을 남에게 맡길 때 그대로 붙여넣을 원자료. 표본이 많으면 길다. */
    dump() { return JSON.stringify(Object.fromEntries(store), null, 0); },
  };
}
