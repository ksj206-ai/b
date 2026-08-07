// ═══════════════════════════════════════════════════════════
// handSprite.js — 시범 손 APNG 스프라이트
// 여기 등록된 운동은 스켈레톤 손(guideHand.js) 대신 미리 렌더된 손 애니를 쓴다.
// 등록되지 않은 id는 show()가 false를 돌려주고 스켈레톤으로 폴백한다.
// 호(arc)·화살표는 지금처럼 캔버스가 그리므로, 여기서 책임지는 건 딱 하나 —
//   "이미지 안 손목이 캔버스 위 호의 중심에 정확히 물리게 얹는 것".
//
// ─── 정렬 방식 ───
// 스프라이트는 캔버스와 같은 상자(.gp-stage) 안에 절대 배치하고, 위치·크기를 %로 준다.
// 캔버스가 CSS로 늘어나도 비율이 그대로라 손목↔호 중심 정렬이 유지된다(재계산 불필요).
//
//   이미지좌표(px) --k--> 손 로컬 단위 --scale--> 캔버스 px
//   pivot(이미지 안 손목)이 (cx,cy) + WRIST[view] * scale 에 오도록 좌상단을 역산.
//
// pivot 값은 눈대중이 아니라 APNG 프레임에서 잰 값이다(운동 종류별 기준은 SPRITES 위 주석).
// k는 손끝이 호 안쪽에 살짝 들어오도록, 손가락 운동은 손이 무대를 꽉 채우도록 맞췄다.
//
// ⚠ 에셋을 새로 뽑으면 w/h/pivot/k를 반드시 다시 잰다 — 프레임 크기가 달라지면
//   w·h가 배치 계산(폭 = w*k*scale)에 그대로 들어가 손이 어긋나고 크기도 틀어진다.
// ═══════════════════════════════════════════════════════════

// 손 로컬 좌표의 손목 = 회전 중심 — guideHand.js drawSide(wx,wy)·drawFront(0,70)와 같은 점
const WRIST = { side: { x: 4, y: 14 }, front: { x: 0, y: 70 } };

// ─── 손목이 도는 sweep 운동 — pivot = 실측 회전축 ───
// 프레임을 겹치면 팔뚝은 겹치고 손만 부채꼴로 벌어진다. 그 수렴점이 회전축이고,
// 호(arc)가 이 점을 중심으로 그려지므로 pivot은 여기서 눈대중이 아니라 실측값이다.
//
// ─── 손가락 운동(핀치·악력·벌리기·힘줄활주) — pivot = 손목 배치 기준점 ───
// 손목은 고정이고 손가락만 움직여 "회전축"이 없다. 호도 띄우지 않으므로(main.js
// ARC_GUIDES) pivot은 순수 배치 기준 — 프레임 전체에서 잰 손목 목(최소 단면)의
// 중심을 쓴다. x는 팔뚝 중심(측정 표준편차 0.25px 미만), y는 네 에셋 공통 178.
// 넷이 같은 값을 쓰므로 운동이 이어져 재생돼도 손목이 제자리에 머문다.
// ─── 에셋 버전 ───
// 같은 파일명으로 그림만 갈아끼우면 브라우저 디스크 캐시가 옛 그림을 계속 내준다.
// 특히 정지 프레임은 JS가 나중에 <img>.src로 붙이는 이미지라 하드 리로드(Ctrl+Shift+R)로도
// 갱신되지 않는다 — 실제로 굽힘·폄이 intro/outro에선 옛 손, follow에선 새 손으로 갈렸다.
// 게다가 프레임 크기가 바뀌면 아래 w/h 배치까지 어긋난다.
// ⚠ 에셋을 새로 뽑을 때마다 이 숫자를 올린다 (고정 쿼리라 캐시는 정상 동작 — 매번 재요청 아님).
const ASSET_V = 2;
const asset = (name) => `assets/${name}.png?v=${ASSET_V}`;

const SPRITES = {
  flex_ext: {
    view: 'side',
    anim: asset('guide-flexext'), still: asset('guide-flexext-static'),
    w: 480, h: 270, pivot: { x: 252, y: 138 }, k: 0.90,
  },
  deviation: {
    view: 'front',
    anim: asset('guide-deviation'), still: asset('guide-deviation-static'),
    w: 317, h: 568, pivot: { x: 171.0, y: 309.5 }, k: 0.60,
  },
  pinch_hold: {
    view: 'front',
    anim: asset('guide-pinch'), still: asset('guide-pinch-static'),
    w: 480, h: 270, pivot: { x: 240.4, y: 178 }, k: 0.99,
  },
  grip_hold: {
    view: 'front',
    anim: asset('guide-grip'), still: asset('guide-grip-static'),
    w: 480, h: 270, pivot: { x: 240.1, y: 178 }, k: 0.99,
  },
  finger_spread: {
    view: 'front',
    anim: asset('guide-spread'), still: asset('guide-spread-static'),
    w: 480, h: 270, pivot: { x: 240.3, y: 178 }, k: 0.99,
  },
  tendon_glide: {
    view: 'front',
    anim: asset('guide-tendon'), still: asset('guide-tendon-static'),
    w: 480, h: 270, pivot: { x: 241.0, y: 178 }, k: 0.99,
  },
};

// 모션 최소화 선호 — APNG 대신 정지 프레임. guideHand.js와 같은 판단 기준.
const RM_MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduceMotion = () => !!(RM_MQ && RM_MQ.matches);

const pct = (v) => `${(v * 100).toFixed(3)}%`;

// ─── 재생 위치 되감기 ───
// 브라우저는 같은 URL의 애니메이션 이미지를 "하나의 재생 클럭"으로 공유한다 —
// 요소를 새로 만들어 붙여도 되감기지 않고 진행 중인 재생에 중간부터 합류한다.
// 되감으려면 다른 리소스로 보여야 하는데 쿼리스트링은 매번 재요청이 된다. 그래서
// 파일은 한 번만 받아 Blob으로 들고, 되감을 때마다 새 object URL을 발급한다
// (네트워크 없이 메모리에서 디코딩만 다시 — 운동 시작마다 한 번).
const blobs = new Map();  // src → Promise<Blob|null>
function loadBlob(src) {
  if (!blobs.has(src)) {
    blobs.set(src, fetch(src)
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null));   // 실패해도 조용히 — 되감기만 포기하고 재생은 계속된다
  }
  return blobs.get(src);
}

/**
 * 스프라이트 컨트롤러.
 * @param {HTMLImageElement} img  캔버스와 같은 상자 안의 <img> (position:absolute)
 */
export function createHandSprite(img) {
  const node = img;
  let cur = null, objUrl = null;

  // 재생 중에 모션 최소화 설정이 바뀌면 애니↔정지 프레임을 바로 바꿔준다
  // (guideHand의 스켈레톤도 매 프레임 같은 기준을 본다 — 두 시범 손이 어긋나지 않게).
  RM_MQ?.addEventListener?.('change', () => {
    if (cur && !node.hidden) node.src = reduceMotion() ? cur.still : cur.anim;
  });

  /** 손목이 호 중심에 오도록 좌상단·크기를 캔버스 비율(%)로 지정 */
  function place(layout) {
    const s = cur.k * layout.scale;                    // 이미지 px → 캔버스 px
    const wr = WRIST[cur.view];
    node.style.left = pct((layout.cx + wr.x * layout.scale - cur.pivot.x * s) / layout.w);
    node.style.top = pct((layout.cy + wr.y * layout.scale - cur.pivot.y * s) / layout.h);
    node.style.width = pct((cur.w * s) / layout.w);    // height는 auto — 원본 비율 유지
  }

  return {
    /**
     * 운동에 스프라이트가 있으면 배치·표시하고 true. 없으면 숨기고 false
     * (= 호출부는 이 값을 그대로 drawGuideHand의 hideHand로 쓰면 된다).
     * @param {string} id  운동 id
     * @param {{w,h,cx,cy,scale}} layout  캔버스 논리 크기 + 손 원점·배율 (drawStage와 동일)
     */
    show(id, layout) {
      cur = SPRITES[id] || null;
      if (!cur) { this.hide(); return false; }
      node.src = reduceMotion() ? cur.still : cur.anim;   // 첫 표시는 경로 그대로 (즉시 뜬다)
      if (!reduceMotion()) loadBlob(cur.anim);            // 되감기용 원본을 intro 동안 미리 확보
      place(layout);
      node.hidden = false;
      return true;
    },

    /** 현재 운동의 정지 프레임 URL (intro·outro 표시용) — 없으면 null.
     *  호출부가 <img>.src를 문자열로 주물러 만들지 않게 여기서 준다
     *  (버전 쿼리가 붙으면 ".png로 끝난다"는 가정이 깨진다). */
    still() { return cur ? cur.still : null; },

    hide() {
      cur = null;
      node.hidden = true;
      node.removeAttribute('src');   // 안 보이는 동안 디코딩·재생 중단
      if (objUrl) { URL.revokeObjectURL(objUrl); objUrl = null; }
    },

    /**
     * 재생을 프레임 0으로 되감기 — follow 시작에 맞춰 호(arc)와 위상을 맞춘다.
     * 애니는 앱 주기(6.0s/5.3s)와 같은 길이·같은 시작 위상으로 인코딩돼 있어
     * 한 번 되감으면 그 스텝 내내 대략 함께 움직인다.
     * 정지 프레임(모션 최소화)일 땐 되감을 것이 없다.
     */
    async restart() {
      if (!cur || reduceMotion() || node.hidden) return;
      const want = cur;
      const blob = await loadBlob(want.anim);
      if (!blob || cur !== want || node.hidden) return;   // 실패했거나 그새 운동이 바뀜 → 그대로 둔다
      const prev = objUrl;
      objUrl = URL.createObjectURL(blob);
      node.src = objUrl;
      if (prev) URL.revokeObjectURL(prev);                // 새 src 지정 후 해제 (직전 프레임은 이미 디코딩됨)
    },
  };
}
