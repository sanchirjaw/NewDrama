// Detect in-app browser and prompt user to open in real browser
(function () {
  const ua = navigator.userAgent || '';
  const isInApp =
    /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|TikTok|LinkedInApp|Pinterest/i.test(ua) ||
    (/iPhone|iPad/.test(ua) && !ua.includes('Safari')) ||
    (ua.includes('Android') && ua.includes('wv')) || // Android WebView
    ua.includes('GSA/'); // Google Search App

  if (!isInApp) return;

  // Already shown this session
  if (sessionStorage.getItem('ob_shown')) return;
  sessionStorage.setItem('ob_shown', '1');

  const url = location.href;

  // Android: Intent URL → Chrome
  function openAndroid() {
    location.href = 'intent://' + url.replace(/^https?:\/\//, '') +
      '#Intent;scheme=https;package=com.android.chrome;end';
  }

  // iOS: try x-safari trick
  function openIOS() {
    location.href = url.replace(/^https?:\/\//, 'googlechrome://');
    setTimeout(() => {
      location.href = url.replace(/^https?:\/\//, 'x-safari-https://');
    }, 300);
  }

  const isAndroid = /Android/.test(ua);
  const isIOS = /iPhone|iPad|iPod/.test(ua);

  // Build banner
  const banner = document.createElement('div');
  banner.id = 'ob-banner';
  banner.innerHTML = `
    <div style="
      position:fixed;bottom:0;left:0;right:0;z-index:99999;
      background:linear-gradient(135deg,rgba(0,229,255,0.12),rgba(168,85,247,0.12));
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      border-top:1px solid rgba(0,229,255,0.25);
      padding:1rem 1.25rem;
      display:flex;align-items:center;gap:.875rem;
      font-family:'Outfit',sans-serif;
    ">
      <div style="flex:1;">
        <div style="font-size:.8rem;font-weight:700;color:#fff;margin-bottom:.15rem;">Бүтэн хувилбараар үзэх</div>
        <div style="font-size:.7rem;color:rgba(255,255,255,0.5);">Chrome / Safari дээр нээнэ үү</div>
      </div>
      <button id="ob-open" style="
        background:linear-gradient(135deg,#00e5ff,#a855f7);
        border:none;border-radius:99px;
        padding:.55rem 1.25rem;
        font-size:.8rem;font-weight:700;color:#07070e;
        cursor:pointer;white-space:nowrap;flex-shrink:0;
      ">🌐 Browser-т нээх</button>
      <button id="ob-close" style="
        background:none;border:none;color:rgba(255,255,255,0.4);
        font-size:1.2rem;cursor:pointer;padding:.25rem;flex-shrink:0;
      ">✕</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('ob-open').onclick = function () {
    if (isAndroid) openAndroid();
    else if (isIOS) openIOS();
    else window.open(url, '_blank');
  };

  document.getElementById('ob-close').onclick = function () {
    banner.remove();
  };
})();
