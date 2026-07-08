// ═══════════════════════════════════════════════════════════
// animPlayer.js — 키프레임 보간 + 이징 재생 (무한 반복)
// 명세서 §3. 매끄러움 = ① 절대시간 ② easeInOut ③ 홀드 구간.
//   · dt 누적 금지 → 항상 (now - startTime)로 계산 (프레임 드랍에 강함)
//   · 키프레임이 파라미터 부분집합만 지정해도 되도록 파라미터별 트랙으로 분리
//     → 손가락 시차(스태거) 같은 표현도 자연 지원
// ═══════════════════════════════════════════════════════════

export const easeInOut = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** 키프레임 [[t(s),{params}], ...] → { paramKey: [{t,v}, ...] } 트랙맵 */
export function buildTracks(keyframes) {
  const tracks = {};
  for (const [t, params] of keyframes) {
    for (const k in params) {
      (tracks[k] || (tracks[k] = [])).push({ t, v: params[k] });
    }
  }
  for (const k in tracks) tracks[k].sort((a, b) => a.t - b.t);
  return tracks;
}

/** 단일 트랙을 시간 t에서 샘플 (구간 내 easeInOut, 양끝은 홀드) */
export function sampleTrack(track, t) {
  const n = track.length;
  if (t <= track[0].t) return track[0].v;
  if (t >= track[n - 1].t) return track[n - 1].v;
  for (let i = 0; i < n - 1; i++) {
    const a = track[i], b = track[i + 1];
    if (t >= a.t && t <= b.t) {
      if (b.t === a.t) return b.v;
      const localT = (t - a.t) / (b.t - a.t);
      return a.v + (b.v - a.v) * easeInOut(localT);
    }
  }
  return track[n - 1].v;
}

/**
 * 무한 반복 플레이어 생성.
 * @param {Array} keyframes - [[t(s),{params}], ...] (마지막 t가 1주기 길이)
 * @param {Object} base - 파라미터 기본값(키프레임에 없는 값 보충)
 * @returns { sample(now)→params, duration }
 */
export function createAnimPlayer(keyframes, base = {}) {
  const tracks = buildTracks(keyframes);
  const duration = keyframes.length ? keyframes[keyframes.length - 1][0] : 0;
  let startTime = null;

  function sample(now) {
    if (startTime === null) startTime = now;
    const t = duration > 0 ? (((now - startTime) / 1000) % duration) : 0;
    const out = { ...base };
    for (const k in tracks) out[k] = sampleTrack(tracks[k], t);
    return out;
  }

  function reset() { startTime = null; }

  return { sample, reset, duration };
}
