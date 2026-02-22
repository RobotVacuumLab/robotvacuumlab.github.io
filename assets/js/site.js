/* =========================================
   /assets/js/site.js — RobotVacuumLab (AUDIT-PROOF)
   - Mobile menu (accessible + hidden when closed)
   - Cookie consent banner (analytics opt-in only)
   - GA4 consent updates (default denied in <head>)
   - Affiliate/outbound click tracking (respects consent)
   - UX helpers (hash focus, external rel hardening)
   ========================================= */

(() => {
  "use strict";

  /* ---------- Config ---------- */
  const CONSENT_KEY = "rvl_consent_v1";
  const CONSENT_TTL_DAYS = 180;
  const DEBUG = false;

  const GA_EVENT_TIMEOUT_MS = 180; // short delay when navigating same-tab

  // If you REALLY want noreferrer on target=_blank links, set true.
  // For affiliate links (Amazon), it's safer to keep referrer behavior intact -> false.
  const ADD_NOREFFERER_TO_BLANK = false;

  /* ---------- Tiny helpers ---------- */
  const log = (...args) => { if (DEBUG) console.log("[RVL]", ...args); };

  const qs  = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const safeJSONParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  const nowISO = () => new Date().toISOString();

  const daysBetween = (a, b) => Math.round((b - a) / (1000 * 60 * 60 * 24));

  function isReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  /* ---------- gtag safe wrapper ---------- */
  function gtagSafe(...args) {
    if (typeof window.gtag === "function") {
      window.gtag(...args);
      return true;
    }
    return false;
  }

  /* ---------- LocalStorage safe wrappers ---------- */
  function lsGet(key) {
    try { return window.localStorage.getItem(key); }
    catch { return null; }
  }

  function lsSet(key, value) {
    try { window.localStorage.setItem(key, value); return true; }
    catch { return false; }
  }

  /* ---------- Consent model ---------- */
  function readConsent() {
    const raw = lsGet(CONSENT_KEY);
    if (!raw) return null;

    const data = safeJSONParse(raw);
    if (!data || typeof data !== "object") return null;

    if (data.savedAt) {
      const saved = new Date(data.savedAt).getTime();
      if (!Number.isNaN(saved)) {
        const age = daysBetween(saved, Date.now());
        if (age > CONSENT_TTL_DAYS) return null;
      }
    }
    return data;
  }

  function writeConsent(status) {
    const payload = { status, savedAt: nowISO() }; // status: "accepted" | "rejected"
    lsSet(CONSENT_KEY, JSON.stringify(payload));
    return payload;
  }

  function applyConsentToGA(status) {
    // Keep it aligned with the default consent object in <head>.
    // Analytics only if accept. Ads always denied.
    const accepted = status === "accepted";

    const update = {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",

      analytics_storage: accepted ? "granted" : "denied",

      // Keep these denied unless you explicitly want them.
      functionality_storage: "denied",
      personalization_storage: "denied",

      security_storage: "granted"
    };

    const ok = gtagSafe("consent", "update", update);
    log("GA consent update:", update, "gtag ok:", ok);

    // Optional internal event when consent changes (ignored if analytics denied)
    if (ok && accepted) {
      gtagSafe("event", "consent_update", {
        consent_status: status,
        non_interaction: true
      });
    }
  }

  function canTrackAnalytics() {
    const c = readConsent();
    return c?.status === "accepted" && typeof window.gtag === "function";
  }

  /* ---------- Cookie banner ---------- */
  function initCookieBanner() {
    const banner = qs("#cookieBanner");
    if (!banner) return;

    const dialog = qs(".cookie-banner__inner", banner) || banner;
    const btnAccept = qs("[data-consent-accept]", banner);
    const btnReject = qs("[data-consent-reject]", banner);

    const existing = readConsent();

    // If already decided recently, keep hidden and apply again (defensive)
    if (existing?.status === "accepted" || existing?.status === "rejected") {
      applyConsentToGA(existing.status);
      banner.hidden = true;
      return;
    }

    let lastFocus = null;

    const show = () => {
      lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      banner.hidden = false;

      // Focus a primary action for keyboard/screen readers
      // Privacy-first: many sites focus Reject. If you prefer that, swap target order below.
      const target = btnAccept || btnReject || dialog;
      if (target && typeof target.focus === "function") {
        if (target === dialog && !dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
        target.focus();
      }
    };

    const hide = () => {
      banner.hidden = true;
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      lastFocus = null;
    };

    const onAccept = () => {
      const saved = writeConsent("accepted");
      applyConsentToGA(saved.status);
      hide();
    };

    const onReject = () => {
      const saved = writeConsent("rejected");
      applyConsentToGA(saved.status);
      hide();
    };

    btnAccept?.addEventListener("click", onAccept);
    btnReject?.addEventListener("click", onReject);

    // Escape => reject (privacy-first)
    document.addEventListener("keydown", (e) => {
      if (banner.hidden) return;
      if (e.key === "Escape") onReject();
    });

    show();
  }

  /* ---------- Mobile menu (accessible) ---------- */
  function initMobileMenu() {
    const btn = qs(".menu-btn");
    const nav = qs("#mobileNav");
    if (!btn || !nav) return;

    const openClass = "open";

    const ensureClosedState = () => {
      nav.classList.remove(openClass);
      nav.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    };

    ensureClosedState();

    let lastFocus = null;

    const open = () => {
      lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      nav.hidden = false;
      nav.classList.add(openClass);
      btn.setAttribute("aria-expanded", "true");

      const firstLink = qs("a", nav);
      firstLink?.focus?.();

      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("click", onDocClick, { capture: true });

      bindMQ();
    };

    const close = () => {
      nav.classList.remove(openClass);
      nav.hidden = true;
      btn.setAttribute("aria-expanded", "false");

      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onDocClick, { capture: true });

      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
      lastFocus = null;
    };

    const toggle = () => {
      const isOpen = btn.getAttribute("aria-expanded") === "true";
      isOpen ? close() : open();
    };

    function onKeyDown(e) {
      if (e.key === "Escape") close();
    }

    function onDocClick(e) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (nav.contains(target) || btn.contains(target)) return;
      close();
    }

    let mq = null;
    let mqBound = false;
    function bindMQ() {
      if (mqBound) return;
      mq = window.matchMedia?.("(min-width: 48rem)");
      if (!mq) return;

      const onMQ = () => { if (mq.matches) close(); };

      mq.addEventListener?.("change", onMQ);
      onMQ();
      mqBound = true;
    }

    btn.addEventListener("click", toggle);
  }

  /* ---------- Affiliate + outbound tracking (respects consent) ---------- */
  function isExternalURL(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  function hardenExternalLinks() {
    // Add noopener (and optionally noreferrer) to target=_blank without nuking your existing rel tokens.
    const links = qsa('a[target="_blank"]');
    links.forEach((a) => {
      const relRaw = (a.getAttribute("rel") || "").trim();
      const parts = relRaw ? relRaw.split(/\s+/) : [];
      const set = new Set(parts);

      set.add("noopener");
      if (ADD_NOREFFERER_TO_BLANK) set.add("noreferrer");

      a.setAttribute("rel", Array.from(set).join(" "));
    });
  }

  function trackEvent(name, params, callback) {
    if (!canTrackAnalytics()) return false;

    const payload = Object.assign({}, params, {
      event_callback: typeof callback === "function" ? callback : undefined,
      event_timeout: GA_EVENT_TIMEOUT_MS
    });

    return gtagSafe("event", name, payload);
  }

  function initClickTracking() {
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;

      const a = target.closest("a");
      if (!a) return;

      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      const isAffiliate = a.hasAttribute("data-affiliate");
      const isExternal = isExternalURL(href);

      if (!isAffiliate && !isExternal) return;

      // If consent not accepted, do not track and do not interfere.
      if (!canTrackAnalytics()) return;

      const opensNewTab = (a.getAttribute("target") || "").toLowerCase() === "_blank";
      const modifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

      const dest = a.href;
      const partner = a.getAttribute("data-affiliate") || "unknown";
      const label =
        a.getAttribute("data-affiliate-label") ||
        a.getAttribute("data-outbound-label") ||
        a.textContent?.trim() ||
        "link";

      const common = {
        link_url: dest,
        page_path: window.location.pathname,
        outbound: true
      };

      const eventName = isAffiliate ? "affiliate_click" : "outbound_click";
      const params = isAffiliate
        ? Object.assign({}, common, { affiliate_partner: partner, affiliate_label: label })
        : Object.assign({}, common, { outbound_label: label });

      if (opensNewTab || modifier) {
        trackEvent(eventName, params);
        return;
      }

      e.preventDefault();

      let navigated = false;
      const go = () => {
        if (navigated) return;
        navigated = true;
        window.location.href = dest;
      };

      const ok = trackEvent(eventName, params, go);
      if (!ok) go();

      window.setTimeout(go, GA_EVENT_TIMEOUT_MS);
    }, { capture: true });
  }

  /* ---------- Hash focus helper ---------- */
  function initHashFocus() {
    function focusFromHash() {
      const id = decodeURIComponent(window.location.hash || "").replace("#", "");
      if (!id) return;

      const el = document.getElementById(id);
      if (!el) return;

      const hadTabIndex = el.hasAttribute("tabindex");
      if (!hadTabIndex) el.setAttribute("tabindex", "-1");

      try { el.focus({ preventScroll: true }); }
      catch { el.focus?.(); }

      const behavior = isReducedMotion() ? "auto" : "smooth";
      el.scrollIntoView({ block: "start", behavior });

      if (!hadTabIndex) {
        window.setTimeout(() => el.removeAttribute("tabindex"), 600);
      }
    }

    window.addEventListener("hashchange", focusFromHash);
    window.setTimeout(focusFromHash, 0);
  }

  /* ---------- Footer year helper (optional) ---------- */
  function initFooterYear() {
    const yearEls = qsa("[data-year]");
    if (!yearEls.length) return;
    const y = String(new Date().getFullYear());
    yearEls.forEach((el) => (el.textContent = y));
  }

  /* ---------- Init ---------- */
  function init() {
    hardenExternalLinks();
    initMobileMenu();
    initCookieBanner();
    initClickTracking();
    initHashFocus();
    initFooterYear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
