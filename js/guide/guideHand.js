// ═══════════════════════════════════════════════════════════
// guideHand.js — 파라미터로 조종하는 벡터 손 (명세서 §2)
// drawGuideHand(ctx, p, view, opts)
//   p: { wristAngle, devAngle, curl(number|number[5]), curlTip, spread, pinchGap }
//   view: 'side'(팔뚝+손날, 굽힘·폄) | 'front'(손바닥, 편위·손가락·핀치)
//   opts: { cx, cy, scale }
// 단순 막대 손으로 기능 완성 → 이후 디테일 추가 (명세서 §2 원칙).
// 이모지 미사용(벡터 드로잉) — 명세서의 이모지 투명 이슈 회피.
// ═══════════════════════════════════════════════════════════

const SKIN = '#f4c69f';
const SKIN_LINE = '#e3a97f';
const SLEEVE = '#7fd28a';
const SLEEVE_LINE = '#54ac63';
const D2R = Math.PI / 180;

/** 둥근 캡 막대(캡슐) */
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

export function drawGuideHand(ctx, p = {}, view = 'side', opts = {}) {
  const cx = opts.cx ?? 160, cy = opts.cy ?? 150, s = opts.scale ?? 1;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  if (view === 'side') drawSide(ctx, p);
  else drawFront(ctx, p);
  ctx.restore();
}

// ─── side 뷰: 팔뚝(고정) + 손(wristAngle 회전) ───
function drawSide(ctx, p) {
  const wa = p.wristAngle ?? 0;          // -45 굽힘(아래) ~ +45 폄(위)
  const wx = 4, wy = 14;                  // 손목 기준점(로컬)

  // 팔뚝: 왼쪽에서 손목까지 고정 막대 + 소매 커프
  capsule(ctx, wx - 150, wy, wx, wy, 44, SKIN, SKIN_LINE);
  capsule(ctx, wx - 150, wy, wx - 96, wy, 50, SLEEVE, SLEEVE_LINE);

  // 손: 손목 기준 회전 (폄 +각 → 화면상 위쪽으로: 캔버스 y는 아래라 -부호)
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(-wa * D2R);

  const palmLen = 66, palmW = 40, fingerW = 34;
  // 손바닥(손날)
  capsule(ctx, 0, 0, palmLen, 0, palmW, SKIN, SKIN_LINE);

  // 손가락 4개(측면에선 겹쳐 한 덩어리) — curl로 굽힘
  const c = curlOf(p, 1);                 // 검지 대표값
  const seg1 = 30, seg2 = 30;
  const bend = c * 78 * D2R;              // 손바닥 쪽(+y)으로 굽음
  const mx = palmLen + seg1, my = 0;
  const tx = mx + Math.cos(bend) * seg2, ty = my + Math.sin(bend) * seg2;
  capsule(ctx, palmLen, 0, mx, my, fingerW, SKIN, SKIN_LINE);
  capsule(ctx, mx, my, tx, ty, fingerW * 0.9, SKIN, SKIN_LINE);

  // 엄지: 손바닥 아래쪽에서 살짝 앞으로
  capsule(ctx, 16, 15, 40, 30, 20, SKIN, SKIN_LINE);

  ctx.restore();
}

// ─── front 뷰: 손바닥 원 + 손가락 5개 (기본형, 이후 단계에서 디테일) ───
function drawFront(ctx, p) {
  const dev = p.devAngle ?? 0;            // -30 요측 ~ +30 척측
  const spread = p.spread ?? 0.5;
  const pinchGap = p.pinchGap ?? 1;

  ctx.save();
  ctx.rotate(dev * D2R);

  // 손목→팔뚝(짧게)
  capsule(ctx, 0, 70, 0, 120, 40, SLEEVE, SLEEVE_LINE);
  // 손바닥
  ctx.strokeStyle = SKIN_LINE; ctx.fillStyle = SKIN; ctx.lineWidth = 3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-38, -6, 76, 78, 26); else ctx.rect(-38, -6, 76, 78);
  ctx.fill(); ctx.stroke();

  // 손가락 4개 (검지~새끼), spread로 벌림, curl로 굽힘
  const baseX = [-27, -9, 9, 27];
  const fLen = [52, 60, 56, 44];
  for (let i = 0; i < 4; i++) {
    const spx = baseX[i] * (0.7 + spread * 0.6);
    const c = curlOf(p, i + 1);
    const len = fLen[i] * (1 - c * 0.55);
    capsule(ctx, baseX[i], -4, spx, -4 - len, 18, SKIN, SKIN_LINE);
  }
  // 엄지: pinchGap으로 검지에 근접
  const thx = -34 + (1 - pinchGap) * 26;
  capsule(ctx, -34, 40, thx, 6, 20, SKIN, SKIN_LINE);

  ctx.restore();
}
