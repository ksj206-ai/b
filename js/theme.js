// ═══════════════════════════════════════════════════════════
// theme.js — 색 테마(팔레트) + 다크모드
//
// 축이 둘이다. 둘 다 사용자가 고르고, 고른 값은 localStorage에 남는다:
//   · data-palette : lavender(성운 보라 — 원래 톤) / sky(하늘·페리윙클)
//   · data-theme   : dark / light
// 색은 CSS 토큰이 전부 받아낸다(css/app.css 맨 위 블록). 이 파일은 <html>에
// 속성 두 개를 박고 스위치를 연결할 뿐, 색을 하나도 알지 못한다.
//
// ⚠ 이 스크립트는 <head>에서 defer 없이 즉시 실행돼야 한다. 늦으면 기본값으로 한 번
//   칠해진 화면이 보였다가 바뀌는 깜빡임이 생긴다(그래서 모듈이 아니라 고전 스크립트다).
// ═══════════════════════════════════════════════════════════
(function () {
  var root = document.documentElement;
  var KEY_PAL = 'appPalette', KEY_THEME = 'appTheme';

  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ── 즉시 확정 ── 저장값 > (다크모드는) 시스템 설정 > 기본값
  var pal = read(KEY_PAL);
  root.dataset.palette = (pal === 'sky' || pal === 'lavender') ? pal : 'lavender';
  var th = read(KEY_THEME);
  root.dataset.theme = (th === 'dark' || th === 'light') ? th
    : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

  // ── 스위치 연결 ── (요소는 파싱이 끝나야 있으므로 여기서만 지연)
  function wire() {
    var sw = document.getElementById('themeToggle');
    if (sw) {
      var knob = sw.querySelector('.tt-knob');
      var paint = function () {
        var dark = root.dataset.theme === 'dark';
        sw.setAttribute('aria-checked', String(dark));
        if (knob) knob.textContent = dark ? '🌙' : '☀';
      };
      sw.addEventListener('click', function () {
        root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
        write(KEY_THEME, root.dataset.theme);
        paint();
      });
      paint();
    }

    var btns = document.querySelectorAll('.pal button[data-palette]');
    var paintPal = function () {
      btns.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.palette === root.dataset.palette));
      });
    };
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        root.dataset.palette = b.dataset.palette;
        write(KEY_PAL, b.dataset.palette);
        paintPal();
      });
    });
    paintPal();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
