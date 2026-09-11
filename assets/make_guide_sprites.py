"""시범 손 APNG 만들기 — Flow(Veo) 영상 → 투명 APNG + 정지 프레임.

    python assets/make_guide_sprites.py [원본 영상 폴더]     (기본: ~/Downloads)
    python assets/make_guide_sprites.py [폴더] deviation      (하나만)

영상은 저장소에 넣지 않는다(개당 1MB 안팎). 대신 아래 SPRITES에 적힌 파일명·기준 프레임·
각도가 곧 제작 기록이다 — 같은 영상으로 다시 돌리면 같은 그림이 나온다.
필요: opencv-python · numpy · Pillow · scipy

운동마다 하는 일:
  1. 배경 빼기. 초록(Flow에 초록 배경을 요구한 영상) 또는 흰색(2026-08 영상).
     · 손 안쪽의 밝은 곳(하이라이트)은 손으로 두고, 사방이 막힌 틈(손가락 사이, 엄지·검지 고리
       안)은 배경으로 뺀다 — 둘은 '둘레가 외곽선이냐 살이냐'로 가른다(enclosed_gaps).
     · 가장자리 색은 바로 안쪽 손 색으로 되돌리고 알파만 섞인 정도로 준다 — 배경과 섞인 색을
       그대로 두면 어두운 테마에서 흰 테가 보인다.
     · 가장 큰 덩어리만 남겨 Flow 워터마크(오른쪽 아래)와 잡티를 버린다.
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
from scipy.ndimage import distance_transform_edt

HERE = Path(__file__).resolve().parent
OUT_W, OUT_H, FPS = 480, 270, 10
SCALE = OUT_W / 1280                       # 영상 1280×720 기준 좌표 → 480×270

# grip(기준 화풍)의 배치값 — 새 손가락 운동은 이 손과 같은 자리·크기에 오도록 맞춘다
GRIP = {'pivot': (240.1, 178.0), 'k': 0.99, 'still': HERE / 'guide-grip-static.png'}

def forward(start, n):
    """10fps로 24fps 영상을 훑는 프레임 번호 — 8월 제작분이 이렇게 뽑혀 있었다(색 대조로 역산)."""
    return [start + int(2.4 * i) for i in range(n)]


def ping_pong(start, n):
    f = forward(start, n)
    return f + f[-2:0:-1]                           # 끝까지 갔다가 되돌아온다 (양끝은 한 번씩)


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
    #   배치: 8월 영상들은 grip과 구도가 같다(날영상 팔뚝 폭 63.0 vs grip 계열 62.6~64.9).
    #   팔뚝 중심·손바닥 아래끝을 grip 정지 프레임과 맞춘 값과 실루엣 IoU 값이 0.5px 안에서 겹친다.
    'tendon': {
        'src': 'Hand_moves_through_shapes_202608071103.mp4',
        'bg': 'white', 'flip': True,
        'app': [0, 1.2, 2.0, 3.2, 4.0, 5.2, 6.0],   # guideData tendon_glide follow 키프레임
        'video': [10, 17, 29, 37, 47, 57, 80],
        'still': 12,
        'pivot': (240.3, 177.8), 'k': 0.99,
    },
    # ④ 핀치 — 2026-08-07 Flow 영상의 끝부분만. 영상은 집음→폄→집음→폄→집음을 되풀이하는데
    #   예전 에셋은 그 앞쪽까지 써서 검지가 혼자 꺾이는 첫 집기와, 이음새의 짧은 두 번째 집기가
    #   섞여 '두 번 집는' 것처럼 보였다. 끝부분의 한 번만 쓴다:
    #     f72 편 손 → f79 집음(검지가 내려와 엄지에 닿음) → f95까지 유지
    #     → f56(f95와 가장 비슷한 집힌 프레임)으로 건너뛰어 f72까지 다시 폄
    'pinch': {
        'src': 'Hand_making_pinch_gesture_202608071052.mp4',
        'bg': 'white', 'flip': False,
        'app': [0, 0.8, 2.8, 2.8, 3.4],             # guideData pinch_hold: 집기 0.8 · 유지 2.0 · 펴기 0.6
        'video': [72, 79, 95, 56, 72],
        'still': 68,                                # intro·outro는 편 손(pinchGap 1)
        # 옛 핀치 에셋과 원본 영상이 같다(옛 프레임과 실루엣 IoU 0.95, 이동 없이) → 옛 실측값 그대로
        'pivot': (240.4, 178.0), 'k': 0.99,
    },
    # ── 8월 제작분 셋 — 움직임·시간·배치는 그대로, 배경만 새 방식으로 다시 뺐다 (2026-09-11) ──
    # 제작 기록이 없어서 옛 APNG 프레임을 영상 프레임과 색으로 대조해 역산했다(프레임당 차이 9~10,
    # 실루엣 IoU 0.95~0.96, 이동 없이 = 구도 그대로). 셋 다 10fps로 영상을 2.4프레임씩 훑었고
    # grip·spread는 끝까지 갔다 되돌아오는 왕복이었다. 정지 프레임은 각 첫 프레임.
    # 옛 배경 빼기는 손가락 사이에 갇힌 틈을 흰색으로 남기고(flexext 엄지 틈은 프레임당 최대 225px)
    # 가장자리에 옅은 흰 테를 남겼다.
    'grip': {
        'src': 'Hand_clenching_into_fist_202608071044.mp4',
        'bg': 'white', 'flip': False,
        'frames': ping_pong(13, 35),               # 68프레임 6.8s
        'still': 13,
        'pivot': (240.1, 178.0), 'k': 0.99,
    },
    'spread': {
        'src': 'Hand_spreading_fingers_animation_202608071041.mp4',
        'bg': 'white', 'flip': False,
        'frames': ping_pong(23, 31),               # 60프레임 6.0s
        'still': 23,
        'pivot': (240.3, 178.0), 'k': 0.99,
    },
    'flexext': {
        'src': 'Hand_bending_up_and_down_202608071219.mp4',
        'bg': 'white', 'flip': False,
        # 57프레임 5.7s. 식(4+2.4i)과 ±1프레임씩 어긋나는데, 손목이 빨리 도는 구간에서는 그 한
        # 프레임이 눈에 띄어(#24 실루엣 IoU 0.82) 색 대조로 찾은 번호를 그대로 쓴다.
        'frames': [4, 7, 9, 11, 14, 16, 19, 21, 23, 26, 28, 31, 33, 35, 38, 40, 43, 45, 47, 50,
                   52, 55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81, 83, 86, 88, 91, 93, 95, 98,
                   100, 103, 105, 107, 110, 112, 115, 117, 119, 122, 124, 127, 129, 131, 134, 136, 139],
        'still': 4,
        'pivot': (252.0, 138.0), 'k': 0.90, 'side': True,   # 옆모습 — grip 대비 확인은 의미 없음
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


K3 = np.ones((3, 3), np.uint8)
CROSS = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
LUMA = np.float32([0.299, 0.587, 0.114])


def run_width(dark):
    """각 픽셀이 속한 '어둡지 않은 가로 구간'의 폭 — 양옆 가장 가까운 어두운 픽셀 사이 거리."""
    H, W = dark.shape
    idx = np.broadcast_to(np.arange(W), (H, W))
    left = np.maximum.accumulate(np.where(dark, idx, -10**6), axis=1)
    right = np.minimum.accumulate(np.where(dark, idx, 10**6)[:, ::-1], axis=1)[:, ::-1]
    return right - left - 1


def sandwiched_gaps(lum, sat, maxw=5):
    """두 손가락 외곽선 사이에 1~5px로 낀 옅은 줄. 영상이 이 틈을 연분홍(≈234,207,200)으로 물들여
    채도로는 살과 못 가르고, 막힌 조각도 아니라서(끝이 외곽선에 닿아 픽셀 몇 개로 쪼개진다)
    enclosed_gaps로도 안 잡힌다. 480으로 줄이면 1px 흰 실선이 된다(벌리기 #22·힘줄 #13).
    가로나 세로로 양쪽 5px 안에 외곽선이 있는 옅은 픽셀만 고른다 — 손가락 살은 폭이 20px,
    손톱은 25px 안팎이라 안 걸린다."""
    dark = lum < 110
    w = np.minimum(run_width(dark), run_width(dark.T).T)
    return ~dark & (w <= maxw) & (lum > 150) & (sat < 45)


def enclosed_gaps(keep, f, lum, diff, kind):
    """손 덩어리(keep)에 둘러싸인 비(非)손 조각 중 '배경'인 것 — 손가락 사이·엄지와 검지가 만든
    고리 안처럼 사방이 막힌 틈이다. 테두리에 안 닿아서 예전엔 손으로 메워져 흰 조각으로 남았다.

    흰 배경에서 갇힌 조각을 모든 프레임에서 재 보니(8월 영상 다섯, 51조각, 2026-09-11) 이렇게 갈린다.
    색은 조각의 **밝은 절반**으로 잰다 — 가는 틈은 가장자리가 옆 살·외곽선 색을 먹어서 전체 평균으로
    재면 채도가 부풀어 오른다(힘줄 f66·grip f75 틈이 그렇게 손으로 남았다).
                        밝은 절반 채도   둘레 중 외곽선
      손가락 사이 틈         6~19          25~98%
      손톱 윗가장자리 광택   27~33          0~15%     (손톱 몸통은 분홍 R−G 17~25)
    살 하이라이트는 채도 35 이상이라 애초에 손(cutout의 fgish)으로 잡혀 갇힌 조각이 되지 않는다.
    16px 미만도 버리지 않는다 — 480으로 줄이면 1px 폭이지만 어두운 테마에서는 흰 실선으로 보였다
    (벌리기 #22·힘줄 #13 손가락 사이). 대신 둘레 외곽선 문턱을 40%로 높여 살 광택 점과 가른다.
    · 두께로 가르던 판(반지름 ≤ 4.5px)은 주먹 쥘 때 검지·중지 사이 틈(반지름 5px)을 놓쳤고,
      '배경색과 같은가'로 가르던 판은 영상 배경이 가장자리(238)보다 가운데가 밝아서(245) 놓쳤다.
    초록 배경은 살이 초록일 리 없으니 갇힌 조각은 전부 틈이다."""
    n, lab, st, _ = cv2.connectedComponentsWithStats((~keep).astype(np.uint8), connectivity=4)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])).tolist())
    gaps = np.zeros_like(keep)
    H, W = keep.shape
    for L in range(1, n):
        x, y, w, h, area = st[L]
        if L in edge or (kind != 'green' and area < 3):
            continue
        y0, y1, x0, x1 = max(0, y - 1), min(H, y + h + 1), max(0, x - 1), min(W, x + w + 1)
        hole = lab[y0:y1, x0:x1] == L                             # 조각 둘레 상자 안에서만 계산(속도)
        if kind != 'green':
            px, ls = f[y0:y1, x0:x1][hole], lum[y0:y1, x0:x1]
            core = px[ls[hole] >= np.median(ls[hole])]            # 밝은 절반 = 조각의 속
            ring = cv2.dilate(hole.astype(np.uint8), K3).astype(bool) & ~hole
            neutral = (core.max(1) - core.min(1)).mean() < 22 and (core[:, 0] - core[:, 1]).mean() < 15
            # 16px 미만은 살 광택 점이 수백 개라(채도 26~36, 둘레 외곽선 0~17%) 외곽선 문턱을 높인다
            if not (neutral and (ls[ring] < 130).mean() >= (0.4 if area < 16 else 0.25)):
                continue                                          # 손톱 광택·분홍 손톱 = 손
        gaps[y0:y1, x0:x1] |= hole
    return gaps


def cutout(rgb, kind):
    """배경을 빼서 premultiplied float RGBA(0..1)를 돌려준다.

    가장자리는 '배경색 ↔ 바로 안쪽 손 색' 사이 어디쯤인지로 알파를 정하고, 색은 그 안쪽 손 색을
    그대로 쓴다. 배경과 섞인 색을 그대로 두면 흰 배경 영상에서 테두리에 흰 테가 남는다."""
    f = rgb.astype(np.float32)
    bg = border_color(f)
    lum = f @ LUMA
    diff = np.abs(f - bg).max(2)
    if kind == 'green':
        gness = f[..., 1] - np.maximum(f[..., 0], f[..., 2])
        fgish = gness < (bg[1] - max(bg[0], bg[2])) * 0.5         # 초록기가 배경의 절반 아래
    else:
        # 확실한 손 = 살색(채도 30 이상) 또는 외곽선(어두움). 그 밖의 옅은 무채색은 전부 '배경이거나
        # 배경과 섞인 것'으로 두고, 테두리에서 이어지면 배경·갇혀 있으면 enclosed_gaps가 가른다.
        # · 외곽선과 흰 배경이 반쯤 섞인 색(≈170,150,142)은 채도가 낮아 여기서 빠진다 — 손으로 치면
        #   손가락 사이 좁은 틈이 옅은 회색 줄로 불투명하게 남는다(첫 판이 그랬다).
        # · grip 영상은 외곽선 바깥에 회백색 테(≈230,220,219)가 그려져 있는데 같은 이유로 빠진다.
        # 살은 하이라이트까지 채도 35 이상이라 안 걸린다(힘줄 활주 영상 실측 35~46).
        sat = f.max(2) - f.min(2)
        fgish = ((sat >= 30) | (lum < 120)) & (diff > 20)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fgish.astype(np.uint8), connectivity=8)
    keep = lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))  # 손+팔 한 덩어리 (워터마크·잡티 버림)
    gaps = enclosed_gaps(keep, f, lum, diff, kind)
    n2, lab2 = cv2.connectedComponents((~keep).astype(np.uint8), connectivity=4)
    edge = np.unique(np.concatenate([lab2[0], lab2[-1], lab2[:, 0], lab2[:, -1]]))
    outside = (np.isin(lab2, edge) & ~keep) | gaps
    if kind != 'green':
        # 틈이 배경색 그대로가 아니라 옆 살색에 물들어 연분홍(≈240,219,205, 채도 36)인 자리가 있다
        # (grip f75 손가락 사이 윗부분). 채도로는 살 하이라이트(≈254,236,212)와 못 가르지만, 이런
        # 옅은 픽셀은 이미 배경인 곳(바깥·틈)에 이어져 있을 때만 배경으로 번지게 한다 — 어두운
        # 외곽선을 못 넘으니 손 안쪽 하이라이트까지는 안 간다. 10px로 묶었고, 다섯 영상 전 프레임에서
        # 번진 양은 프레임당 최대 131px(1280 기준) · 손바닥 안으로 샌 곳 없음을 눈으로 확인했다.
        outside |= sandwiched_gaps(lum, f.max(2) - f.min(2)) & keep
        pale = keep & (lum > 195) & ((f.max(2) - f.min(2)) < 45)
        for _ in range(10):
            nxt = cv2.dilate(outside.astype(np.uint8), CROSS).astype(bool) & pale & ~outside
            if not nxt.any():
                break
            outside |= nxt
    solid = ~outside
    core = cv2.erode(solid.astype(np.uint8), K3).astype(bool)
    band = cv2.dilate(solid.astype(np.uint8), K3, iterations=2).astype(bool) & ~core
    _, (iy, ix) = distance_transform_edt(~core, return_indices=True)
    F = f[iy, ix]                                                 # 가장 가까운 속살(core) 색
    d = F - bg
    a = np.clip(((f - bg) * d).sum(2) / np.maximum((d * d).sum(2), 1.0), 0, 1)
    alpha = np.where(core, 1.0, np.where(band, a, 0.0)).astype(np.float32)
    color = np.where(core[..., None], f, F) / 255
    return np.dstack([color * alpha[..., None], alpha])


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
    """출력 프레임(10fps)마다 쓸 영상 프레임 번호 — 앱 키프레임에 구간별 선형.
    같은 앱 시각이 두 번 나오면 그 사이는 '건너뛰기'다(영상의 비슷한 프레임으로 점프)."""
    out = []
    for i in range(int(round(app[-1] * FPS))):
        t = i / FPS
        j = next(j for j in range(len(app) - 1) if app[j] <= t < app[j + 1])
        u = (t - app[j]) / (app[j + 1] - app[j])
        out.append(int(round(video[j] + (video[j + 1] - video[j]) * u)))
    return out


def landmarks(rgba):
    """배치 확인용 지표 — 팔뚝 폭·중심(아래 38줄 중앙값)과 손바닥 아래끝(아래에서 올라가며 폭이
    팔뚝의 1.25배를 처음 넘는 줄). 옛 spread·pinch에 대 보면 실측 pivot을 1~2px 안에서 되살린다.
    ⚠ 폭 비율로 k를 정하지는 말 것 — 가장자리 처리(반투명 폭)가 제작 방식마다 달라 1~5% 흔들린다."""
    m = np.array(rgba)[..., 3] > 128
    W, C = [], []
    for y in range(228, 266):
        xs = np.nonzero(m[y])[0]
        W.append(xs.max() - xs.min()); C.append((xs.max() + xs.min()) / 2)
    w, c = float(np.median(W)), float(np.median(C))
    heel = next((y for y in range(250, 60, -1)
                 if (lambda xs: len(xs) and xs.max() - xs.min() > 1.25 * w)(np.nonzero(m[y])[0])), -1)
    return w, c, heel


def build(name, cfg, src_dir):
    frames = read_video(src_dir / cfg['src'])
    if cfg.get('flip'):
        frames = [np.ascontiguousarray(f[:, ::-1]) for f in frames]
    plan = cfg['frames'] if 'frames' in cfg else timeline(cfg['app'], cfg['video'])
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
    else:
        pivot = cfg['pivot']
    k = cfg['k']
    if not cfg.get('side') and not cfg.get('pivot_video') and name != 'grip':   # 편 손끼리만 비교가 된다
        w, c, h = landmarks(still)
        gw, gc, gh = landmarks(Image.open(GRIP['still']).convert('RGBA'))
        print(f'  grip 대비(확인용): 팔뚝 폭 {w / gw:.3f}배 · 팔뚝 중심 {c - gc:+.1f}px · 손바닥 아래끝 {h - gh:+d}px')
    if angles:
        used = [angles[i] for i in plan]
        print(f'  영상 각도 {min(used):.1f}° ~ {max(used):.1f}° → 덧돌린 뒤 {min(used):.1f}° ~ {max(used) * cfg["extra_gain"]:.1f}°')
    print(f'  {anim_path.name}: {len(out)}프레임 {len(out) / FPS:.1f}s {anim_path.stat().st_size / 1e6:.2f}MB'
          f' · {still_path.name} {still_path.stat().st_size / 1e3:.0f}KB')
    print(f'  → handSprite.js: w: {OUT_W}, h: {OUT_H}, pivot: {{ x: {pivot[0]:.1f}, y: {pivot[1]:.1f} }}, k: {k:.2f}')


if __name__ == '__main__':
    args = sys.argv[1:]
    src_dir = Path(args[0]) if args else Path.home() / 'Downloads'
    for name in args[1:] or list(SPRITES):
        print(name)
        build(name, SPRITES[name], src_dir)
