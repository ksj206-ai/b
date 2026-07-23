// ═══════════════════════════════════════════════════════════
// sky.js — 오늘의 별자리 SVG 렌더 (홈 히어로 전용)
// constellations.js의 stars(상대 좌표)·lines를 받아 SVG로 그린다.
//   · 안 켜진 별  → 흐릿한 밑그림, 연결선도 흐리게
//   · 켜진 별     → 골드 코어 + 은은한 헤일로, 양 끝이 켜진 선은 밝게
//   · 직전 렌더 이후 새로 켜진 별만 부드럽게 반짝(twinkle) — 상태 복원은 조용히
// 배경은 투명 — 히어로 카드의 밤하늘 표면 위에 별자리가 뜬 느낌.
// (별자리 완성 연출·밤하늘 누적은 이 파일의 몫이 아니다 — 다음 단계.)
// ═══════════════════════════════════════════════════════════
import { getConstellation } from './constellations.js';

const S = 100; // 내부 좌표 스케일: 상대 0~1 → viewBox 0~100

// 직전 렌더 상태 — 새로 켜진 별(반짝임 대상)을 가려내는 기준.
// 별자리가 바뀌었거나(새 날) 첫 렌더면 "복원"으로 보고 반짝이지 않는다.
let lastRender = { id: null, lit: null };

const P = (n) => n.toFixed(2);

/** 별자리 → 별들을 감싸는 넉넉한 viewBox와 크기 단위 계산 */
function frame(con) {
  const xs = con.stars.map((s) => s.x);
  const ys = con.stars.map((s) => s.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  // 여백: 가장 긴 변 기준으로 균일하게(모양 왜곡 없이) — 헤일로가 잘리지 않게 넉넉히
  const m = Math.max(maxX - minX, maxY - minY) * 0.18 || 0.18;
  minX -= m; maxX += m; minY -= m; maxY += m;
  const w = (maxX - minX) * S, h = (maxY - minY) * S;
  const unit = Math.max(w, h); // 별·선 크기의 기준(별자리 규모에 비례해 일정하게 보이도록)
  return {
    vb: `${P(minX * S)} ${P(minY * S)} ${P(w)} ${P(h)}`,
    // 외형 상수만 — 별 점등/동기화 로직과 무관.
    // 연결선은 더 얇게(0.0065→0.005: 도면 선 느낌 제거), 안 켜진 별은 살짝 키워
    // warm dim 발광점으로 읽히게(0.018→0.021). 켜진 별(코어 0.03+헤일로)과는 여전히 확연히 구분.
    rHalo: unit * 0.09, rCore: unit * 0.03, rDim: unit * 0.021, lw: unit * 0.005,
  };
}

/** 별자리 SVG 마크업 생성 (litSet: 켜진 별 인덱스 Set) */
function buildSvg(con, litSet) {
  const f = frame(con);

  const lines = con.lines.map(([a, b]) => {
    const on = litSet.has(a) && litSet.has(b);
    const p = con.stars[a], q = con.stars[b];
    return `<line class="sky-link${on ? ' is-on' : ''}" ` +
      `x1="${P(p.x * S)}" y1="${P(p.y * S)}" x2="${P(q.x * S)}" y2="${P(q.y * S)}" ` +
      `stroke-width="${P(f.lw)}"/>`;
  }).join('');

  const stars = con.stars.map((st, i) => {
    const cx = P(st.x * S), cy = P(st.y * S);
    if (litSet.has(i)) {
      return `<g class="sky-star is-on" data-i="${i}">` +
        `<circle class="sky-halo" cx="${cx}" cy="${cy}" r="${P(f.rHalo)}"/>` +
        `<circle class="sky-core" cx="${cx}" cy="${cy}" r="${P(f.rCore)}"/>` +
        `</g>`;
    }
    return `<g class="sky-star" data-i="${i}">` +
      `<circle class="sky-dim" cx="${cx}" cy="${cy}" r="${P(f.rDim)}"/></g>`;
  }).join('');

  return `<svg class="sky-svg" viewBox="${f.vb}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">` +
    `<defs><radialGradient id="skyHaloGrad" cx="50%" cy="50%" r="50%">` +
      `<stop offset="0%" stop-color="#ffe6a8" stop-opacity=".70"/>` +
      `<stop offset="42%" stop-color="#ffd36b" stop-opacity=".26"/>` +
      `<stop offset="100%" stop-color="#ffd36b" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<g class="sky-links">${lines}</g>` +
    `<g class="sky-stars">${stars}</g>` +
  `</svg>`;
}

/**
 * 오늘의 별자리를 container에 렌더.
 * @param {HTMLElement} container  SVG를 넣을 영역(#skyStage)
 * @param {string} constellationId
 * @param {number[]} litIndices    켜진 별 인덱스(그리는 순서)
 * @returns {object|null}          그린 별자리 객체(라벨용) 또는 null
 */
export function renderSky(container, constellationId, litIndices = []) {
  const con = getConstellation(constellationId);
  if (!container || !con) return null;
  const litSet = new Set(litIndices);

  // 직전 렌더 이후 새로 켜진 별만 반짝임 대상 (같은 별자리일 때만)
  const sameCon = lastRender.id === constellationId && lastRender.lit;
  const newly = [];
  if (sameCon) for (const i of litSet) if (!lastRender.lit.has(i)) newly.push(i);

  container.innerHTML = buildSvg(con, litSet);

  // 새로 켜진 별: 그리는 순서대로 조금씩 늦춰 부드럽게 반짝(과하지 않게)
  if (newly.length) {
    const set = new Set(newly);
    let k = 0;
    for (const g of container.querySelectorAll('.sky-star.is-on')) {
      if (!set.has(Number(g.dataset.i))) continue;
      g.classList.add('twinkle');
      g.style.animationDelay = (k++ * 90) + 'ms';
    }
  }

  lastRender = { id: constellationId, lit: litSet };
  return con;
}
