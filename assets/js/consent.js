/* RobotVacuumLab - Consent banner + Google Consent Mode v2
   - Default: denied (no cookies until user chooses)
   - Stores choice in localStorage
   - Updates gtag consent state
*/

(function () {
  const STORAGE_KEY = "rvl_consent_v1";

  function safeJsonParse(value) {
    try { return JSON.parse(value); } catch { return null; }
  }

  function applyConsent(state) {
    // state: "granted" | "denied"
    if (typeof window.gtag !== "function") return;

    window.gtag("consent", "update", {
      ad_storage: state,
      ad_user_data: state,
      ad_personalization: state,
      analytics_storage: state
    });
  }

  function setChoice(choice) {
    // choice: "accepted" | "rejected"
    const payload = { choice, ts: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    applyConsent(choice === "accepted" ? "granted" : "denied");
  }

  function getChoice() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = safeJsonParse(raw);
    return data && (data.choice === "accepted" || data.choice === "rejected") ? data.choice : null;
  }

  function hideBanner() {
    const el = document.getElementById("cookieBanner");
    if (el) el.hidden = true;
  }

  function showBanner() {
    const el = document.getElementById("cookieBanner");
    if (el) el.hidden = false;
  }

  // Wire up buttons
  document.addEventListener("click", function (e) {
    const t = e.target;
    if (!t) return;

    if (t.matches("[data-consent-accept]")) {
      setChoice("accepted");
      hideBanner();
    }

    if (t.matches("[data-consent-reject]")) {
      setChoice("rejected");
      hideBanner();
    }
  });

  // On load: apply stored choice, or show banner
  document.addEventListener("DOMContentLoaded", function () {
    const choice = getChoice();
    if (choice) {
      applyConsent(choice === "accepted" ? "granted" : "denied");
      hideBanner();
    } else {
      showBanner();
    }
  });
})();
