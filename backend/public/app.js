(() => {
  const profileButtons = Array.from(
    document.querySelectorAll(".profile-btn[data-profile]"),
  );
  const statusEl = document.getElementById("status");
  const dashboardEl = document.getElementById("dashboard");
  const directionEl = document.getElementById("direction");
  const horizonEl = document.getElementById("horizon");
  const oppTickerEl = document.getElementById("opp-ticker");
  const oppRecEl = document.getElementById("opp-rec");
  const oppScoreEl = document.getElementById("opp-score");
  const riskTickerEl = document.getElementById("risk-ticker");
  const riskRecEl = document.getElementById("risk-rec");
  const riskScoreEl = document.getElementById("risk-score");
  const catalystBodyEl = document.getElementById("catalyst-body");
  const reasonEl = document.getElementById("reason");
  const summaryEl = document.getElementById("summary");
  const generatedEl = document.getElementById("generated");

  let activeProfile = "SHORT_TERM";
  let requestId = 0;

  function setStatus(kind, message) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = "";
      statusEl.removeAttribute("data-kind");
      return;
    }

    statusEl.hidden = false;
    statusEl.dataset.kind = kind;
    statusEl.textContent = message;
  }

  function setActiveProfile(profile) {
    activeProfile = profile;
    for (const button of profileButtons) {
      const selected = button.dataset.profile === profile;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    }
  }

  function formatDate(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderCatalyst(catalyst) {
    if (!catalyst) {
      catalystBodyEl.innerHTML =
        '<p class="catalyst-empty">No confirmed news or event catalyst is available.</p>';
      return;
    }

    const ticker = catalyst.ticker ? ` · ${catalyst.ticker}` : "";
    catalystBodyEl.innerHTML = `
      <p class="catalyst-headline"></p>
      <p class="catalyst-meta"></p>
    `;
    catalystBodyEl.querySelector(".catalyst-headline").textContent =
      catalyst.headline;
    catalystBodyEl.querySelector(".catalyst-meta").textContent =
      `${formatDate(catalyst.date)} · ${catalyst.source}${ticker}`;
  }

  function renderDashboard(data) {
    directionEl.textContent = data.marketDirection;
    directionEl.dataset.dir = data.marketDirection;
    horizonEl.textContent =
      data.profile === "SHORT_TERM"
        ? "Focus: next few trading days"
        : "Focus: multi-month opportunities";

    oppTickerEl.textContent = data.topOpportunity.ticker;
    oppRecEl.textContent = data.topOpportunity.recommendation;
    oppScoreEl.textContent = `Score ${data.topOpportunity.score}`;

    riskTickerEl.textContent = data.topRisk.ticker;
    riskRecEl.textContent = data.topRisk.recommendation;
    riskScoreEl.textContent = `Score ${data.topRisk.score}`;

    renderCatalyst(data.catalyst);
    reasonEl.textContent = data.reason || "";
    summaryEl.textContent = data.summary;
    generatedEl.textContent = `Updated ${formatDate(data.generatedAt)}`;

    dashboardEl.hidden = false;
    dashboardEl.classList.remove("is-visible");
    // Restart enter animation on profile switches.
    void dashboardEl.offsetWidth;
    dashboardEl.classList.add("is-visible");
  }

  async function loadToday(profile) {
    const currentRequest = ++requestId;
    setActiveProfile(profile);
    dashboardEl.hidden = true;
    setStatus("loading", "Loading today’s setup…");

    try {
      const response = await fetch(`/today?profile=${encodeURIComponent(profile)}`);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const data = await response.json();
      if (currentRequest !== requestId) {
        return;
      }

      setStatus("", "");
      renderDashboard(data);
    } catch (error) {
      if (currentRequest !== requestId) {
        return;
      }

      dashboardEl.hidden = true;
      setStatus(
        "error",
        error instanceof Error
          ? `Could not load today’s move. ${error.message}`
          : "Could not load today’s move.",
      );
    }
  }

  for (const button of profileButtons) {
    button.addEventListener("click", () => {
      const profile = button.dataset.profile;
      if (!profile || profile === activeProfile) {
        return;
      }
      loadToday(profile);
    });
  }

  loadToday(activeProfile);
})();
