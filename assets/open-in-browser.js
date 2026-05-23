// Open in real browser when inside an in-app browser
(function () {
  const ua = navigator.userAgent || '';
  const isInApp =
    /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|TikTok|LinkedInApp|Pinterest/i.test(ua) ||
    (/iPhone|iPad/.test(ua) && !ua.includes('Safari')) ||
    (ua.includes('Android') && ua.includes('wv')) ||
    ua.includes('GSA/');

  if (!isInApp) return;

  const ua_lower = ua.toLowerCase();
  const isAndroid = /Android/.test(ua);
  const isIOS     = /iPhone|iPad|iPod/.test(ua);
  const url       = location.href;

  // ── Android: intent:// → Chrome (no gesture needed) ──────────
  if (isAndroid) {
    location.replace(
      'intent://' + url.replace(/^https?:\/\//, '') +
      '#Intent;scheme=https;action=android.intent.action.VIEW;end'
    );
    return;
  }

  // ── iOS: show one-tap hint banner (can't force Safari via JS) ─
  if (!isIOS) return;
  if (sessionStorage.getItem('ob_ios')) return;
  sessionStorage.setItem('ob_ios', '1');

  const banner = document.createElement('div');
  banner.style.cssText = [
    'position:fixed','bottom:0','left:0','right:0','z-index:2147483647',
    'background:rgba(10,10,20,.97)',
    'border-top:1px solid rgba(0,229,255,.25)',
    'padding:1rem 1.25rem',
    'display:flex','align-items:center','gap:.75rem',
    'font-family:Outfit,sans-serif',
    'backdrop-filter:blur(20px)','-webkit-backdrop-filter:blur(20px)'
  ].join(';');

  banner.innerHTML = `
    <div style="flex:1;line-height:1.5;">
      <div style="font-size:.82rem;font-weight:700;color:#fff;">Safari дээр нээнэ үү</div>
      <div style="font-size:.72rem;color:rgba(255,255,255,.45);">Доод баруун <b style="color:rgba(255,255,255,.7);">···</b> → <b style="color:rgba(255,255,255,.7);">Safari дээр нээх</b></div>
    </div>
    <button id="ob-close" style="
      background:none;border:none;
      color:rgba(255,255,255,.35);
      font-size:1.3rem;cursor:pointer;
      padding:.25rem .5rem;flex-shrink:0;
    ">✕</button>
  `;

  document.body.appendChild(banner);
  document.getElementById('ob-close').onclick = () => banner.remove();
})();
