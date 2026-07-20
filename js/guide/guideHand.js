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
// ═══════════════════════════════════════════════════════════

const SKIN = '#f4c69f';
const SKIN_BACK = '#eab488';  // 뒤층 손가락(측면 겹침) — 살짝 어두워 깊이감
const SKIN_LINE = '#e3a97f';
const SLEEVE = '#7fd28a';
const SLEEVE_LINE = '#54ac63';
const D2R = Math.PI / 180;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 둥근 캡 막대(캡슐) — 소매·팔뚝 등 단독 부위용 */
function capsule(ctx, x1, y1, x2, y2, w, fill, line) {
  ctx.lineCap = 'round';
  if (line) {
    ctx.strokeStyle = line; ctx.lineWidth = w + 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.strokeStyle = fill; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
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
    render() {
      ctx.lineJoin = 'round';
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
  ctx.strokeStyle = `rgba(206,137,94,${Math.min(1, alpha)})`;
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

  // 팔뚝: 왼쪽에서 손목까지 고정 막대 + 소매 커프
  capsule(ctx, wx - 150, wy, wx, wy, 44, SKIN, SKIN_LINE);
  capsule(ctx, wx - 150, wy, wx - 96, wy, 50, SLEEVE, SLEEVE_LINE);

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

  // 뒤층: 약지·새끼 뭉치 — 위(-y)로 살짝 어긋나고 짧으며 조금 더 굽어 시차
  const back = partRenderer(ctx, SKIN_BACK, SKIN_LINE);
  const bKn = 58, bY = -8;                     // 너클 위치(짧은 손바닥)
  const bA2 = trail + (cF * 82 + 7) * D2R;
  const bmx = bKn + Math.cos(trail) * 25, bmy = bY + Math.sin(trail) * 25;
  back.cap(bKn, bY, bmx, bmy, 24);
  back.cap(bmx, bmy, bmx + Math.cos(bA2) * 22, bmy + Math.sin(bA2) * 22, 20);
  back.render();

  // 앞층: 손바닥(손날) + 검지·중지 뭉치
  const parts = partRenderer(ctx);
  const palmLen = 64;
  parts.cap(0, 2, palmLen, 2, 40);

  const a2 = trail + cF * 78 * D2R;            // 손바닥 쪽(+y)으로 굽음
  const seg1 = 30, seg2 = 28;
  const mx = palmLen + Math.cos(trail) * seg1, my = 5 + Math.sin(trail) * seg1;
  const tx = mx + Math.cos(a2) * seg2, ty = my + Math.sin(a2) * seg2;
  parts.cap(palmLen, 5, mx, my, 28);
  parts.cap(mx, my, tx, ty, 23);

  // 엄지: 카메라 쪽(앞) — 손바닥 중간에서 대각선 아래·앞으로 2마디
  const thc = clamp01(curlOf(p, 0) + c * 0.4); // 손가락 굽힘을 살짝 따라감
  const t1x = 34 + 4 * (1 - thc), t1y = 24 + thc * 4;
  parts.cap(16, 13, t1x, t1y, 18);
  parts.cap(t1x, t1y, t1x + 18 - thc * 8, t1y + 4 + thc * 6, 15);

  parts.render();
  if (c > 0.25) creaseLine(ctx, mx, my, trail + Math.PI / 2, 9, (c - 0.25) * 0.6);

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

/** 손목 경첩: 접힘점에 잘록한 음영 + 오목 주름 한 줄 (fold=0 은은 → 1 뚜렷).
 *  회전 중심(로컬 원점)에 위치해 "여기서 꺾인다"를 드러낸다. */
function drawWristHinge(ctx, fold) {
  ctx.save();
  ctx.lineCap = 'round';
  // ① 잘록함: 손목 단면에 폭넓고 아주 옅은 음영 한 겹 → 살짝 조인 허리
  ctx.strokeStyle = `rgba(200,140,98,${0.12 + fold * 0.16})`;
  ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(0, -18); ctx.quadraticCurveTo(-5, 1, 0, 21); ctx.stroke();
  // ② 접힘선: 팔쪽으로 오목한 주름 한 줄 (팔목 안쪽이 더 깊게)
  ctx.strokeStyle = `rgba(191,120,80,${0.32 + fold * 0.42})`;
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(2, -14); ctx.quadraticCurveTo(-5, 3, 3, 19); ctx.stroke();
  ctx.restore();
}

// ─── 동작 궤적 오버레이 공용 (테마 초록, 손보다 연하게) ───

/** 진행 방향 화살표: (x,y)=머리 끝, ang=향하는 방향, len=축 길이, alpha=진하기 */
function motionArrow(ctx, x, y, ang, len, alpha) {
  ctx.save();
  ctx.strokeStyle = `rgba(84,172,99,${alpha * 0.7})`;
  ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len);
  ctx.lineTo(x - Math.cos(ang) * 4, y - Math.sin(ang) * 4);
  ctx.stroke();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = `rgba(74,157,87,${alpha})`;
  ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(-11, 8); ctx.lineTo(-11, -8); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** 관절(손목) 중심 반투명 호(⌒) + 양끝 가동범위 눈금 + 현재 위치의 진행 화살표.
 *  회전 동작(굽힘·폄 / 좌우 편위)에 공통. towardA1=진행이 a1(끝)쪽인지, speed 0~1. */
function arcArrow(ctx, px, py, R, a0, a1, aNow, towardA1, speed) {
  ctx.save();
  ctx.translate(px, py);
  ctx.strokeStyle = 'rgba(84,172,99,.26)';
  ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, R, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
  ctx.strokeStyle = 'rgba(84,172,99,.32)'; ctx.lineWidth = 3;
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
  ctx.fillStyle = `rgba(74,157,87,${alpha})`;
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
  ctx.strokeStyle = `rgba(206,137,94,${0.38 * alpha})`;
  ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-24, 14); ctx.quadraticCurveTo(2, 6, 24, 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-20, 26); ctx.quadraticCurveTo(4, 20, 26, 28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-16, 12); ctx.quadraticCurveTo(-4, 34, -18, 54); ctx.stroke();
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

  // 팔뚝(소매) 본체는 고정 — 편위는 손목(0,70)에서 꺾임
  capsule(ctx, 0, 84, 0, 124, 38, SLEEVE, SLEEVE_LINE);

  ctx.save();
  ctx.translate(0, 70);
  ctx.rotate(dev * D2R);
  ctx.translate(0, -70);

  const parts = partRenderer(ctx);
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
  parts.render();
  palmCreases(ctx, 1 - clamp01((bendSum / 3) * 1.1));    // 주먹 쥘수록 손금 감춤

  // 엄지는 별도 레이어(자체 윤곽) — 주먹·핀치에서 손바닥을 가로지르는 게
  // 실루엣에 묻히지 않고 보인다 (model/ 주먹·OK 사인 참고)
  const thumb = partRenderer(ctx);
  thumb.cap(TH_BASE.x, TH_BASE.y, tk.mx, tk.my, 20);
  thumb.cap(tk.mx, tk.my, tk.tx, tk.ty, 17);
  thumb.render();
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
  ctx.strokeStyle = SLEEVE_LINE; ctx.fillStyle = SLEEVE; ctx.lineWidth = 3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-27, 64, 54, 24, 10); else ctx.rect(-27, 64, 54, 24);
  ctx.fill(); ctx.stroke();

  // 동작 궤적 오버레이 — follow 재생 중(__lag 존재)에만. intro/outro(정적)엔 숨김.
  if (p.__lag) drawFrontMotionGuide(ctx, p, p.__lag);
}
