/* =========================================
   /assets/js/site.js — RobotVacuumLab (ULTRA COMPLETE)
   - Mobile menu (accessible)
   - Cookie consent banner (analytics opt-in)
   - GA4 consent updates (default denied in <head>)
   - Affiliate/outbound click tracking (data-affiliate / data-affiliate-label)
   - Small UX helpers (hash focus, external rel hardening)
   ========================================= */

(() => {
  "use strict";

  /* ---------- Config ---------- */
  const CONSENT_KEY = "rvl_consent_v1"; // localStorage key
  const CONSENT_TTL_DAYS = 180;         // re-ask after X days
  const DEBUG = false;

  // GA4 measurement ID is already in your HTML gtag script.
  // We do NOT duplicate it here to avoid mismatches.
  const GA_EVENT_TIMEOUT_MS = 160; // only used when we need to delay navigation

  /* ---------- Tiny helpers ---------- */
  const log = (...args) => { if (DEBUG) console.log("[RVL]", ...args); };

  const qs  = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const safeJSONParse = (s) => {
    try { return JSON.parse(s); } catch { return null; }
  };

  const nowISO = () => new Date().toISOString();

  const daysBetween = (a, b) => Math.round((b - a) / (1000 * 60 * 60 * 24));

  /* ---------- gtag safe wrapper ---------- */
  function gtagSafe(...args) {
    // gtag is created in <head>, but this keeps JS resilient if blocked.
    if (typeof window.gtag === "function") {
      window.gtag(...args);
      return true;
    }
    return false;
  }

  /* ---------- Consent model ---------- */
  function readConsent() {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const data = safeJSONParse(raw);
    if (!data || typeof data !== "object") return null;

    // TTL check
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
    // status: "accepted" | "rejected"
    const payload = { status, savedAt: nowISO() };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(payload));
    return payload;
  }

  function applyConsentToGA(status) {
    // You said: "analytics only if you accept"
    // So:
    // - Reject: analytics_storage denied, ad_storage denied
    // - Accept: analytics_storage granted, ad_storage denied (keeps ads off)
    const update = status === "accepted"
      ? { analytics_storage: "granted", ad_storage: "denied" }
      : { analytics_storage: "denied",  ad_storage: "denied"  };

    const ok = gtagSafe("consent", "update", update);
    log("Consent update sent to GA:", update, "gtag ok:", ok);

    // Optional: send a lightweight event when consent changes (only if gtag exists)
    if (ok) {
      gtagSafe("event", "consent_update", {
        consent_status: status,
        non_interaction: true
      });
    }
  }

  /* ---------- Cookie banner ---------- */
  function initCookieBanner() {
    const banner = qs("#cookieBanner");
    if (!banner) return;

    const btnAccept = qs("[data-consent-accept]", banner);
    const btnReject = qs("[data-consent-reject]", banner);

    const existing = readConsent();

    // If user already decided recently, keep hidden and apply again (defensive)
    if (existing?.status === "accepted" || existing?.status === "rejected") {
      applyConsentToGA(existing.status);
      banner.hidden = true;
      return;
    }

    // Show banner
    banner.hidden = false;

    // Trap: keep it simple (no heavy focus trap); but we set initial focus on keyboard open.
    const show = () => { banner.hidden = false; };
    const hide = () => { banner.hidden = true; };

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

    // If user presses Escape, treat as reject (privacy-first)
    document.addEventListener("keydown", (e) => {
      if (banner.hidden) return;
      if (e.key === "Escape") onReject();
    });

    show();
  }

  /* ---------- Mobile menu ---------- */
  function initMobileMenu() {
    const btn = qs(".menu-btn");
    const nav = qs("#mobileNav");
    if (!btn || !nav) return;

    const openClass = "open";
    const setExpanded = (v) => btn.setAttribute("aria-expanded", String(v));

    const open = () => {
      nav.classList.add(openClass);
      setExpanded(true);

      // Focus first link for keyboard users
      const firstLink = qs("a", nav);
      firstLink?.focus?.();
    };

    const close = () => {
      nav.classList.remove(openClass);
      setExpanded(false);
    };

    const toggle = () => {
      const isOpen = nav.classList.contains(openClass);
      isOpen ? close() : open();
    };

    btn.addEventListener("click", toggle);

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!nav.classList.contains(openClass)) return;
      close();
      btn.focus();
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (!nav.classList.contains(openClass)) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (nav.contains(target) || btn.contains(target)) return;
      close();
    });

    // Close on resize to desktop (prevents stuck open)
    const mq = window.matchMedia("(min-width: 48rem)");
    const onMQ = () => { if (mq.matches) close(); };
    mq.addEventListener?.("change", onMQ);
    onMQ();
  }

  /* ---------- Affiliate + outbound tracking ---------- */
  function isExternalURL(url) {
    try {
      const u = new URL(url, window.location.href);
      return u.origin !== window.location.origin;
    } catch {
      return false;
    }
  }

  function hardenExternalLinks() {
    // Ensure external links that open new tabs have rel="noopener"
    const links = qsa('a[target="_blank"]');
    links.forEach((a) => {
      const rel = (a.getAttribute("rel") || "").split(/\s+/).filter(Boolean);
      const relSet = new Set(rel);
      relSet.add("noopener");
      relSet.add("noreferrer"); // optional but good for privacy
      a.setAttribute("rel", Array.from(relSet).join(" "));
    });
  }

  function trackAffiliateClick(anchor) {
    const partner = anchor.getAttribute("data-affiliate") || "unknown";
    const label = anchor.getAttribute("data-affiliate-label") || anchor.textContent?.trim() || "affiliate_link";
    const href = anchor.getAttribute("href") || "";

    // Fire GA event if possible
    const ok = gtagSafe("event", "affiliate_click", {
      affiliate_partner: partner,
      affiliate_label: label,
      link_url: href,
      page_path: window.location.pathname,
      outbound: true
    });

    log("affiliate_click", { partner, label, href, ok });
    return ok;
  }

  function trackOutboundClick(anchor) {
    const href = anchor.getAttribute("href") || "";
    const label = anchor.getAttribute("data-outbound-label") || anchor.textContent?.trim() || "outbound_link";

    const ok = gtagSafe("event", "outbound_click", {
      outbound_label: label,
      link_url: href,
      page_path: window.location.pathname,
      outbound: true
    });

    log("outbound_click", { label, href, ok });
    return ok;
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

      // Only delay navigation if same-tab external and we want event to send.
      // Many of your affiliate links are target=_blank already, so no delay needed.
      const opensNewTab = (a.getAttribute("target") || "").toLowerCase() === "_blank";

      let sent = false;
      if (isAffiliate) {
        sent = trackAffiliateClick(a);
      } else if (isExternal) {
        sent = trackOutboundClick(a);
      } else {
        return; // internal link: no tracking here
      }

      // Delay ONLY if:
      // - event was sent
      // - it does NOT open in new tab
      // - user didn't use modifier keys to open new tab anyway
      const modifier = e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
      if (sent && !opensNewTab && !modifier) {
        e.preventDefault();
        const dest = a.href;

        // Very short delay; if GA is blocked, we still navigate immediately.
        window.setTimeout(() => {
          window.location.href = dest;
        }, GA_EVENT_TIMEOUT_MS);
      }
    }, { capture: true });
  }

  /* ---------- Hash focus helper (accessibility) ---------- */
  function initHashFocus() {
    // If user jumps to an anchor, focus the target for screen readers.
    function focusFromHash() {
      const id = decodeURIComponent(window.location.hash || "").replace("#", "");
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;

      // Make focusable temporarily
      const hadTabIndex = el.hasAttribute("tabindex");
      if (!hadTabIndex) el.setAttribute("tabindex", "-1");
      el.focus({ preventScroll: true });

      // Let browser scroll normally after focus
      el.scrollIntoView({ block: "start", behavior: "smooth" });

      if (!hadTabIndex) {
        window.setTimeout(() => el.removeAttribute("tabindex"), 600);
      }
    }

    window.addEventListener("hashchange", focusFromHash);
    // Run once on load (if URL already has hash)
    window.setTimeout(focusFromHash, 0);
  }

  /* ---------- Footer year helper (optional) ---------- */
  function initFooterYear() {
    // If you ever switch to <span data-year></span>, this auto-fills it.
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
