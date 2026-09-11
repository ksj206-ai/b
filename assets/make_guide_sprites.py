"""시범 손 APNG 만들기 — Flow(Veo) 영상 → 투명 APNG + 정지 프레임.

    python assets/make_guide_sprites.py [원본 영상 폴더]     (기본: ~/Downloads)
    python assets/make_guide_sprites.py [폴더] deviation      (하나만)

영상은 저장소에 넣지 않는다(개당 1MB 안팎). 대신 아래 SPRITES에 적힌 파일명·기준 프레임·
각도가 곧 제작 기록이다 — 같은 영상으로 다시 돌리면 같은 그림이 나온다.

운동마다 하는 일:
  1. 배경 빼기. 초록(Flow에 초록 배경을 요구한 영상) 또는 흰색(2026-08 영상).
     손은 외곽선으로 둘러싸여 있으므로 '테두리에서 이어진 배경'만 투명으로 하고 손 안쪽은
     통째로 불투명으로 둔다 — 색 거리만 쓰면 흰 배경 영상에서 손바닥 하이라이트에 구멍이 난다.
     가장 큰 덩어리만 남겨 Flow 워터마크(오른쪽 아래)와 잡티를 버린다.
  2. 시간 맞추기. 영상 속 동작의 기준 프레임을 앱 애니 키프레임(js/guide/guideData.js)에
     구간별 선형으로 맞춘다. 편위는 캔버스의 호·화살표가 그 시간표로 움직이므로, 어긋나면
     화살표와 손이 따로 논다. 손가락 운동도 같은 시간표로 두어 유지 구간이 보이게 한다.
  3. 1280×720 → 480×270(정확히 3/8)으로 줄여 10fps APNG로 저장.

만든 뒤 할 일: js/guide/handSprite.js의 SPRITES(w·h·pivot·k)와 ASSET_V. 여기서 출력하는
pivot·k를 그대로 옮기면 된다.
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT_W, OUT_H, FPS = 480, 270, 10
SCALE = OUT_W / 1280                       # 영상 1280×720 기준 좌표 → 480×270

# grip(기준 화풍)의 배치값 — 새 손가락 운동은 이 손과 같은 자리·크기에 오도록 맞춘다
GRIP = {'pivot': (240.1, 178.0), 'k': 0.99, 'still': HERE / 'guide-grip-static.png'}

SPRITES = {
    # ② 좌우 편위 — 2026-09-11 Flow, grip 애니의 주먹 프레임을 시작·끝 프레임으로 줌.
    #   영상 속 동작(프레임별 회전각, SIFT로 첫 프레임 대비 측정):
    #     f17 0° → f42~f50 엄지 쪽 -19.4° → f76~f83 새끼 쪽 +10.0° → f95 0° (그 뒤는 한 번 더 흔듦, 버림)
    #   새끼 쪽이 10°뿐이라 앱(+25°)의 화살표가 손보다 한참 더 간다 → 양수 각에만 ×2.5를
    #   손목 위에서 덧돌린다(아래 extra_gain). 회전 중심은 같은 측정에서 나온 고정점.
    'deviation': {
        'src': 'Hand_animation_physical_therapy_…_20260911105326.mp4',
        'bg': 'green', 'flip': False,
        'app': [0, 1.2, 2.0, 3.5, 4.3, 5.3],        # guideData deviation follow 키프레임
        'video': [17, 42, 50, 76, 83, 95],
        'still': 8,
        'pivot_video': (642.2, 479.7),              # 회전 고정점 (1280×720, 90프레임 중앙값)
        'extra_gain': 2.5,                          # 양수 각(새끼 쪽)만: 10° → 25°
        'k': GRIP['k'],                             # grip 프레임에서 시작 → 크기가 grip과 같다
    },
    # ③ 힘줄 활주 — 2026-08-07 Flow "Hand_moves_through_shapes". 화풍이 grip과 같다
    #   (외곽선 갈색, 살색 같음). 같은 날 뽑은 "Cartoon_hand_tendon_glide_exercise"는 갈고리가
    #   더 또렷하지만 외곽선이 검정이라 탈락 — 지금 guide-tendon이 거기서 나와 튀던 것이다.
    #   손 윗끝 y로 모양 구간을 쟀다: 펴짐 ~f17 · 갈고리 f29~f37 · 주먹 f47~f57 · 다시 펴짐 f80.
    #   엄지가 오른쪽이라 좌우를 뒤집어 grip과 같은 손으로 만든다.
    'tendon': {
        'src': 'Hand_moves_through_shapes_202608071103.mp4',
        'bg': 'white', 'flip': True,
        'app': [0, 1.2, 2.0, 3.2, 4.0, 5.2, 6.0],   # guideData tendon_glide follow 키프레임
        'video': [10, 17, 29, 37, 47, 57, 80],
        'still': 12,
        'align_to_grip': True,                      # 크기·자리를 grip 정지 프레임에 맞춰 잰다
    },
}


def read_video(path):
    cap = cv2.VideoCapture(str(path))
    frames = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f[:, :, ::-1].copy())
    if not frames:
        raise SystemExit(f'영상을 못 읽었다: {path}')
    return frames


def border_color(f):
    return np.median(np.concatenate([f[:6].reshape(-1, 3), f[:, :6].reshape(-1, 3)]), 0)


def cutout(rgb, kind):
    """배경을 빼서 premultiplied float RGBA(0..1)를 돌려준다."""
    f = rgb.astype(np.float32)
    bg = border_color(f)
    if kind == 'green':
        gness = f[..., 1] - np.maximum(f[..., 0], f[..., 2])
        g_bg = bg[1] - max(bg[0], bg[2])
        a0 = np.clip((g_bg - 12 - gness) / (g_bg - 12), 0, 1)    # 초록기 0 이하면 완전 불투명
    else:
        a0 = np.clip((np.abs(f - bg).max(2) - 10) / 50, 0, 1)
    hard = (a0 > 0.5).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(hard, connectivity=8)
    keep = lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))  # 손+팔 한 덩어리
    # 테두리에서 이어진 배경만 바깥 — 외곽선 안쪽의 밝은 곳(하이라이트)은 손으로 채운다
    n2, lab2 = cv2.connectedComponents((~keep).astype(np.uint8), connectivity=4)
    edge = np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]]))
    outside = np.isin(lab2, edge) & ~keep
    solid = (~outside).astype(np.uint8)
    k3 = np.ones((3, 3), np.uint8)
    ring = cv2.dilate(solid, k3, iterations=2).astype(bool) & ~cv2.erode(solid, k3, iterations=2).astype(bool)
    alpha = solid.astype(np.float32)
    alpha[ring] = a0[ring]                                        # 테두리만 부드럽게
    # 반투명 가장자리의 색에서 배경을 걷어낸다 (C = aF + (1-a)B)
    a = alpha[..., None]
    fg = np.where(a > 0.15, (f - (1 - a) * bg) / np.maximum(a, 0.15), f)
    if kind == 'green':
        fg[..., 1] = np.minimum(fg[..., 1], np.maximum(fg[..., 0], fg[..., 2]))  # 초록 번짐 제거
    fg = np.clip(fg, 0, 255) / 255
    return np.dstack([fg * a, alpha])


def tilt_deg(gray0, gray, sift, ymax=440):
    """첫 프레임 대비 손(손목 위)의 회전각. +는 화면에서 시계방향(새끼 쪽)."""
    m = np.zeros_like(gray0); m[60:ymax, 420:900] = 255
    k0, d0 = sift.detectAndCompute(gray0, m)
    k1, d1 = sift.detectAndCompute(gray, m)
    ms = [a for a, b in cv2.BFMatcher().knnMatch(d0, d1, k=2) if a.distance < 0.75 * b.distance]
    p0 = np.float32([k0[x.queryIdx].pt for x in ms]); p1 = np.float32([k1[x.trainIdx].pt for x in ms])
    M, _ = cv2.estimateAffinePartial2D(p0, p1, method=cv2.RANSAC, ransacReprojThreshold=2.0)
    return float(np.degrees(np.arctan2(M[1, 0], M[0, 0])))


def rotate_above_wrist(rgba, pivot, deg):
    """손목 위만 deg만큼 더 돌린다. 손목 아래 15px은 그대로, 위 45px에 걸쳐 서서히 전부 —
    경계가 칼로 자른 선이 아니라 손목이 휘는 모양이 되게."""
    if abs(deg) < 1e-3:
        return rgba
    h, w = rgba.shape[:2]
    cx, cy = pivot
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    t = np.clip((cy + 15 - ys) / 60, 0, 1)
    wgt = t * t * (3 - 2 * t)
    th = -np.radians(deg) * wgt                                   # 역방향 매핑
    dx, dy = xs - cx, ys - cy
    mx = (cx + dx * np.cos(th) - dy * np.sin(th)).astype(np.float32)
    my = (cy + dx * np.sin(th) + dy * np.cos(th)).astype(np.float32)
    return cv2.remap(rgba, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def to_image(prem):
    small = cv2.resize(prem, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA)
    a = small[..., 3:4]
    rgb = np.where(a > 1e-4, small[..., :3] / np.maximum(a, 1e-4), 0)
    out = np.dstack([rgb, a])
    return Image.fromarray(np.round(np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA')


def timeline(app, video):
    """출력 프레임(10fps)마다 쓸 영상 프레임 번호 — 앱 키프레임에 구간별 선형."""
    n = int(round(app[-1] * FPS))
    return [int(round(np.interp(i / FPS, app, video))) for i in range(n)]


def grip_alignment(still_rgba):
    """새 손의 정지 프레임을 grip 정지 프레임에 겹쳐 크기(s)·이동(d)을 찾는다.
    손가락 모양은 운동마다 다르므로 손바닥 아래~팔뚝(grip 좌표 y≥140)만 비교한다.
    새 좌표 = s·grip 좌표 + d."""
    g = (np.array(Image.open(GRIP['still']).convert('RGBA'))[..., 3] > 128).astype(np.float32)
    n = np.array(still_rgba)[..., 3] > 128
    rows = np.arange(OUT_H)[:, None]

    def iou(s, dx, dy):
        # 한쪽이 다른 쪽 안에 들어가기만 해도 점수가 차지 않게 합집합으로 나눈다
        w = cv2.warpAffine(g, np.float32([[s, 0, dx], [0, s, dy]]), (OUT_W, OUT_H)) > 0.5
        r = rows >= s * 140 + dy
        return (w & n & r).sum() / max(1, ((w | n) & r).sum())

    best = max((iou(s, dx, dy), s, dx, dy)
               for s in np.arange(0.90, 1.101, 0.01)
               for dy in np.arange(-24, 25, 1.0) for dx in np.arange(-8, 9, 1.0))
    _, s0, dx0, dy0 = best                                        # 거칠게 → 주변만 촘촘히
    return max((iou(s, dx, dy), s, dx, dy)
               for s in np.arange(s0 - 0.01, s0 + 0.0101, 0.0025)
               for dy in np.arange(dy0 - 1, dy0 + 1.01, 0.25) for dx in np.arange(dx0 - 1, dx0 + 1.01, 0.25))


def build(name, cfg, src_dir):
    frames = read_video(src_dir / cfg['src'])
    if cfg.get('flip'):
        frames = [np.ascontiguousarray(f[:, ::-1]) for f in frames]
    plan = timeline(cfg['app'], cfg['video'])
    angles = {}
    if cfg.get('extra_gain'):
        sift = cv2.SIFT_create()
        g0 = cv2.cvtColor(frames[0], cv2.COLOR_RGB2GRAY)
        for i in sorted(set(plan)):
            angles[i] = tilt_deg(g0, cv2.cvtColor(frames[i], cv2.COLOR_RGB2GRAY), sift)
    out = []
    for i in plan:
        prem = cutout(frames[i], cfg['bg'])
        if cfg.get('extra_gain') and angles[i] > 0:
            prem = rotate_above_wrist(prem, cfg['pivot_video'], angles[i] * (cfg['extra_gain'] - 1))
        out.append(to_image(prem))
    still = to_image(cutout(frames[cfg['still']], cfg['bg']))

    anim_path, still_path = HERE / f'guide-{name}.png', HERE / f'guide-{name}-static.png'
    out[0].save(anim_path, save_all=True, append_images=out[1:], duration=1000 // FPS, loop=0)
    still.save(still_path, optimize=True)

    if cfg.get('pivot_video'):
        pivot = (cfg['pivot_video'][0] * SCALE, cfg['pivot_video'][1] * SCALE)
        k = cfg['k']
    else:
        hit, s, dx, dy = grip_alignment(still)
        pivot = (s * GRIP['pivot'][0] + dx, s * GRIP['pivot'][1] + dy)
        k = GRIP['k'] / s
        print(f'  grip 정렬: 겹침 {hit:.3f} · 크기 {s:.3f} · 이동 ({dx:+.1f}, {dy:+.1f})')
    if angles:
        used = [angles[i] for i in plan]
        print(f'  영상 각도 {min(used):.1f}° ~ {max(used):.1f}° → 덧돌린 뒤 {min(used):.1f}° ~ {max(used) * cfg["extra_gain"]:.1f}°')
    print(f'  {anim_path.name}: {len(out)}프레임 {len(out) / FPS:.1f}s {anim_path.stat().st_size / 1e6:.2f}MB'
          f' · {still_path.name} {still_path.stat().st_size / 1e3:.0f}KB')
    print(f'  → handSprite.js: w: {OUT_W}, h: {OUT_H}, pivot: {{ x: {pivot[0]:.1f}, y: {pivot[1]:.1f} }}, k: {k:.2f}')


if __name__ == '__main__':
    src_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / 'Downloads'
    names = sys.argv[2:] or list(SPRITES)
    for name in names:
        print(name)
        build(name, SPRITES[name], src_dir)
