// ═══════════════════════════════════════════════════════════
// guideHand.js — 관절 골격(스켈레톤) 기반 시범 손 (명세서 §2)
// drawGuideHand(ctx, p, view, opts)     ★공개 인터페이스 — 호출부 규약 불변★
//   p: { wristAngle, devAngle, curl(number|number[5]), curlTip, spread, pinchGap,
//        __lag(animPlayer가 주는 팔로우스루 지연값) }
//   view: 'side'(팔뚝+손날, 굽힘·폄) | 'front'(손바닥, 편위·손가락·핀치)
//   opts: { cx, cy, scale, now(ms — 있으면 호흡·미세 움직임 활성) }
//
// ─── 구조: 파라미터 → 뼈대 → 실루엣, 3단 ───
//  ① 뼈대(chain)  전완·손목·손바닥(중수골) 위에 손가락 MCP·PIP·DIP·끝, 엄지 CMC·MCP·IP·끝을
//     관절 위치로 계산한다. 각 마디는 "직전 마디 방향 + 자기 관절 굴곡각"으로 이어지므로
//     굽힘이 한 점에서 꺾이지 않고 마디마다 누적된 호가 된다(이게 막대기와 손을 가른다).
//  ② 쉼 자세(REST)  완전히 편 손은 사람 손이 아니다. 입력이 0일 때도 관절마다 기본 굴곡을
//     얹어 "긴장 안 한 손"에서 출발하고, 입력 굴곡이 들어오면 그 쪽으로 자연스럽게 넘긴다.
//     새끼로 갈수록 조금 더 말리는 실제 손의 캐스케이드도 여기서 준다.
//  ③ 실루엣(bonePath)  마디를 굵기가 변하는 캡슐(두 원의 공통 외접선)로 그린다. 관절
//     반지름이 원위로 갈수록 작아지고 이웃 마디와 값을 공유해, 이음새 없이 끝으로 가늘어진다.
//
// ─── 유지되는 표현 ───
//   · 손가락 시차(새끼→검지, §4③) / spread 부채꼴 벌리기 (§4⑥)
//   · 엄지 IK + 핀치 시 검지와 실제 접촉 + 접점 반짝 (§4④)
//   · 관절 주름·손금은 은은한 선으로만 / 호흡 아이들 + 팔로우스루(p.__lag)
//   · 편위(devAngle)는 손목(0,70), 굽힘·폄(wristAngle)은 (4,14)에서 꺾임 — 팔뚝·커프 고정
//   · 동작 궤적 오버레이(호·화살표)는 follow 재생 중(__lag 존재)에만
// 이모지 미사용(벡터 드로잉) — 명세서의 이모지 투명 이슈 회피.
//
// 형태 원칙 셋(리스타일에서 확정, 그대로 유지):
//   ① 손목은 잘록하게 — 팔뚝(굵음)→손목(가늘음) 테이퍼가 없으면 팔과 손이 한 덩어리로 읽힘
//   ② 손가락은 손등보다 확실히 가늘게, 끝으로 갈수록 더 가늘게
//   ③ 엄지는 손과 한 덩어리로 합쳐 그리고 물갈퀴 주름으로만 경계 암시(side)
// ═══════════════════════════════════════════════════════════

// ─── 팔레트 — css/styles.css 토큰과 통일 (리스타일 값 그대로) ───
// 배경은 밤하늘 인디고(--grad-surface #2a3160→#1e2550). 그 위에서:
//   · 피부는 따뜻한 살구 유지 — 유일한 난색이라 시선이 손에 먼저 간다.
//   · 소매는 --sage(#6a5fa0) 뮤트 라벤더. 배경과 같은 계열이라 뒤로 물러난다.
//   · 모션 호·화살표는 --water(#8fcef0) 시안 — 진행 바와 같은 "움직임" 색 언어.
const SKIN = '#f4c69f';
const SKIN_HI = '#ffdcb9';    // 그라데이션 윗면(빛 받는 쪽)
const SKIN_LO = '#e0a97f';    // 그라데이션 아랫면(그늘)
const SKIN_BACK = '#dda37a';  // 뒤층 손가락(측면 겹침) — 한 단계 어두워 깊이감
const SKIN_BACK_HI = '#eab88f';
const SKIN_LINE = '#c2825a';  // 윤곽 — 인디고 위에서 실루엣이 끊기지 않게 진하게
const SLEEVE = '#6a5fa0';
const SLEEVE_HI = '#8478bb';
const SLEEVE_LINE = '#443a73';
const MOTION = '143,206,240'; // --water 시안 (rgba 조합용)
const CREASE = '176,116,78';  // 주름·손금
const SHADE = '10,8,26';      // 그림자 (--shade-rgb 계열)
const D2R = Math.PI / 180;
const OUTLINE = 5;            // 윤곽 패스 두께 (반지름 기준 +2.5씩)

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// 모션 최소화 선호: 호흡 아이들(미세 움직임)을 끄고 기본 포즈로 정지시킨다.
// MediaQueryList를 한 번만 만들어 두고 매 프레임 .matches만 읽는다(생성 비용 회피).
const RM_MQ = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const reduceMotion = () => !!(RM_MQ && RM_MQ.matches);

// ═══════════════════════════════════════════════════════════
// 골격 — 관절 체인
// ═══════════════════════════════════════════════════════════

/**
 * 관절 체인 만들기: 밑동에서 시작해 마디를 하나씩 이어 붙인다.
 * 각 마디는 직전 마디 방향에 자기 굴곡각을 '누적'해 진행하므로, 마디가 많을수록
 * 부드러운 호가 된다(한 관절에 굽힘을 몰아주면 꺾인 막대기가 된다).
 * @param {number} x,y   밑동 관절 위치
 * @param {number} dir   밑동에서 나가는 방향(rad)
 * @param {number[]} len 마디 길이 (근위 → 원위)
 * @param {number[]} rad 관절 반지름 (len.length+1개, 원위로 갈수록 작게)
 * @param {number[]} bend 관절 굴곡각(rad) — i번째 마디가 직전 방향에서 꺾이는 각
 * @returns {{joints:{x,y,r}[], dirs:number[]}} joints[0]=밑동 … joints[n]=끝
 */
function chain(x, y, dir, len, rad, bend) {
  const joints = [{ x, y, r: rad[0] }];
  const dirs = [];
  let a = dir;
  for (let i = 0; i < len.length; i++) {
    a += bend[i] || 0;
    const p = joints[i];
    joints.push({
      x: p.x + Math.cos(a) * len[i],
      y: p.y + Math.sin(a) * len[i],
      r: rad[i + 1] ?? rad[rad.length - 1],
    });
    dirs.push(a);
  }
  return { joints, dirs };
}

/** 체인의 마디를 렌더러에 등록 (관절 반지름을 이웃과 공유해 이음새 없음) */
function addChain(part, ch) {
  const j = ch.joints;
  for (let i = 0; i < j.length - 1; i++) {
    part.bone(j[i].x, j[i].y, j[i + 1].x, j[i + 1].y, j[i].r, j[i + 1].r);
  }
}

// ═══════════════════════════════════════════════════════════
// 렌더 프리미티브
// ═══════════════════════════════════════════════════════════

/** 부위 채움용 세로 그라데이션 — 위(빛)에서 아래(그늘)로. 플랫 일러스트 톤은 유지하고
 *  납작함만 덜어내는 정도의 폭. 현재 변환 공간 기준이라 회전된 손 안에서도 방향이 맞다. */
function shade(ctx, top, bot, hi, lo) {
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, hi); g.addColorStop(1, lo);
  return g;
}

/** 접지 그림자 — 부위 아래 은은한 타원 한 겹(블러 필터 없이 방사 그라데이션으로). */
function groundShadow(ctx, x, y, rx, ry, alpha = 0.3) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(${SHADE},${alpha})`);
  g.addColorStop(0.55, `rgba(${SHADE},${alpha * 0.45})`);
  g.addColorStop(1, `rgba(${SHADE},0)`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
  ctx.restore();
}

/** 둥근 캡 막대(캡슐) — 소매 등 골격 밖 단독 부위용 */
function capsule(ctx, x1, y1, x2, y2, w, fill, line) {
  ctx.lineCap = 'round';
  if (line) {
    ctx.strokeStyle = line; ctx.lineWidth = w + 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.strokeStyle = fill; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/** 굵기가 변하는 부위(팔뚝) — x1(굵음) → x2(가늘음), x2 끝은 반원으로 마감. */
function taperLimb(ctx, x1, x2, y, h1, h2, fill, line) {
  const build = () => {
    ctx.beginPath();
    ctx.moveTo(x1, y - h1);
    ctx.lineTo(x2, y - h2);
    ctx.arc(x2, y, h2, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x1, y + h1);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  if (line) { ctx.strokeStyle = line; ctx.lineWidth = OUTLINE; build(); ctx.stroke(); }
  ctx.fillStyle = fill; build(); ctx.fill();
}

/**
 * 마디(뼈) 실루엣 — 반지름이 r1 → r2 로 변하는 캡슐. 두 원의 공통 외접선을 이어
 * 만들기 때문에 균일 굵기 stroke와 달리 "원위로 갈수록 가늘어지는" 형태가 나온다.
 * 관절 쪽 끝은 반원이라 이웃 마디와 반지름만 맞추면 이음새가 사라진다.
 */
function bonePath(ctx, x1, y1, x2, y2, r1, r2) {
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  ctx.beginPath();
  if (d < 0.01 || d <= Math.abs(r1 - r2)) {   // 한 원이 다른 원을 품음 → 큰 원만
    const big = r1 >= r2;
    ctx.arc(big ? x1 : x2, big ? y1 : y2, Math.max(r1, r2), 0, Math.PI * 2);
    return;
  }
  const th = Math.atan2(dy, dx);
  const al = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  ctx.arc(x2, y2, r2, th + al, th - al, true);  // 원위 캡
  ctx.arc(x1, y1, r1, th - al, th + al, true);  // 근위 캡 (사이는 외접선으로 자동 연결)
  ctx.closePath();
}

/** 부위를 모아 2패스로 렌더 — ① 윤곽(두껍게) ② 채움.
 *  부위끼리 경계선이 생기지 않아 둥근 한 덩어리 실루엣이 된다.
 *  등록 순서 = 채움 순서(나중 부위가 위) — 손바닥 먼저, 손가락 나중. */
function partRenderer(ctx, fill = SKIN, line = SKIN_LINE) {
  const paths = [];
  return {
    bone(x1, y1, x2, y2, r1, r2) { paths.push((c) => bonePath(c, x1, y1, x2, y2, r1, r2)); },
    path(build) { paths.push(build); },
    /** @param {{shadow?:number}} o - shadow: 드롭 그림자 진하기(0이면 생략) */
    render(o = {}) {
      const sh = o.shadow ?? 0;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      // ⓪ 드롭 그림자: 같은 실루엣을 살짝 아래로 밀어 어둡게 한 겹 — 배경에서 손이 뜬다.
      //    겹치는 레이어끼리 그림자가 누적돼 탁해지지 않게 alpha를 낮게 유지한다.
      if (sh > 0) {
        ctx.save();
        ctx.translate(2, 5);
        ctx.fillStyle = `rgba(${SHADE},${sh})`; ctx.strokeStyle = `rgba(${SHADE},${sh})`;
        ctx.lineWidth = 6;
        for (const b of paths) { b(ctx); ctx.fill(); ctx.stroke(); }
        ctx.restore();
      }
      // ① 윤곽: 모든 부위를 윤곽색으로 두껍게
      ctx.fillStyle = line; ctx.strokeStyle = line; ctx.lineWidth = OUTLINE;
      for (const b of paths) { b(ctx); ctx.fill(); ctx.stroke(); }
      // ② 채움
      ctx.fillStyle = fill;
      for (const b of paths) { b(ctx); ctx.fill(); }
    },
  };
}

/** 관절 주름: (x,y)에서 ang 방향 반너비 hw의 짧은 선 */
function creaseLine(ctx, x, y, ang, hw, alpha) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.strokeStyle = `rgba(${CREASE},${Math.min(1, alpha)})`;
  ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(ang) * hw, y - Math.sin(ang) * hw);
  ctx.lineTo(x + Math.cos(ang) * hw, y + Math.sin(ang) * hw);
  ctx.stroke();
  ctx.restore();
}

/** 손가락별 curl 값 얻기 (숫자면 공통, 배열이면 개별. i: 0=엄지, 1~4=검지~새끼) */
function curlOf(p, i) {
  return Array.isArray(p.curl) ? (p.curl[i] ?? 0) : (p.curl ?? 0);
}

export function drawGuideHand(ctx, p = {}, view = 'side', opts = {}) {
  const cx = opts.cx ?? 160, cy = opts.cy ?? 150, s = opts.scale ?? 1;
  // 호흡 아이들: now가 있으면 아주 미세한 주기 움직임 (정지 자세도 살아있게).
  // 모션 최소화 선호면 0 — 새 기본 포즈 그대로 정적 표시.
  const live = opts.now != null && !reduceMotion();
  const br = live ? Math.sin((opts.now / 2400) * Math.PI * 2) : 0;
  const br2 = live ? Math.sin((opts.now / 2400) * Math.PI * 2 + 1.9) : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  if (view === 'side') drawSide(ctx, p, br, br2);
  else drawFront(ctx, p, br, br2);
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════
// side 뷰 — 팔뚝(고정) + 손(wristAngle 회전)
// 손가락은 2겹: 뒤층(약지·새끼, 어두운 톤·짧게·먼저 굽음)과 앞층(검지·중지)이
// 살짝 어긋나 측면에서도 손가락 여러 개로 읽힌다.
// 옆모습은 시상면이라 MCP·PIP·DIP 굴곡이 그대로 '보이는' 곡선이 된다 —
// 쉼 자세 굴곡을 여기서 온전히 쓰는 이유(정면은 원근 단축으로 다르게 처리).
// ═══════════════════════════════════════════════════════════

// 앞층(검지·중지) 뭉치: 중수골 끝(MCP)에서 3마디
const SIDE_F = {
  base: { x: 58, y: -1 }, len: [26, 19, 14], rad: [11, 9.8, 8.4, 6.9],
  rest: [13, 21, 15],        // 쉼 굴곡(°) — 이완된 손의 기본 호
  drive: [45, 70, 40],       // curl 1.0에서 관절별 추가 굴곡(°)
};
// 뒤층(약지·새끼) 뭉치: 위(-y)로 어긋나고 짧으며 조금 더 굽어 시차를 만든다
const SIDE_B = {
  base: { x: 52, y: -3 }, len: [22, 16, 12], rad: [9, 8.1, 6.9, 5.7],
  rest: [16, 24, 17],        // 새끼 쪽이 더 말리는 캐스케이드
  drive: [46, 72, 41],
};
// 엄지: CMC(손바닥 안) → MCP → IP → 끝. 짧고 굵다는 게 엄지를 엄지로 읽게 하는 단서.
const SIDE_T = {
  base: { x: 12, y: 13 }, dir: 26, len: [22, 14, 10], rad: [11, 9.6, 8.2, 6.8],
  rest: [0, 10, 8], drive: [8, 24, 16],
};

function drawSide(ctx, p, br, br2) {
  const wa = (p.wristAngle ?? 0) + br * 0.5;  // -45 굽힘(아래) ~ +45 폄(위)
  const lagW = Math.max(-8, Math.min(8, (p.__lag && p.__lag.wristAngle) || 0));
  const wx = 4, wy = 14;                       // 손목 기준점(로컬) = 회전 중심 = 꺾임점

  // 접지 그림자 — 팔뚝 아래 길게 한 겹 (손 그림자는 손 레이어가 따로 얹는다)
  groundShadow(ctx, wx - 40, wy + 46, 132, 20, 0.34);

  // 팔뚝: 팔꿈치(굵음) → 손목(가늘음)으로 좁아진다. 균일 굵기면 팔과 손이
  // 한 덩어리 소시지로 읽혀 "손"이 안 보인다(형태 원칙 ①).
  taperLimb(ctx, wx - 152, wx, wy, 26, 16.5,
            shade(ctx, wy - 26, wy + 26, SKIN_HI, SKIN_LO), SKIN_LINE);
  // 소매 커프 — 팔뚝을 덮는 라벤더 슬리브
  capsule(ctx, wx - 152, wy, wx - 98, wy, 54,
          shade(ctx, wy - 28, wy + 28, SLEEVE_HI, SLEEVE), SLEEVE_LINE);

  // 손: 손목 기준 회전 (폄 +각 → 화면상 위쪽으로: 캔버스 y는 아래라 -부호)
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(-wa * D2R);

  const c = clamp01(curlOf(p, 1) + br2 * 0.015);
  const trail = -lagW * 0.45 * D2R;
  // "한 판으로 꺾이는" 판(plate) 계수: 손목이 극단으로 갈수록 손가락을 펴
  //  손바닥과의 각도를 유지 → 극단에서 손끝이 축 처져 형태가 무너지는 것 방지.
  const plate = clamp01(Math.abs(p.wristAngle ?? 0) / 34);
  const cF = c * (1 - 0.72 * plate);           // 손가락 마디 굽힘에만 적용(엄지·손바닥 제외)
  // 쉼 굴곡도 극단에서는 절반만 — 판 계수와 결을 맞춘다(끝범위에서 손이 말려 보이지 않게).
  const restK = (1 - 0.5 * plate) * (1 - clamp01(cF * 1.5));

  const palmLen = 60;                          // 너클(손가락 밑동)까지의 손등 길이
  const skinG = shade(ctx, -30, 34, SKIN_HI, SKIN_LO);

  // ── 뒤층: 약지·새끼 뭉치 ──
  const back = partRenderer(ctx, shade(ctx, -26, 18, SKIN_BACK_HI, SKIN_BACK), SKIN_LINE);
  addChain(back, sideFinger(SIDE_B, trail, cF, restK));
  back.render();

  // ── 앞층: 손등(손날 실루엣) + 검지·중지 뭉치 ──
  // 손등은 균일 캡슐이 아니라 패스 — 손목에서 잘록하게 시작해 너클로 두꺼워지고
  // 손바닥 쪽(+y)은 두덩으로 불룩. 이 비대칭이 "벙어리장갑"과 "손"을 가른다.
  const parts = partRenderer(ctx, skinG, SKIN_LINE);
  parts.path((c2) => {
    c2.beginPath();
    c2.moveTo(-14, -16);                                        // 손목 위(손등 쪽)
    c2.quadraticCurveTo(palmLen * 0.55, -21, palmLen + 2, -17); // 손등 능선
    c2.quadraticCurveTo(palmLen + 11, -7, palmLen + 8, 7);      // 너클 앞머리
    c2.quadraticCurveTo(palmLen * 0.6, 24, 20, 25);             // 손바닥 두덩(불룩)
    c2.quadraticCurveTo(2, 25, -14, 17);                        // 손목 아래로 좁아짐
    c2.closePath();
  });

  const fc = sideFinger(SIDE_F, trail, cF, restK);
  addChain(parts, fc);

  // 엄지 — 손과 '한 덩어리'로 합쳐 그린다(별도 레이어로 빼면 자기 윤곽선이 손바닥
  // 위를 가로질러, 손에 붙은 부위가 아니라 위에 얹힌 소시지처럼 읽힌다).
  // 대신 아래에서 물갈퀴(web) 주름 한 줄로 경계를 암시한다.
  const thc = clamp01(curlOf(p, 0) + c * 0.4); // 손가락 굽힘을 살짝 따라감
  const th = SIDE_T;
  const tk = chain(th.base.x, th.base.y, th.dir * D2R, th.len, th.rad,
                   th.rest.map((r, i) => (r * (1 - clamp01(thc * 1.2)) + th.drive[i] * thc) * D2R));
  addChain(parts, tk);

  parts.render({ shadow: 0.16 });

  // 엄지 물갈퀴 주름 — 손등에서 엄지가 갈라져 나오는 경계 한 줄
  ctx.save();
  ctx.strokeStyle = `rgba(${CREASE},.34)`;
  ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(16, 4); ctx.quadraticCurveTo(26, 14, 30, 22); ctx.stroke();
  ctx.restore();

  // 손가락 경계 암시 — 앞층 뭉치 위에 얕은 홈 한 줄(검지↔중지). 뭉치가 통짜
  // 주걱으로 안 읽히게 하는 최소한의 신호(개별 손가락을 다 그리면 옆모습이 지저분해짐).
  fingerSeam(ctx, fc.joints, 0.5 + cF * 0.25);

  // 관절 주름 — PIP·DIP에 짧게 (굽을수록 진하게)
  const bendVis = cF + (1 - restK) * 0;
  if (bendVis > 0.25) {
    for (const i of [1, 2]) {
      const j = fc.joints[i];
      creaseLine(ctx, j.x, j.y, fc.dirs[i - 1] + Math.PI / 2, j.r * 0.7, (bendVis - 0.25) * 0.6);
    }
  }

  // 손목 경첩 주름 — 회전 중심(로컬 원점)에 오목한 접힘선.
  drawWristHinge(ctx, plate);

  ctx.restore();

  // 동작 궤적 오버레이 — follow 재생 중(__lag 존재)에만. intro/outro(정적)엔 숨김.
  // 굽힘·폄은 손목 중심 회전 → 호+화살표. a1(=40°)=굽힘 끝, 진행이 굽힘쪽이면 towardA1.
  if (p.__lag) {
    const l = p.__lag.wristAngle ?? 0;
    arcArrow(ctx, wx, wy, 128, -33 * D2R, 40 * D2R, -wa * D2R, l >= 0, Math.min(1, Math.abs(l) / 5));
  }
}

/** 옆모습 손가락 뭉치 체인 — 쉼 굴곡(restK로 감쇠) + 입력 굴곡(cF)을 관절별로 합산.
 *  굽힘이 세 관절에 나뉘어 들어가 주먹에서도 마디가 살아 있다. */
function sideFinger(spec, trail, cF, restK) {
  const bend = spec.rest.map((r, i) => (r * restK + spec.drive[i] * cF) * D2R);
  // 굽을수록 마디가 카메라 쪽으로 눕는 만큼만 살짝 단축 (옆모습은 대부분 실제 길이)
  const len = spec.len.map((L, i) => L * (1 - (i === 0 ? 0.10 : 0.05) * cF));
  return chain(spec.base.x, spec.base.y, trail, len, spec.rad, bend);
}

/** 옆모습 손가락 뭉치의 경계 홈 — 관절을 따라가는 얕은 선 한 줄.
 *  뭉치 위쪽(-y 방향)으로 살짝 띄워 "검지 뒤에 중지가 있다"를 암시한다. */
function fingerSeam(ctx, joints, alpha) {
  if (alpha <= 0.02 || joints.length < 3) return;
  const off = (a, b, d) => {                     // 선분 진행방향의 왼쪽(-y쪽)으로 d만큼
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    return [a.x + (dy / L) * d, a.y - (dx / L) * d];
  };
  ctx.save();
  ctx.strokeStyle = `rgba(${CREASE},${Math.min(0.5, alpha * 0.5)})`;
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < joints.length - 1; i++) {
    const [x, y] = off(joints[i], joints[i + 1], joints[i].r * 0.55);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  const last = joints[joints.length - 1];
  ctx.lineTo(last.x, last.y - last.r * 0.35);
  ctx.stroke();
  ctx.restore();
}

/** 손목 경첩: 접힘점에 오목 주름 한 줄 (fold=0 은은 → 1 뚜렷).
 *  회전 중심(로컬 원점)에 위치해 "여기서 꺾인다"를 드러낸다. */
function drawWristHinge(ctx, fold) {
  ctx.save();
  ctx.lineCap = 'round';
  // 접힘선 한 줄만 — 두 줄로 그리면 손목에 팔찌를 낀 것처럼 읽힌다.
  // 손바닥 쪽(+y)에서 진하고 손등 쪽(-y)에서 사라지게: 실제로 주름은 안쪽에 잡힌다.
  const g = ctx.createLinearGradient(0, -16, 0, 20);
  g.addColorStop(0, `rgba(${CREASE},0)`);
  g.addColorStop(1, `rgba(${CREASE},${0.3 + fold * 0.36})`);
  ctx.strokeStyle = g;
  ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(3, -14); ctx.quadraticCurveTo(-4, 3, 4, 20); ctx.stroke();
  ctx.restore();
}

// ─── 동작 궤적 오버레이 공용 (테마 시안, 손보다 연하게) ───

/** 진행 방향 화살표: (x,y)=머리 끝, ang=향하는 방향, len=축 길이, alpha=진하기 */
function motionArrow(ctx, x, y, ang, len, alpha) {
  ctx.save();
  ctx.strokeStyle = `rgba(${MOTION},${alpha * 0.75})`;
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
  ctx.lineTo(x - Math.cos(ang) * 4, y - Math.sin(ang) * 4);
  ctx.stroke();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = `rgba(${MOTION},${alpha})`;
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-11, 8); ctx.lineTo(-11, -8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** 관절(손목) 중심 반투명 호(⌒) + 양끝 가동범위 눈금 + 현재 위치의 진행 화살표.
 *  회전 동작(굽힘·폄 / 좌우 편위)에 공통. towardA1=진행이 a1(끝)쪽인지, speed 0~1. */
function arcArrow(ctx, px, py, R, a0, a1, aNow, towardA1, speed) {
  ctx.save();
  ctx.translate(px, py);
  ctx.strokeStyle = `rgba(${MOTION},.28)`;
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, R, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
  ctx.strokeStyle = `rgba(${MOTION},.36)`; ctx.lineWidth = 3;
  for (const a of [a0, a1]) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (R - 8), Math.sin(a) * (R - 8));
    ctx.lineTo(Math.cos(a) * (R + 8), Math.sin(a) * (R + 8));
    ctx.stroke();
  }
  const dir = (towardA1 ? 1 : -1) * (a1 >= a0 ? 1 : -1);
  const alpha = 0.3 + speed * 0.5;
  ctx.translate(Math.cos(aNow) * R, Math.sin(aNow) * R);
  ctx.rotate(Math.atan2(Math.cos(aNow) * dir, -Math.sin(aNow) * dir)); // 접선(진행) 방향
  ctx.fillStyle = `rgba(${MOTION},${alpha})`;
  ctx.beginPath(); ctx.moveTo(11, 0); ctx.lineTo(-8, 8); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** front 동작 궤적 — 운동 종류를 __lag의 애니 트랙으로 판별해 알맞은 오버레이.
 *  회전(편위)은 호+화살표, 선형(핀치·악력·벌리기)은 방향 화살표. follow에서만 호출됨. */
function drawFrontMotionGuide(ctx, p, lag) {
  // ① 좌우 편위: 손목(0,70) 중심 회전 → 호+화살표 (손끝 바로 바깥 R=150)
  if (lag.devAngle != null) {
    const phi = (d) => Math.atan2(-Math.cos(d * D2R), Math.sin(d * D2R));
    const dev = p.devAngle ?? 0;
    arcArrow(ctx, 0, 70, 150, phi(-28), phi(28), phi(dev),
             lag.devAngle <= 0, Math.min(1, Math.abs(lag.devAngle) / 4));
    return;
  }
  // ② 핀치: 접점(≈-44,-6)으로 엄지·검지가 모임 → 두 화살표 수렴(벌리면 발산)
  if (lag.pinchGap != null) {
    const closing = lag.pinchGap > 0;            // pinchGap 감소 = 붙는 중
    const a = 0.3 + Math.min(1, Math.abs(lag.pinchGap) / 0.4) * 0.5;
    const heads = [[-47, 5, Math.atan2(-11, 3)], [-38, -17, Math.atan2(11, -6)]];
    for (const [x, y, to] of heads) motionArrow(ctx, x, y, closing ? to : to + Math.PI, 15, a);
    return;
  }
  // ③ 악력·힘줄 활주: 손가락이 손바닥 쪽(아래+y)으로 말림 → 아래 화살표(펴면 위)
  if (lag.curl != null) {
    const closing = lag.curl < 0;                // curl 증가 = 주먹
    const a = 0.3 + Math.min(1, Math.abs(lag.curl) / 0.4) * 0.5;
    const ang = closing ? Math.PI / 2 : -Math.PI / 2;
    const hy = closing ? -18 : -46;
    for (const x of [-14, 8]) motionArrow(ctx, x, hy, ang, 26, a);
    return;
  }
  // ④ 손가락 벌리기: 좌우로 펴짐/모임 → 양옆 바깥/안쪽 화살표(↔)
  if (lag.spread != null) {
    const opening = lag.spread < 0;              // spread 증가 = 벌림
    const a = 0.3 + Math.min(1, Math.abs(lag.spread) / 0.3) * 0.5;
    motionArrow(ctx, -47, -58, opening ? Math.PI : 0, 20, a);
    motionArrow(ctx, 47, -50, opening ? 0 : Math.PI, 20, a);
  }
}

// ═══════════════════════════════════════════════════════════
// front 뷰 — 손바닥 + 3마디 손가락 + 엄지 (편위·활주·핀치·벌리기)
// 정면은 손바닥 평면이라 굴곡(MCP·PIP·DIP)이 화면 안 회전이 아니라 '카메라 쪽으로
// 눕는' 원근 단축으로 보인다. 그래서 쉼 자세를 각도가 아니라 마디 길이 단축 +
// 가운데로 모이는 미세한 수렴으로 준다(각도로 주면 손가락이 옆으로 눕는다).
// 입력 굴곡(curl/curlTip)만 화면 안 회전 + 근위마디 단축으로 주먹·갈고리를 만든다.
// ═══════════════════════════════════════════════════════════

// 핀치 접점 (검지·엄지가 만나는 지점, 손 로컬 좌표)
const PINCH_C = { x: -44, y: -6 };
// 엄지: CMC(무지구 안쪽) → 중수골 → 기절골 → 말절골
const TH_BASE = { x: -26, y: 44 };
const TH_LEN = [27, 19, 13];
const TH_RAD = [10.5, 9.2, 7.8, 6.4];

// 손가락 0=검지 1=중지 2=약지 3=새끼
const F_BASE_X = [-27, -9, 9, 27];
const F_BASE_Y = [-3, -8, -6, -2];             // 너클 아치 (가운데 높고 새끼 낮음)
const F_LEN = [52, 60, 56, 44];
const F_RAD = [8.2, 8.8, 8.2, 6.8];            // MCP 반지름 (원위로 갈수록 축소)
const F_SEG = [0.42, 0.33, 0.25];              // 마디 길이 비율 (근위 → 원위)
const F_FAN = [-0.9, -0.25, 0.35, 1.15];       // 벌릴 때 기울기 방향·비율
const F_STAG = [1, 0.67, 0.33, 0];             // 시차: 새끼(0) 먼저 → 검지(1) 나중 (§4③)
// 쉼 수렴(°): 이완된 손가락은 가운데(중지)로 아주 살짝 모인다. + = 새끼 쪽(+x).
const F_CONV = [3.0, 0.9, -1.1, -3.2];
// 쉼 단축: 완전히 펴지지 않은 손가락의 원근 단축. 새끼로 갈수록 조금 더 말린다.
const F_SHORT = [[0.97, 0.95, 0.93], [0.97, 0.95, 0.93], [0.96, 0.94, 0.91], [0.95, 0.92, 0.89]];
const STAG = 0.18;                             // 시차 폭 (값 영역 재매핑)

/** 2관절 IK: 밑동(bx,by)→목표(tx,ty)를 마디 a,b로 잇는 관절 위치.
 *  목표가 닿는 범위 밖이면 방향을 유지한 채 거리만 보정.
 *  side=+1 → 진행방향의 (dy,-dx) 쪽으로 관절이 볼록. */
function ik2(bx, by, tx, ty, a, b, side) {
  let dx = tx - bx, dy = ty - by;
  const d = Math.hypot(dx, dy) || 0.001;
  const ux = dx / d, uy = dy / d;
  const cd = Math.max(Math.abs(a - b) + 0.5, Math.min(a + b - 0.5, d));
  const proj = (a * a - b * b + cd * cd) / (2 * cd);
  const h = Math.sqrt(Math.max(0, a * a - proj * proj));
  return {
    mx: bx + ux * proj + side * uy * h,
    my: by + uy * proj - side * ux * h,
    tx: bx + ux * cd, ty: by + uy * cd,
  };
}

/** IK가 낸 '중간관절 → 끝' 직선을 두 마디로 쪼갠다 — 사이 관절을 살짝 볼록하게 밀어
 *  마디가 하나 더 있는 것이 보이게 하되, 끝점은 그대로라 접촉(핀치)이 어긋나지 않는다.
 *  @returns {{x,y}} 사이 관절 위치 */
function splitJoint(mx, my, tx, ty, ratio, bulge) {
  const ux = tx - mx, uy = ty - my, L = Math.hypot(ux, uy) || 1;
  return { x: mx + ux * ratio + (uy / L) * bulge, y: my + uy * ratio - (ux / L) * bulge };
}

/** 손바닥 윤곽 (정면): 너클 아치 + 소지구·무지구 불룩 + 손목으로 좁아짐 */
function palmFrontPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(24, 74);                       // 손목 오른쪽 (커프 속으로)
  ctx.quadraticCurveTo(34, 46, 32, 22);     // 소지구(새끼 두덩) 불룩
  ctx.quadraticCurveTo(35, -1, 30, -3);     // 너클 오른쪽 모서리
  ctx.quadraticCurveTo(12, -12, -6, -11);   // 너클 아치 (가운데 최고)
  ctx.quadraticCurveTo(-24, -9, -30, -1);   // 검지 쪽 모서리
  ctx.quadraticCurveTo(-36, 8, -34, 22);    // 왼쪽 옆
  ctx.quadraticCurveTo(-40, 38, -32, 56);   // 무지구(엄지 두덩) 불룩
  ctx.quadraticCurveTo(-28, 66, -24, 74);   // 손목 왼쪽
  ctx.closePath();
}

/** 손금 (은은하게 2~3줄) — alpha로 강도 조절 (주먹 쥘수록 감춤) */
function palmCreases(ctx, alpha = 1) {
  if (alpha <= 0.03) return;
  ctx.save();
  ctx.strokeStyle = `rgba(${CREASE},${0.3 * alpha})`;
  ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-22, 14); ctx.quadraticCurveTo(2, 6, 23, 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-18, 26); ctx.quadraticCurveTo(4, 20, 25, 28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-15, 12); ctx.quadraticCurveTo(-4, 33, -17, 52); ctx.stroke();
  ctx.restore();
}

/** 접점 반짝 (4각 별) — 명세서 §4④ "붙는 순간 접점에 작은 반짝 1개" */
function sparkle(ctx, x, y, r) {
  if (r <= 0.5) return;
  ctx.save();
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.4;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawFront(ctx, p, br, br2) {
  const dev = (p.devAngle ?? 0) + br * 0.6;   // -30 요측 ~ +30 척측
  const spread = clamp01((p.spread ?? 0.5) + br2 * 0.02);
  const pinch = 1 - clamp01(p.pinchGap ?? 1); // 0 벌림 ~ 1 붙음
  const tipAll = clamp01(p.curlTip ?? 0);
  const lag = p.__lag || {};
  const fanLag = Math.max(-6, Math.min(6, lag.devAngle || 0)) * 0.35;

  // 접지 그림자 — 손 뒤 은은한 타원 (소매·손 모두 이 위에 얹힌다)
  groundShadow(ctx, 0, 40, 92, 74, 0.26);

  // 팔뚝(소매) 본체는 고정 — 편위는 손목(0,70)에서 꺾임
  capsule(ctx, 0, 84, 0, 124, 38,
          shade(ctx, 84, 124, SLEEVE, SLEEVE_LINE), SLEEVE_LINE);

  ctx.save();
  ctx.translate(0, 70);
  ctx.rotate(dev * D2R);
  ctx.translate(0, -70);

  const parts = partRenderer(ctx, shade(ctx, -66, 76, SKIN_HI, SKIN_LO), SKIN_LINE);
  parts.path(palmFrontPath);

  const fanDeg = -2 + spread * 16;            // 0=살짝 모음 ~ 1=활짝
  const convK = 1 - spread * 0.6;             // 활짝 벌리면 수렴은 풀린다
  const perFinger = Array.isArray(p.curl);    // 배열이면 데이터 그대로 (시차 없음)
  let indexTip = null;
  let bendSum = 0;
  const creases = [];                         // [x, y, ang, halfW, alpha]

  // ── 손가락 4개: 부채꼴 벌리기 + 3마디 접기 + 시차 ──
  for (let i = 0; i < 4; i++) {
    const raw = clamp01(curlOf(p, i + 1));
    const staged = perFinger ? raw : clamp01(raw * (1 + STAG) - STAG * F_STAG[i] + br2 * 0.012);
    const t = clamp01(tipAll * (1 + STAG) - STAG * F_STAG[i]);
    const ci = clamp01(staged + (i > 0 ? pinch * 0.15 : 0)); // 핀치 중 나머지 손가락 살짝 이완
    const bend = clamp01(ci * 0.85 + t);
    const th = (-90 + F_FAN[i] * fanDeg + fanLag) * D2R;
    const r0 = F_RAD[i];
    const rad = [r0, r0 * 0.92, r0 * 0.82, r0 * 0.70];
    const bx = F_BASE_X[i], by = F_BASE_Y[i];
    const seg = F_SEG.map((k) => F_LEN[i] * k);

    // 검지: 핀치 중엔 엄지 쪽으로 평면 굽힘 (IK로 접점까지)
    if (i === 0 && pinch > 0.001) {
      const reach = seg[0] + seg[1] + seg[2];
      const sx = bx + Math.cos(th) * reach, sy = by + Math.sin(th) * reach;
      const gx = sx + (PINCH_C.x - sx) * pinch, gy = sy + (PINCH_C.y - sy) * pinch;
      const k = ik2(bx, by, gx, gy, seg[0], seg[1] + seg[2], -1);
      // IK의 관절 볼록(h)은 부족거리의 제곱근이라 시작 직후 급증 → 직선 자세와
      // 스무스스텝으로 블렌드해 C0 불연속(관절 팝) 제거.
      const r = Math.min(1, pinch / 0.15), rr = r * r * (3 - 2 * r);
      const smx = bx + Math.cos(th) * seg[0], smy = by + Math.sin(th) * seg[0];
      const pip = { x: smx + (k.mx - smx) * rr, y: smy + (k.my - smy) * rr };
      const dip = splitJoint(pip.x, pip.y, k.tx, k.ty, seg[1] / (seg[1] + seg[2]), 2.2 * rr);
      const joints = [
        { x: bx, y: by, r: rad[0] }, { x: pip.x, y: pip.y, r: rad[1] },
        { x: dip.x, y: dip.y, r: rad[2] }, { x: k.tx, y: k.ty, r: rad[3] },
      ];
      addChain(parts, { joints, dirs: [] });
      if (pinch > 0.3) {
        creases.push([pip.x, pip.y, Math.atan2(k.ty - pip.y, k.tx - pip.x) + Math.PI / 2,
                      rad[1] * 0.8, (pinch - 0.3) * 0.55]);
      }
      indexTip = { x: k.tx, y: k.ty };
      continue;
    }

    // 접기 모델(정면): 근위마디는 굽을수록 카메라 쪽으로 누워 짧아지고,
    // 중간·끝마디가 화면 안에서 손바닥 쪽으로 돌아 내려온다(curl + curlTip).
    const restK = 1 - clamp01(bend * 2.2);
    const len = [
      seg[0] * (1 - 0.5 * ci) * (1 - (1 - F_SHORT[i][0]) * restK),
      seg[1] * (1 - 0.15 * bend) * (1 - (1 - F_SHORT[i][1]) * restK),
      seg[2] * (1 - (1 - F_SHORT[i][2]) * restK),
    ];
    const conv = F_CONV[i] * convK * restK;
    const ang = [
      (conv * 0.5 + ci * 35) * D2R,
      (conv + bend * 95) * D2R,
      (conv * 0.8 + bend * 45 + t * 30) * D2R,
    ];
    const ch = chain(bx, by, th, len, rad, ang);
    addChain(parts, ch);
    bendSum += bend;
    if (bend > 0.22) {
      creases.push([ch.joints[1].x, ch.joints[1].y, ch.dirs[0] + Math.PI / 2,
                    rad[1] * 0.85, Math.min(0.55, (bend - 0.22) * 1.1)]);
    }
  }

  // ── 엄지: IK — 쉼 → 핀치(접점) → 주먹(손바닥 가로질러) 목표 블렌드 ──
  const tc = clamp01(curlOf(p, 0));
  let gx = -58 - spread * 6, gy = 10 + br2 * 1.5;        // 쉼: 왼쪽 밖으로
  gx += (PINCH_C.x - gx) * pinch; gy += (PINCH_C.y - gy) * pinch;
  gx += (2 - gx) * tc; gy += (32 - gy) * tc;
  // 중수골 + (기절+말절)로 IK한 뒤 마지막 직선을 IP에서 쪼갠다 — 끝점(접점)은 그대로.
  const tk = ik2(TH_BASE.x, TH_BASE.y, gx, gy, TH_LEN[0], TH_LEN[1] + TH_LEN[2], 1);
  const tIp = splitJoint(tk.mx, tk.my, tk.tx, tk.ty, TH_LEN[1] / (TH_LEN[1] + TH_LEN[2]), -2.6);

  // ── 2패스 렌더 (한 덩어리 실루엣) → 은은한 주름 디테일 ──
  parts.render({ shadow: 0.15 });
  palmCreases(ctx, 1 - clamp01((bendSum / 3) * 1.1));    // 주먹 쥘수록 손금 감춤

  // 엄지는 별도 레이어(자체 윤곽) — 주먹·핀치에서 손바닥을 가로지르는 게
  // 실루엣에 묻히지 않고 보인다.
  const thumb = partRenderer(ctx, shade(ctx, -10, 70, SKIN, SKIN_LO), SKIN_LINE);
  addChain(thumb, {
    joints: [
      { x: TH_BASE.x, y: TH_BASE.y, r: TH_RAD[0] }, { x: tk.mx, y: tk.my, r: TH_RAD[1] },
      { x: tIp.x, y: tIp.y, r: TH_RAD[2] }, { x: tk.tx, y: tk.ty, r: TH_RAD[3] },
    ],
    dirs: [],
  });
  thumb.render({ shadow: 0.16 });
  const tb = Math.max(pinch, tc);
  if (tb > 0.35) {
    creases.push([tIp.x, tIp.y, Math.atan2(tk.ty - tIp.y, tk.tx - tIp.x) + Math.PI / 2,
                  TH_RAD[2] * 0.8, (tb - 0.35) * 0.55]);
  }
  for (const [x, y, ang, hw, a] of creases) creaseLine(ctx, x, y, ang, hw, a);

  // ── 핀치 접점 반짝 — 붙는 "순간"만: 닫히는 속도(__lag)로 게이트, 유지 중엔 소멸.
  //    __lag가 없으면(정지 일러스트) 항상 표시.
  if (pinch > 0.86 && indexTip) {
    const closing = lag.pinchGap == null ? 1 : clamp01(lag.pinchGap * 22);
    const k = ((pinch - 0.86) / 0.14) * closing;
    sparkle(ctx, (tk.tx + indexTip.x) / 2 - 8, (tk.ty + indexTip.y) / 2 - 7, 7 * k);
  }

  ctx.restore();

  // 소매 커프 — 맨 위에 그려 손목 이음새를 항상 덮음 (손이 커프 속에서 움직임)
  ctx.strokeStyle = SLEEVE_LINE; ctx.lineWidth = 3;
  ctx.fillStyle = shade(ctx, 64, 88, SLEEVE_HI, SLEEVE);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-27, 64, 54, 24, 10); else ctx.rect(-27, 64, 54, 24);
  ctx.fill(); ctx.stroke();

  // 동작 궤적 오버레이 — follow 재생 중(__lag 존재)에만. intro/outro(정적)엔 숨김.
  if (p.__lag) drawFrontMotionGuide(ctx, p, p.__lag);
}
