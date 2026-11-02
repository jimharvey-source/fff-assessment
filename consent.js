// consent.js: cookie consent, and the analytics it gates.
// Google Analytics is not loaded, and no request reaches Google, until the
// visitor accepts. Declining is a real decline. Pattern copied from OSCI Pro.
(function () {
  var GA_ID = 'G-YVEVELDZRE';
  var COOKIE = 'fff_cookie_choice';
  var ONE_YEAR = 60 * 60 * 24 * 365;

  // Pages call gtag() for events. Until consent it queues harmlessly in
  // dataLayer and is never sent, because the Google script is not loaded.
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };

  function readChoice() {
    try {
      var m = document.cookie.match(new RegExp('(^|;\\s*)' + COOKIE + '=([^;]*)'));
      return m ? decodeURIComponent(m[2]) : null;
    } catch (e) { console.error('[consent] read failed', e); return null; }
  }
  function writeChoice(v) {
    try { document.cookie = COOKIE + '=' + encodeURIComponent(v) + '; max-age=' + ONE_YEAR + '; path=/; SameSite=Lax'; }
    catch (e) { console.error('[consent] write failed', e); }
  }

  var loaded = false;
  function loadAnalytics() {
    if (loaded) return; loaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    s.onerror = function () { console.error('[consent] analytics failed to load'); };
    document.head.appendChild(s);
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { content_group: 'FFF' });
  }
  function dropQueue() { window.dataLayer.length = 0; }

  var STYLE = '.fff-consent{position:fixed;bottom:0;left:0;right:0;background:#1A1A2E;border-top:4px solid #E8231A;padding:16px 32px;display:flex;align-items:center;justify-content:space-between;gap:24px;z-index:9000;flex-wrap:wrap;font-family:Barlow,system-ui,sans-serif}'
    + '.fff-consent p{font-size:14px;line-height:1.5;color:rgba(255,255,255,0.8);flex:1;min-width:220px;margin:0}'
    + '.fff-consent a{color:#fff;text-decoration:underline}'
    + '.fff-consent-btns{display:flex;gap:12px;flex-shrink:0}'
    + '.fff-consent button{font-family:inherit;font-size:14px;border-radius:2px;cursor:pointer;padding:10px 22px}'
    + '.fff-accept{background:#E8231A;color:#fff;border:none;font-weight:600}'
    + '.fff-decline{background:transparent;color:rgba(255,255,255,0.75);border:1px solid rgba(255,255,255,0.35)}'
    + '@media(max-width:600px){.fff-consent{flex-direction:column;align-items:flex-start;padding:16px 20px}}'
    + '@media print{.fff-consent{display:none}}';

  function showBanner() {
    var st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    var bar = document.createElement('div');
    bar.className = 'fff-consent';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie choice');
    bar.innerHTML = '<p>We would like to use Google Analytics to see how people use the assessment. '
      + 'Nothing loads until you say yes, and the site works either way. '
      + '<a href="/cookies" target="_blank" rel="noopener noreferrer">What we set</a>.</p>'
      + '<div class="fff-consent-btns"><button type="button" class="fff-accept">Accept</button>'
      + '<button type="button" class="fff-decline">Decline</button></div>';
    function close() { if (bar.parentNode) bar.parentNode.removeChild(bar); }
    bar.querySelector('.fff-accept').addEventListener('click', function () { writeChoice('accepted'); loadAnalytics(); close(); });
    bar.querySelector('.fff-decline').addEventListener('click', function () { writeChoice('declined'); dropQueue(); close(); });
    document.body.appendChild(bar);
  }

  window.fffResetCookieChoice = function () {
    try { document.cookie = COOKIE + '=; max-age=0; path=/; SameSite=Lax'; } catch (e) {}
    window.location.reload();
  };

  function start() {
    var c = readChoice();
    if (c === 'accepted') { loadAnalytics(); return; }
    if (c === 'declined') { dropQueue(); return; }
    showBanner();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
