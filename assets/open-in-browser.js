// Force-open in real browser when loaded inside an in-app browser
(function () {
  const ua = navigator.userAgent || '';
  const isInApp =
    /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|TikTok|LinkedInApp|Pinterest/i.test(ua) ||
    (/iPhone|iPad/.test(ua) && !ua.includes('Safari')) ||
    (ua.includes('Android') && ua.includes('wv')) ||
    ua.includes('GSA/');

  if (!isInApp) return;

  const url = location.href;
  const isAndroid = /Android/.test(ua);
  const isIOS = /iPhone|iPad|iPod/.test(ua);

  // Android: intent:// redirects automatically — no user gesture needed
  if (isAndroid) {
    location.replace(
      'intent://' + url.replace(/^https?:\/\//, '') +
      '#Intent;scheme=https;action=android.intent.action.VIEW;end'
    );
    return;
  }

  // iOS / other: needs user gesture — show full-screen blocker
  if (sessionStorage.getItem('ob_shown')) return;
  sessionStorage.setItem('ob_shown', '1');

  function doOpen() {
    // Try Chrome first, fall back to Safari
    location.href = url.replace(/^https?:\/\//, 'googlechrome://');
    setTimeout(() => {
      location.href = url.replace(/^https?:\/\//, 'x-safari-https://');
    }, 400);
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:2147483647',
    'background:#07070e',
    'display:flex','flex-direction:column',
    'align-items:center','justify-content:center',
    'gap:1.5rem','padding:2rem',
    'font-family:Outfit,sans-serif','text-align:center',
    'cursor:pointer'
  ].join(';');

  overlay.innerHTML = `
    <div style="font-size:3.5rem;">🌐</div>
    <div style="font-size:1.25rem;font-weight:800;color:#fff;line-height:1.4;">
      Safari / Chrome дээр нээнэ үү
    </div>
    <div style="font-size:.88rem;color:rgba(255,255,255,.5);line-height:1.6;max-width:280px;">
      Энэ контентыг бүтэн үзэхийн тулд<br>жинхэнэ хөтөч дээр нээх шаардлагатай.
    </div>
    <button style="
      background:linear-gradient(135deg,#00e5ff,#a855f7);
      border:none;border-radius:99px;
      padding:.85rem 2.5rem;
      font-size:1rem;font-weight:800;color:#07070e;
      letter-spacing:.5px;cursor:pointer;
      box-shadow:0 0 40px rgba(0,229,255,.35);
    ">Safari-д нээх</button>
    <div style="font-size:.72rem;color:rgba(255,255,255,.25);">
      newdrama.mn
    </div>
  `;

  overlay.onclick = doOpen;
  document.body.appendChild(overlay);
})();
