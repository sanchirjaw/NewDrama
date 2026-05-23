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
  const isFB = /FBAN|FBAV/i.test(ua);
  const isIG = /Instagram/i.test(ua);

  // ── Android: intent:// → Chrome (automatic, no gesture needed) ──
  if (isAndroid) {
    location.replace(
      'intent://' + url.replace(/^https?:\/\//, '') +
      '#Intent;scheme=https;action=android.intent.action.VIEW;end'
    );
    return;
  }

  // ── iOS: full-screen blocker ──
  if (sessionStorage.getItem('ob_shown')) return;
  sessionStorage.setItem('ob_shown', '1');

  // Determine which app and show matching instruction
  let appHint = '';
  if (isFB)      appHint = '📌 Facebook → доод баруун буланд <b>···</b> → <b>"Safari дээр нээх"</b>';
  else if (isIG) appHint = '📌 Instagram → доод баруун буланд <b>⋯</b> → <b>"Safari дээр нээх"</b>';
  else           appHint = '📌 Доод баруун буланд <b>···</b> → <b>"Safari дээр нээх"</b>';

  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:2147483647',
    'background:#07070e',
    'display:flex','flex-direction:column',
    'align-items:center','justify-content:center',
    'gap:1.25rem','padding:2rem',
    'font-family:Outfit,sans-serif','text-align:center'
  ].join(';');

  overlay.innerHTML = `
    <div style="font-size:3rem;">🌐</div>
    <div style="font-size:1.2rem;font-weight:800;color:#fff;line-height:1.4;">
      Safari дээр нээнэ үү
    </div>
    <div style="font-size:.85rem;color:rgba(255,255,255,.55);line-height:1.8;max-width:300px;">
      ${appHint}
    </div>
    <div style="width:100%;max-width:320px;height:1px;background:rgba(255,255,255,.08);"></div>
    <div style="font-size:.8rem;color:rgba(255,255,255,.4);">Эсвэл холбоосыг хуулж Safari-д буулгана уу</div>
    <button id="ob-copy" style="
      background:linear-gradient(135deg,#00e5ff,#a855f7);
      border:none;border-radius:99px;
      padding:.8rem 2rem;
      font-size:.95rem;font-weight:800;color:#07070e;
      letter-spacing:.3px;cursor:pointer;
      box-shadow:0 0 32px rgba(0,229,255,.3);
      min-width:200px;
    ">🔗 Холбоос хуулах</button>
    <div id="ob-copied" style="font-size:.8rem;color:#00e5ff;display:none;">✓ Хуулагдлаа — Safari нээгээд буулгана уу</div>
    <div style="font-size:.7rem;color:rgba(255,255,255,.18);margin-top:.5rem;">newdrama.mn</div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('ob-copy').onclick = function () {
    navigator.clipboard.writeText(url).then(() => {
      this.textContent = '✓ Хуулагдлаа';
      this.style.background = 'rgba(0,229,255,.15)';
      this.style.color = '#00e5ff';
      this.style.border = '1px solid rgba(0,229,255,.4)';
      document.getElementById('ob-copied').style.display = 'block';
    }).catch(() => {
      // Fallback for older iOS
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      try { document.execCommand('copy'); } catch(e) {}
      ta.remove();
      this.textContent = '✓ Хуулагдлаа';
      document.getElementById('ob-copied').style.display = 'block';
    });
  };
})();
