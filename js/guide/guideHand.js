// ═══════════════════════════════════════════════════════════
// guideHand.js — 파라미터로 조종하는 벡터 손 (명세서 §2)
// drawGuideHand(ctx, p, view, opts)
//   p: { wristAngle, devAngle, curl(number|number[5]), curlTip, spread, pinchGap,
//        __lag(animPlayer가 주는 팔로우스루 지연값) }
//   view: 'side'(팔뚝+손날, 굽힘·폄) | 'front'(손바닥, 편위·손가락·핀치)
//   opts: { cx, cy, scale, now(ms — 있으면 호흡·미세 움직임 활성) }
// 둥근 한 덩어리 실루엣: 부위를 모아 2패스(윤곽→채움)로 렌더해 이음새 없음.
//   · 손가락 2마디 접기 — curl은 몸마디(카메라 쪽 접힘), curlTip은 끝마디(갈고리)
//   · 새끼→검지 순 시차 (§4③) / spread 부채꼴 벌리기 (§4⑥)
//   · 엄지 2마디 IK + 핀치 시 검지와 실제 접촉 + 접점 반짝 (§4④)
//   · 관절 주름·손금은 은은한 선으로만 (딱딱한 경계선 대신)
//   · 호흡 아이들(opts.now) + 팔로우스루(p.__lag)로 정지 순간에도 살아있게
//   · 편위(devAngle)는 손목(0,70)에서 꺾임 — 팔뚝·커프 고정
// 이모지 미사용(벡터 드로잉) — 명세서의 이모지 투명 이슈 회피.
// 렌더 스타일은 앱 밤하늘 테마에 맞춘다(아래 팔레트 주석). 형태 원칙 셋:
//   ① 손목은 잘록하게 — 팔뚝(굵음)→손목(가늘음) 테이퍼가 없으면 팔과 손이 한 덩어리로 읽힘
//   ② 손가락은 손등보다 확실히 가늘게, 끝으로 갈수록 더 가늘게
//   ③ 엄지는 손과 한 덩어리로 합쳐 그리고 물갈퀴 주름으로만 경계 암시
//      (별도 레이어로 빼면 자기 윤곽선이 손바닥을 가로질러 얹힌 소시지처럼 보임)
// ═══════════════════════════════════════════════════════════

// ─── 팔레트 — css/styles.css 토큰과 통일 ───
// 배경은 밤하늘 인디고(--grad-surface #2a3160→#1e2550). 그 위에서:
//   · 피부는 따뜻한 살구 유지 — 유일한 난색이라 시선이 손에 먼저 간다.
//   · 소매는 쨍한 풀색(#7fd28a) 대신 --sage(#6a5fa0) 뮤트 라벤더. 초록은 이 테마에서
//     혼자 튀어 손보다 소매가 먼저 읽혔다. 라벤더는 배경과 같은 계열이라 뒤로 물러난다.
//   · 모션 호·화살표는 --water(#8fcef0) 시안 — 살구·라벤더 어디에도 안 묻히고,
//     진행 바(--grad-bar 라벤더→시안)와 같은 "움직임" 색 언어를 쓴다.
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

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 부위 채움용 세로 그라데이션 — 위(빛)에서 아래(그늘)로. 플랫 일러스트 톤은 유지하고
 *  납작함만 덜어내는 정도의 폭. 현재 변환 공간 기준이라 회전된 손 안에서도 방향이 맞다. */
function shade(ctx, top, bot, hi, lo) {
  const g = ctx.createLinearGradient(0, top, 0, bot);
  g.addColorStop(0, hi); g.addColorStop(1, lo);
  return g;
}

/** 접지 그림자 — 부위 아래 은은한 타원 한 겹(블러 필터 없이 방사 그라데이션으로).
 *  손이 배경에 붙어 보이지 않게 살짝 띄운다. */
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

/** 둥근 캡 막대(캡슐) — 소매 등 단독 부위용 */
function capsule(ctx, x1, y1, x2, y2, w, fill, line) {
  ctx.lineCap = 'round';
  if (line) {
    ctx.strokeStyle = line; ctx.lineWidth = w + 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.strokeStyle = fill; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/** 굵기가 변하는 부위(팔뚝) — x1(굵음) → x2(가늘음), x2 끝은 반원으로 마감.
 *  손목이 잘록해야 팔과 손이 한 덩어리로 안 읽힌다. 반원 끝은 회전하는 손의
 *  이음새(피벗)를 항상 덮어 준다. */
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
  if (line) { ctx.strokeStyle = line; ctx.lineWidth = 5; build(); ctx.stroke(); }
  ctx.fillStyle = fill; build(); ctx.fill();
}

/** 손가락별 curl 값 얻기 (숫자면 공통, 배열이면 개별) */
function curlOf(p, i) {
  return Array.isArray(p.curl) ? (p.curl[i] ?? 0) : (p.curl ?? 0);
}

/** 손 부위를 모아 2패스로 렌더 — ① 윤곽(두껍게) ② 채움.
 *  부위끼리 경계선이 생기지 않아 둥근 한 덩어리 실루엣이 된다. */
function partRenderer(ctx, fill = SKIN, line = SKIN_LINE) {
  const caps = [];   // 캡슐 부위 (push 순서 = 채움 순서: 나중 부위가 위)
  const paths = [];  // 패스 부위 (손바닥 등 — 채움 시 캡슐보다 아래)
  function strokeCaps(color, extra) {
    ctx.strokeStyle = color; ctx.lineCap = 'round';
    for (const c of caps) {
      ctx.lineWidth = c.w + extra;
      ctx.beginPath(); ctx.moveTo(c.x1, c.y1); ctx.lineTo(c.x2, c.y2); ctx.stroke();
    }
  }
  return {
    cap(x1, y1, x2, y2, w) { caps.push({ x1, y1, x2, y2, w }); },
    path(build) { paths.push(build); },
    /** @param {{shadow?:number}} o - shadow: 드롭 그림자 진하기(0이면 생략) */
    render(o = {}) {
      const sh = o.shadow ?? 0;
      ctx.lineJoin = 'round';
      // ⓪ 드롭 그림자: 같은 실루엣을 살짝 아래로 밀어 어둡게 한 겹 — 배경에서 손이 뜬다.
      //    겹치는 레이어끼리 그림자가 누적돼 탁해지지 않게 alpha를 낮게 유지한다.
      if (sh > 0) {
        ctx.save();
        ctx.translate(2, 5);
        ctx.fillStyle = `rgba(${SHADE},${sh})`; ctx.strokeStyle = `rgba(${SHADE},${sh})`;
        ctx.lineWidth = 6;
        for (const b of paths) { b(ctx); ctx.fill(); ctx.stroke(); }
        strokeCaps(`rgba(${SHADE},${sh})`, 6);
        ctx.restore();
      }
      // ① 윤곽: 모든 부위를 윤곽색으로 두껍게
      ctx.fillStyle = line; ctx.strokeStyle = line; ctx.lineWidth = 5;
      for (const b of paths) { b(ctx); ctx.fill(); ctx.stroke(); }
      strokeCaps(line, 5);
      // ② 채움: 손바닥 → 손가락·엄지 순 (접힌 손가락이 손바닥 위로)
      ctx.fillStyle = fill;
      for (const b of paths) { b(ctx); ctx.fill(); }
      strokeCaps(fill, 0);
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

export function drawGuideHand(ctx, p = {}, view = 'side', opts = {}) {
  const cx = opts.cx ?? 160, cy = opts.cy ?? 150, s = opts.scale ?? 1;
  // 호흡 아이들: now가 있으면 아주 미세한 주기 움직임 (정지 자세도 살아있게)
  const br = opts.now != null ? Math.sin((opts.now / 2400) * Math.PI * 2) : 0;
  const br2 = opts.now != null ? Math.sin((opts.now / 2400) * Math.PI * 2 + 1.9) : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  if (view === 'side') drawSide(ctx, p, br, br2);
  else drawFront(ctx, p, br, br2);
  ctx.restore();
}

// ─── side 뷰: 팔뚝(고정) + 손(wristAngle 회전) ───
// 손가락을 2겹으로: 뒤층(약지·새끼, 어두운 톤·짧게·먼저 굽음)과
// 앞층(검지·중지)이 살짝 어긋나 측면에서도 손가락이 읽힌다 (model/ 참고).
function drawSide(ctx, p, br, br2) {
  const wa = (p.wristAngle ?? 0) + br * 0.5;  // -45 굽힘(아래) ~ +45 폄(위)
  const lagW = Math.max(-8, Math.min(8, (p.__lag && p.__lag.wristAngle) || 0));
  const wx = 4, wy = 14;                       // 손목 기준점(로컬) = 회전 중심 = 꺾임점

  // 접지 그림자 — 팔뚝 아래 길게 한 겹 (손 그림자는 손 레이어가 따로 얹는다)
  groundShadow(ctx, wx - 40, wy + 46, 132, 20, 0.34);

  // 팔뚝: 팔꿈치(굵음) → 손목(가늘음)으로 좁아진다. 균일 굵기 캡슐이면 팔과 손이
  // 한 덩어리 소시지로 읽혀 "손"이 안 보이던 것이 이 형태 문제의 절반이었다.
  taperLimb(ctx, wx - 152, wx, wy, 26, 16.5,
            shade(ctx, wy - 26, wy + 26, SKIN_HI, SKIN_LO), SKIN_LINE);
  // 소매 커프 — 팔뚝을 덮는 라벤더 슬리브 (끝단이 살짝 두툼)
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

  const palmLen = 60;                          // 너클(손가락 밑동)까지의 손등 길이
  const skinG = shade(ctx, -30, 34, SKIN_HI, SKIN_LO);

  // 뒤층: 약지·새끼 뭉치 — 위(-y)로 살짝 어긋나고 짧으며 조금 더 굽어 시차.
  // 앞층보다 가늘게(18/15) 잡아야 두 겹이 "손가락 여러 개"로 읽힌다. 어긋남을 크게 주면
  // 너클 위로 턱이 생겨 손등이 계단처럼 보이므로 손등 능선 안쪽(-7)에 붙여 둔다.
  const back = partRenderer(ctx, shade(ctx, -26, 18, SKIN_BACK_HI, SKIN_BACK), SKIN_LINE);
  const bKn = palmLen - 8, bY = -3;
  const bA2 = trail + (cF * 82 + 7) * D2R;
  const bmx = bKn + Math.cos(trail) * 25, bmy = bY + Math.sin(trail) * 25;
  back.cap(bKn, bY, bmx, bmy, 18);
  back.cap(bmx, bmy, bmx + Math.cos(bA2) * 22, bmy + Math.sin(bA2) * 22, 15);
  back.render();

  // 앞층: 손등(손날 실루엣) + 검지·중지 뭉치.
  // 손등은 균일 캡슐이 아니라 패스 — 손목에서 잘록하게 시작해 너클로 두꺼워지고
  // 손바닥 쪽(+y)은 두덩으로 불룩. 이 비대칭이 "벙어리장갑"과 "손"을 가른다.
  const parts = partRenderer(ctx, skinG, SKIN_LINE);
  parts.path((c2) => {
    c2.beginPath();
    c2.moveTo(-14, -16);                            // 손목 위(손등 쪽) — 팔뚝 끝과 이어지게
    c2.quadraticCurveTo(palmLen * 0.55, -21, palmLen + 2, -17); // 손등 능선
    c2.quadraticCurveTo(palmLen + 11, -7, palmLen + 8, 7);      // 너클 앞머리
    c2.quadraticCurveTo(palmLen * 0.6, 24, 20, 25);             // 손바닥 두덩(불룩)
    c2.quadraticCurveTo(2, 25, -14, 17);            // 손목 아래로 좁아짐
    c2.closePath();
  });

  const a2 = trail + cF * 78 * D2R;            // 손바닥 쪽(+y)으로 굽음
  const seg1 = 31, seg2 = 27;
  const mx = palmLen + Math.cos(trail) * seg1, my = -1 + Math.sin(trail) * seg1;
  const tx = mx + Math.cos(a2) * seg2, ty = my + Math.sin(a2) * seg2;
  parts.cap(palmLen - 2, -1, mx, my, 22);      // 손등(±19)보다 확실히 가늘게
  parts.cap(mx, my, tx, ty, 17);               // 끝마디로 갈수록 더 가늘게

  // 엄지 — 손과 '한 덩어리'로 합쳐 그린다(별도 레이어로 빼면 자기 윤곽선이 손바닥
  // 위를 가로질러, 손에 붙은 부위가 아니라 위에 얹힌 소시지처럼 읽힌다).
  // 대신 아래에서 물갈퀴(web) 주름 한 줄로 경계를 암시한다.
  // 손가락과 나란히 누우면 "다섯째 손가락"이 되므로 아래로 벌리고, 짧고 굵게 —
  // 굵고 짧다는 게 엄지를 엄지로 읽게 하는 형태 단서다.
  const thc = clamp01(curlOf(p, 0) + c * 0.4); // 손가락 굽힘을 살짝 따라감
  const t1x = 31 + 3 * (1 - thc), t1y = 25 + thc * 5;
  const t2x = t1x + 16 - thc * 8, t2y = t1y + 3 + thc * 9;
  parts.cap(12, 13, t1x, t1y, 21);
  parts.cap(t1x, t1y, t2x, t2y, 17);

  parts.render({ shadow: 0.16 });

  // 엄지 물갈퀴 주름 — 손등에서 엄지가 갈라져 나오는 경계 한 줄
  ctx.save();
  ctx.strokeStyle = `rgba(${CREASE},.34)`;
  ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(16, 4); ctx.quadraticCurveTo(26, 14, 30, 22); ctx.stroke();
  ctx.restore();

  // 손가락 경계 암시 — 앞층 뭉치 위에 얕은 홈 한 줄(검지↔중지). 뭉치가 통짜
  // 주걱으로 안 읽히게 하는 최소한의 신호(개별 손가락을 다 그리면 옆모습이 지저분해짐).
  fingerSeam(ctx, palmLen - 2, -1, mx, my, tx, ty, 0.5 + cF * 0.25);

  if (c > 0.25) creaseLine(ctx, mx, my, trail + Math.PI / 2, 8, (c - 0.25) * 0.6);

  // 손목 경첩 주름 — 회전 중심(로컬 원점)에 오목한 접힘선. 각도가 클수록 진해져
  //  "회전이 바로 이 점에서 일어난다"를 드러낸다(팔뚝↔손이 한 덩어리로 안 보이게).
  drawWristHinge(ctx, plate);

  ctx.restore();

  // 동작 궤적 오버레이 — follow 재생 중(__lag 존재)에만. intro/outro(정적)엔 숨김.
  // 굽힘·폄은 손목 중심 회전 → 호+화살표. a1(=40°)=굽힘 끝, 진행이 굽힘쪽이면 towardA1.
  if (p.__lag) {
    const l = p.__lag.wristAngle ?? 0;
    arcArrow(ctx, wx, wy, 128, -33 * D2R, 40 * D2R, -wa * D2R, l >= 0, Math.min(1, Math.abs(l) / 5));
  }
}

/** 옆모습 손가락 뭉치의 경계 홈 — 밑동→중간→끝을 따라가는 얕은 선 한 줄.
 *  뭉치 위쪽(-y 방향)으로 살짝 띄워 "검지 뒤에 중지가 있다"를 암시한다. */
function fingerSeam(ctx, bx, by, mx, my, tx, ty, alpha) {
  if (alpha <= 0.02) return;
  const off = (ax, ay, bx2, by2, d) => {         // 선분 진행방향의 왼쪽(-y쪽)으로 d만큼
    const dx = bx2 - ax, dy = by2 - ay, L = Math.hypot(dx, dy) || 1;
    return [ax + (dy / L) * d, ay - (dx / L) * d];
  };
  const [p1x, p1y] = off(bx, by, mx, my, 6);
  const [p2x, p2y] = off(mx, my, tx, ty, 5);
  ctx.save();
  ctx.strokeStyle = `rgba(${CREASE},${Math.min(0.5, alpha * 0.5)})`;
  ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p1x, p1y);
  ctx.lineTo(p2x, p2y);
  ctx.lineTo(tx + (p2x - mx) * 0.35, ty + (p2y - my) * 0.35);
  ctx.stroke();
  ctx.restore();
}

/** 손목 경첩: 접힘점에 잘록한 음영 + 오목 주름 한 줄 (fold=0 은은 → 1 뚜렷).
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

// ─── front 뷰 보조 ───

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

// 핀치 접점 (검지·엄지가 만나는 지점, 손 로컬 좌표)
const PINCH_C = { x: -44, y: -6 };
// 엄지 밑관절(CMC, 무지구 안쪽)과 마디 길이
const TH_BASE = { x: -26, y: 44 }, TH_L1 = 30, TH_L2 = 26;

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

// ─── front 뷰: 손바닥 + 2마디 손가락 + 엄지 (편위·활주·핀치·벌리기) ───
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

  // ── 손가락 4개 (0=검지 … 3=새끼): 부채꼴 벌리기 + 2마디 접기 + 시차 ──
  // 밑관절은 너클 아치를 따라 (가운데 높고 새끼 낮음), 너비도 손가락별
  const baseX = [-27, -9, 9, 27];
  const baseY = [-3, -8, -6, -2];
  const fW = [16.5, 17.5, 16.5, 13.5];
  const fLen = [52, 60, 56, 44];
  const fanDir = [-0.9, -0.25, 0.35, 1.15]; // 벌릴 때 기울기 방향·비율
  const lag5 = [1, 0.67, 0.33, 0];          // 시차: 새끼(0) 먼저 → 검지(1) 나중 (§4③)
  const STAG = 0.18;                        // 시차 폭 (값 영역 재매핑)
  const fanDeg = -2 + spread * 16;          // 0=살짝 모음 ~ 1=활짝
  const perFinger = Array.isArray(p.curl);  // 배열이면 데이터 그대로 (시차 없음)
  let indexTip = null;
  let bendSum = 0;
  const creases = [];                       // [x, y, ang, halfW, alpha]

  for (let i = 0; i < 4; i++) {
    const raw = clamp01(curlOf(p, i + 1));
    const c = perFinger ? raw : clamp01(raw * (1 + STAG) - STAG * lag5[i] + br2 * 0.012);
    const t = clamp01(tipAll * (1 + STAG) - STAG * lag5[i]);
    const th = (-90 + fanDir[i] * fanDeg + fanLag) * D2R;
    const L1 = fLen[i] * 0.62, L2 = fLen[i] * 0.42;
    const bx = baseX[i], by = baseY[i];
    const w1 = fW[i], w2 = fW[i] * 0.88;   // 끝마디로 갈수록 가늘게

    if (i === 0 && pinch > 0.001) {
      // 검지: 핀치 중엔 엄지 쪽으로 평면 굽힘 (IK로 접점까지).
      // IK의 관절 볼록(h)은 부족거리의 제곱근이라 시작 직후 급증 → 직선 자세와
      // 스무스스텝으로 블렌드해 C0 불연속(관절 팝) 제거.
      const sx = bx + Math.cos(th) * (L1 + L2), sy = by + Math.sin(th) * (L1 + L2);
      const gx = sx + (PINCH_C.x - sx) * pinch, gy = sy + (PINCH_C.y - sy) * pinch;
      const k = ik2(bx, by, gx, gy, L1, L2, -1);
      const r = Math.min(1, pinch / 0.15);
      const rr = r * r * (3 - 2 * r);
      const smx = bx + Math.cos(th) * L1, smy = by + Math.sin(th) * L1; // 직선일 때 중간관절
      const jx = smx + (k.mx - smx) * rr, jy = smy + (k.my - smy) * rr;
      parts.cap(bx, by, jx, jy, w1);
      parts.cap(jx, jy, k.tx, k.ty, w2);
      if (pinch > 0.3) {
        creases.push([jx, jy, Math.atan2(k.ty - jy, k.tx - jx) + Math.PI / 2,
                      w2 * 0.4, (pinch - 0.3) * 0.55]);
      }
      indexTip = { x: k.tx, y: k.ty };
      continue;
    }

    // 접기 모델: 몸마디는 굽을수록 짧아지고(카메라 쪽 접힘),
    // 끝마디는 손바닥 쪽으로 접혀 내려옴 (curl+curlTip)
    // 마디 길이를 덜 줄여 주먹에서도 접힌 손가락 덩어리가 남게 (model/ 주먹 참고)
    const ci = clamp01(c + (i > 0 ? pinch * 0.15 : 0)); // 핀치 중 나머지 손가락 살짝 이완
    const bend = clamp01(ci * 0.85 + t);
    bendSum += bend;
    const L1p = L1 * (1 - 0.46 * ci);
    const mx = bx + Math.cos(th) * L1p, my = by + Math.sin(th) * L1p;
    const th2 = th + bend * 155 * D2R;
    const L2p = L2 * (1 - 0.22 * bend);
    parts.cap(bx, by, mx, my, w1);
    parts.cap(mx, my, mx + Math.cos(th2) * L2p, my + Math.sin(th2) * L2p, w2);
    if (bend > 0.22) {
      creases.push([mx, my, th + Math.PI / 2, w1 * 0.42, Math.min(0.55, (bend - 0.22) * 1.1)]);
    }
  }

  // ── 엄지: 2마디 IK — 쉼 → 핀치(접점) → 주먹(손바닥 가로질러) 목표 블렌드 ──
  const tc = clamp01(curlOf(p, 0));
  let gx = -58 - spread * 6, gy = 10 + br2 * 1.5;        // 쉼: 왼쪽 밖으로
  gx += (PINCH_C.x - gx) * pinch; gy += (PINCH_C.y - gy) * pinch;
  gx += (2 - gx) * tc; gy += (32 - gy) * tc;
  const tk = ik2(TH_BASE.x, TH_BASE.y, gx, gy, TH_L1, TH_L2, 1);

  // ── 2패스 렌더 (한 덩어리 실루엣) → 은은한 주름 디테일 ──
  parts.render({ shadow: 0.15 });
  palmCreases(ctx, 1 - clamp01((bendSum / 3) * 1.1));    // 주먹 쥘수록 손금 감춤

  // 엄지는 별도 레이어(자체 윤곽) — 주먹·핀치에서 손바닥을 가로지르는 게
  // 실루엣에 묻히지 않고 보인다 (model/ 주먹·OK 사인 참고)
  const thumb = partRenderer(ctx, shade(ctx, -10, 70, SKIN, SKIN_LO), SKIN_LINE);
  thumb.cap(TH_BASE.x, TH_BASE.y, tk.mx, tk.my, 20);
  thumb.cap(tk.mx, tk.my, tk.tx, tk.ty, 17);
  thumb.render({ shadow: 0.16 });
  const tb = Math.max(pinch, tc);
  if (tb > 0.35) {
    creases.push([tk.mx, tk.my, Math.atan2(tk.ty - tk.my, tk.tx - tk.mx) + Math.PI / 2,
                  7, (tb - 0.35) * 0.55]);
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
