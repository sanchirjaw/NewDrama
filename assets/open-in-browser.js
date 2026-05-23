// Android in-app browser → force open in Chrome
(function () {
  const ua = navigator.userAgent || '';
  if (!ua.includes('Android')) return;
  if (!(ua.includes('wv') || /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Snapchat|Twitter|TikTok/i.test(ua))) return;
  const url = location.href;
  location.replace(
    'intent://' + url.replace(/^https?:\/\//, '') +
    '#Intent;scheme=https;action=android.intent.action.VIEW;end'
  );
})();
