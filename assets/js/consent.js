/* RobotVacuumLab — Consent banner controller (GA4 + Google Consent Mode v2)
   Requirements:
   - Default consent denied MUST be set in <head> before gtag('config')
   - This script: stores user choice + updates consent + shows/hides banner
   - Storage: localStorage -> cookie fallback -> memory fallback
   - Banner: #cookieBanner + .is-open animation (styles.css)
*/

(function () {
  'use strict';

  var STORAGE_KEY = 'rvl_consent_v2';
  var COOKIE_NAME = 'rvl_consent';
  var COOKIE_DAYS = 180;

  // CSS transition token is 160ms in your CSS; add a small cushion
  var ANIM_MS = 180;

  // in-memory fallback (last resort)
  var memStore = null;

  function safeJsonParse(value) {
    try { return JSON.parse(value); } catch (e) { return null; }
  }

  function canUseStorage() {
    try {
      var k = '__rvl_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  var hasStorage = canUseStorage();

  function setCookie(name, value, days) {
    try {
      var maxAge = days * 24 * 60 * 60;
      document.cookie =
        name + '=' + encodeURIComponent(value) +
        '; Max-Age=' + maxAge +
        '; Path=/' +
        '; SameSite=Lax';
    } catch (e) {}
  }

  function getCookie(name) {
    try {
      var match = document.cookie.match(
        new RegExp('(?:^|; )' + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') + '=([^;]*)')
      );
      return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
      return null;
    }
  }

  function setStored(payload) {
    var raw = '';
    try { raw = JSON.stringify(payload); } catch (e) { raw = ''; }

    if (hasStorage) {
      try { localStorage.setItem(STORAGE_KEY, raw); } catch (e) {}
    } else {
      memStore = payload;
    }

    // Always keep a cookie fallback too
    setCookie(COOKIE_NAME, raw, COOKIE_DAYS);
  }

  function getStored() {
    if (hasStorage) {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = safeJsonParse(raw);
      if (parsed) return parsed;
    }

    var c = getCookie(COOKIE_NAME);
    var parsedC = safeJsonParse(c);
    if (parsedC) return parsedC;

    return memStore;
  }

  function normalizeChoice(choice) {
    if (choice === 'accepted' || choice === 'rejected') return choice;
    if (choice === 'granted') return 'accepted';
    if (choice === 'denied') return 'rejected';
    return null;
  }

  function safeGtag() {
    // If your head snippet is missing for some reason, create a minimal queue
    if (typeof window.gtag === 'function') return window.gtag;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    return window.gtag;
  }

  // Editorial site recommendation:
  // - analytics follows user choice
  // - ads stays denied unless you truly run ads
  function applyConsent(choice) {
    var gtag = safeGtag();

    if (choice === 'accepted') {
      gtag('consent', 'update', {
        analytics_storage: 'granted',
        functionality_storage: 'granted',
        personalization_storage: 'granted',
        security_storage: 'granted',

        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
      return;
    }

    // rejected / default
    gtag('consent', 'update', {
      analytics_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',

      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
  }

  function setChoice(choice) {
    var payload = { choice: choice, ts: Date.now(), v: 2 };
    setStored(payload);
    applyConsent(choice);
  }

  function getChoice() {
    var data = getStored();
    return data && data.choice ? normalizeChoice(data.choice) : null;
  }

  function getBannerEl() {
    return document.getElementById('cookieBanner');
  }

  function showBanner() {
    var el = getBannerEl();
    if (!el) return;

    el.hidden = false;
    requestAnimationFrame(function () {
      el.classList.add('is-open');
    });
  }

  function hideBanner() {
    var el = getBannerEl();
    if (!el) return;

    el.classList.remove('is-open');
    window.setTimeout(function () {
      el.hidden = true;
    }, ANIM_MS);
  }

  // Handle button clicks (works even if buttons have inner spans)
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var accept = t.closest('[data-consent-accept]');
    var reject = t.closest('[data-consent-reject]');
    var close  = t.closest('[data-consent-close]');

    if (accept) {
      setChoice('accepted');
      hideBanner();
      return;
    }

    if (reject) {
      setChoice('rejected');
      hideBanner();
      return;
    }

    // Optional close: keep denied, do not store a choice
    if (close) {
      applyConsent('rejected');
      hideBanner();
    }
  });

  function boot() {
    var choice = getChoice();

    if (choice === 'accepted') {
      applyConsent('accepted');
      hideBanner();
      return;
    }

    // rejected or no choice => denied
    applyConsent('rejected');

    if (choice === 'rejected') hideBanner();
    else showBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
