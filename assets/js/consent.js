/* RobotVacuumLab - Consent banner + Google Consent Mode v2 (UPDATED)
   - Default: denied (no storage until user chooses)
   - Optional wait_for_update to prevent early pings
   - Stores choice in localStorage (with safe fallback)
   - Updates gtag consent state
   - Works with CSS: #cookieBanner + .is-open animation
*/

(function () {
  const STORAGE_KEY = "rvl_consent_v2"; // bump version to refresh old choices if needed
  const DEFAULT_STATE = "denied"; // "denied" | "granted"

  // In-memory fallback if localStorage is blocked
  let memStore = null;

  function safeJsonParse(value) {
    try { return JSON.parse(value); } catch { return null; }
  }

  function canUseStorage() {
    try {
      const k = "__rvl_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  const hasStorage = canUseStorage();

  function setStored(payload) {
    if (hasStorage) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); return; } catch {}
    }
    memStore = payload;
  }

  function getStored() {
    if (hasStorage) {
      const raw = localStorage.getItem(STORAGE_KEY);
      return safeJsonParse(raw);
    }
    return memStore;
  }

  function gtagReady() {
    return typeof window.gtag === "function";
  }

  // IMPORTANT: Set default denied as early as possible (Consent Mode v2)
  function setDefaultConsent() {
    if (!gtagReady()) return;
    window.gtag("consent", "default", {
      ad_storage: DEFAULT_STATE,
      analytics_storage: DEFAULT_STATE,
      ad_user_data: DEFAULT_STATE,
      ad_personalization: DEFAULT_STATE,
      // helps prevent early hits before user choice
      wait_for_update: 500
    });
  }

  function applyConsent(state) {
    // state: "granted" | "denied"
    if (!gtagReady()) return;

    window.gtag("consent", "update", {
      ad_storage: state,
      analytics_storage: state,
      ad_user_data: state,
      ad_personalization: state
    });
  }

  function setChoice(choice) {
    // choice: "accepted" | "rejected"
    const payload = { choice, ts: Date.now(), v: 2 };
    setStored(payload);
    applyConsent(choice === "accepted" ? "granted" : "denied");
  }

  function getChoice() {
    const data = getStored();
    return data && (data.choice === "accepted" || data.choice === "rejected") ? data.choice : null;
  }

  function getBannerEl() {
    return document.getElementById("cookieBanner");
  }

  function showBanner() {
    const el = getBannerEl();
    if (!el) return;
    el.hidden = false;
    // trigger animation class
    requestAnimationFrame(() => el.classList.add("is-open"));
  }

  function hideBanner() {
    const el = getBannerEl();
    if (!el) return;

    // animate out if possible
    el.classList.remove("is-open");
    // after transition, hide
    const done = () => {
      el.hidden = true;
      el.removeEventListener("transitionend", done);
    };
    el.addEventListener("transitionend", done);
    // safety fallback (if transitionend doesn't fire)
    setTimeout(() => { if (!el.hidden) el.hidden = true; }, 250);
  }

  // Try to set default consent ASAP.
  // If gtag isn't ready yet, retry a few times quickly.
  (function earlyDefault() {
    let tries = 0;
    const maxTries = 20; // ~2s total
    const tick = () => {
      tries++;
      if (gtagReady()) {
        setDefaultConsent();
      } else if (tries < maxTries) {
        setTimeout(tick, 100);
      }
    };
    tick();
  })();

  // Wire up buttons (use closest so clicks on inner spans work)
  document.addEventListener("click", function (e) {
    const btnAccept = e.target && e.target.closest && e.target.closest("[data-consent-accept]");
    const btnReject = e.target && e.target.closest && e.target.closest("[data-consent-reject]");
    const btnClose  = e.target && e.target.closest && e.target.closest("[data-consent-close]");

    if (btnAccept) {
      setChoice("accepted");
      hideBanner();
      return;
    }
    if (btnReject) {
      setChoice("rejected");
      hideBanner();
      return;
    }
    // optional: close without saving a choice (keeps default denied)
    if (btnClose) {
      hideBanner();
    }
  });

  // On DOM ready: apply stored choice, or show banner
  document.addEventListener("DOMContentLoaded", function () {
    const choice = getChoice();

    if (choice === "accepted") {
      applyConsent("granted");
      hideBanner();
      return;
    }

    // If rejected OR no choice, ensure denied (default)
    applyConsent("denied");

    if (choice === "rejected") {
      hideBanner();
    } else {
      showBanner();
    }
  });
})();
