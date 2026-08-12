(() => {
  const POLL_MS = 30000;

  const profileButtons = Array.from(
    document.querySelectorAll(".profile-btn[data-profile]"),
  );
  const marketPillEl = document.getElementById("market-pill");
  const updatedAgoEl = document.getElementById("updated-ago");
  const statusEl = document.getElementById("status");
  const emptyStateEl = document.getElementById("empty-state");
  const todaysMoveEl = document.getElementById("todays-move");
  const moveHeadlineEl = document.getElementById("move-headline");
  const movePriceEl = document.getElementById("move-price");
  const moveConfidenceEl = document.getElementById("move-confidence");
  const moveReasonEl = document.getElementById("move-reason");
  const positionsSectionEl = document.getElementById("positions-section");
  const portfolioSummaryEl = document.getElementById("portfolio-summary");
  const positionCardsEl = document.getElementById("position-cards");
  const buyNoteEl = document.getElementById("buy-note");
  const buyCardsEl = document.getElementById("buy-cards");
  const generatedEl = document.getElementById("generated");
  const stalenessEl = document.getElementById("staleness");

  let activeProfile = "SHORT_TERM";
  let requestId = 0;
  let pollTimer = null;
  let lastGeneratedAt = null;
  let haveGoodData = false;

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

  function money(value) {
    if (value == null) {
      return "—";
    }
    return Number(value).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }

  function pct(value) {
    if (value == null) {
      return "—";
    }
    const sign = value > 0 ? "+" : "";
    return `${sign}${Number(value).toFixed(2)}%`;
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

  function formatAgo(iso) {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) {
      return "";
    }
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60) {
      return `Updated ${seconds}s ago`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `Updated ${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    return `Updated ${hours}h ago`;
  }

  function tickUpdatedAgo() {
    if (!lastGeneratedAt) {
      return;
    }
    updatedAgoEl.textContent = formatAgo(lastGeneratedAt);
  }

  function setActiveProfile(profile) {
    activeProfile = profile;
    for (const button of profileButtons) {
      const selected = button.dataset.profile === profile;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    }
  }

  function moveLabel(move) {
    return move === "ADD" ? "STRONG BUY / ADD" : move;
  }

  function renderMarketPill(marketStatus) {
    if (!marketStatus) {
      marketPillEl.dataset.state = "unknown";
      marketPillEl.textContent = "—";
      return;
    }
    if (marketStatus.isOpen) {
      marketPillEl.dataset.state = "live";
      marketPillEl.textContent = "LIVE";
    } else {
      marketPillEl.dataset.state = "closed";
      marketPillEl.textContent = "MARKET CLOSED";
    }
  }

  function renderOffline() {
    marketPillEl.dataset.state = "offline";
    marketPillEl.textContent = "OFFLINE";
  }

  function renderTodaysMove(move) {
    if (!move) {
      todaysMoveEl.hidden = true;
      return;
    }
    todaysMoveEl.hidden = false;
    const headline = move.ticker
      ? `${moveLabel(move.action)} ${move.ticker}`
      : moveLabel(move.action);
    moveHeadlineEl.textContent = headline;
    moveHeadlineEl.dataset.action = move.action;
    movePriceEl.textContent = money(move.currentPrice);
    moveConfidenceEl.textContent = `${move.confidence}/100`;
    moveReasonEl.textContent = move.reason || "";
  }

  function renderEstimatedOpen(container, estimatedOpen) {
    if (!estimatedOpen || !estimatedOpen.available) {
      container.innerHTML =
        '<p class="estimate-empty">No reliable next-open estimate available right now.</p>';
      return;
    }
    const dirLabel =
      estimatedOpen.gapDirection === "UP"
        ? "Gap up"
        : estimatedOpen.gapDirection === "DOWN"
          ? "Gap down"
          : "Flat";
    container.innerHTML = `
      <p class="estimate-range">Estimated open: ${money(estimatedOpen.lowEstimate)}–${money(estimatedOpen.highEstimate)}</p>
      <p class="estimate-meta">${pct(estimatedOpen.estimatedChangePercent)} · ${dirLabel}</p>
      <p class="estimate-disclaimer"></p>
    `;
    container.querySelector(".estimate-disclaimer").textContent =
      estimatedOpen.method || "";
  }

  function renderPositions(positions, summary) {
    if (!positions || positions.length === 0) {
      positionsSectionEl.hidden = true;
      return;
    }
    positionsSectionEl.hidden = false;

    if (summary) {
      portfolioSummaryEl.hidden = false;
      portfolioSummaryEl.innerHTML = `
        <p class="section-label">Portfolio</p>
        <div class="summary-grid">
          <div>
            <p class="summary-kicker">Value</p>
            <p class="summary-value">${money(summary.portfolioValue)}</p>
          </div>
          <div>
            <p class="summary-kicker">Unrealized P/L</p>
            <p class="summary-value ${summary.totalUnrealizedPlValue >= 0 ? "is-up" : "is-down"}">
              ${money(summary.totalUnrealizedPlValue)}
              <span class="summary-sub">${pct(summary.totalUnrealizedPlPercent)}</span>
            </p>
          </div>
          <div>
            <p class="summary-kicker">Positions</p>
            <p class="summary-value">${summary.positions}</p>
          </div>
          <div>
            <p class="summary-kicker">Strongest</p>
            <p class="summary-value">${summary.strongestPosition || "—"}</p>
          </div>
          <div>
            <p class="summary-kicker">Weakest</p>
            <p class="summary-value">${summary.weakestPosition || "—"}</p>
          </div>
        </div>
      `;
    } else {
      portfolioSummaryEl.hidden = true;
      portfolioSummaryEl.innerHTML = "";
    }

    positionCardsEl.innerHTML = "";
    for (const item of positions) {
      const card = document.createElement("article");
      card.className = "position-card";
      card.dataset.move = item.recommendedMove;

      const catalystText = item.catalyst?.headline
        ? item.catalyst.headline
        : "No confirmed catalyst";

      card.innerHTML = `
        <div class="position-card-top">
          <p class="position-ticker"></p>
          <p class="position-move"></p>
        </div>
        <p class="position-meta"></p>
        <p class="position-price"></p>
        <div class="position-metrics">
          <span></span>
          <span></span>
        </div>
        <p class="position-catalyst"></p>
        <p class="position-reason"></p>
        <details class="estimate">
          <summary>Estimated next open</summary>
          <div class="estimate-body"></div>
        </details>
      `;

      card.querySelector(".position-ticker").textContent = item.ticker;
      card.querySelector(".position-move").textContent = moveLabel(
        item.recommendedMove,
      );
      card.querySelector(".position-meta").textContent =
        `${item.shares} shares · Avg ${money(item.avgCost)}`;
      card.querySelector(".position-price").textContent =
        `${money(item.currentPrice)} · ${pct(item.unrealizedPlPercent)}`;
      const metrics = card.querySelectorAll(".position-metrics span");
      metrics[0].textContent = `Signal: ${item.signalScore}`;
      metrics[1].textContent = `Setup: ${item.setupQuality}`;
      card.querySelector(".position-catalyst").textContent = catalystText;
      card.querySelector(".position-reason").textContent = item.reason;
      renderEstimatedOpen(
        card.querySelector(".estimate-body"),
        item.estimatedOpen,
      );

      positionCardsEl.appendChild(card);
    }
  }

  function renderBuyCandidates(candidates, note) {
    buyNoteEl.hidden = !note;
    buyNoteEl.textContent = note || "";

    buyCardsEl.innerHTML = "";
    if (!candidates || candidates.length === 0) {
      buyCardsEl.innerHTML =
        '<p class="buy-empty">No qualifying buy candidates right now.</p>';
      return;
    }

    for (const item of candidates) {
      const card = document.createElement("article");
      card.className = "buy-card";
      card.dataset.rec = item.recommendation;

      const catalystText = item.catalyst?.headline
        ? item.catalyst.headline
        : "No confirmed catalyst";
      const priceText = item.priceUnavailable
        ? "Price unavailable"
        : money(item.currentPrice);

      card.innerHTML = `
        <div class="position-card-top">
          <p class="position-ticker"></p>
          <p class="position-move"></p>
        </div>
        <p class="position-price"></p>
        <div class="position-metrics">
          <span></span>
          <span></span>
        </div>
        <p class="position-catalyst"></p>
        <p class="position-reason"></p>
      `;
      card.querySelector(".position-ticker").textContent = item.ticker;
      card.querySelector(".position-move").textContent = item.recommendation;
      card.querySelector(".position-price").textContent = priceText;
      const metrics = card.querySelectorAll(".position-metrics span");
      metrics[0].textContent = `Signal: ${item.signalScore}`;
      metrics[1].textContent = `Setup: ${item.setupQuality}`;
      card.querySelector(".position-catalyst").textContent = catalystText;
      card.querySelector(".position-reason").textContent = item.reason;

      buyCardsEl.appendChild(card);
    }
  }

  function renderDashboard(data) {
    haveGoodData = true;
    lastGeneratedAt = data.generatedAt;
    tickUpdatedAgo();
    renderMarketPill(data.marketStatus);
    setActiveProfile(data.profile);

    if (!data.portfolioEverUploaded) {
      emptyStateEl.hidden = false;
      positionsSectionEl.hidden = true;
    } else {
      emptyStateEl.hidden = true;
      renderPositions(data.positions, data.summary);
    }

    renderTodaysMove(data.todaysMove);
    renderBuyCandidates(data.buyCandidates, data.buyCandidatesNote);

    generatedEl.textContent = `Analysis generated ${formatDate(data.generatedAt)}`;

    if (data.staleness && data.staleness.isStale) {
      stalenessEl.hidden = false;
      stalenessEl.textContent = `Showing the last successful analysis — the most recent refresh failed (${data.staleness.lastAttemptError || "unknown error"}).`;
    } else {
      stalenessEl.hidden = true;
      stalenessEl.textContent = "";
    }
  }

  async function loadDashboard(options) {
    const silent = options && options.silent;
    const currentRequest = ++requestId;
    if (!silent) {
      setStatus("loading", "Loading your dashboard…");
    }

    try {
      const response = await fetch("/dashboard");
      if (!response.ok) {
        if (response.status === 503) {
          throw new Error("Dashboard is still preparing its first analysis.");
        }
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
      const message =
        error instanceof Error ? error.message : "Could not load the dashboard.";
      if (haveGoodData) {
        renderOffline();
        setStatus("error", `Offline — showing last known data. ${message}`);
      } else {
        setStatus("error", message);
      }
    }
  }

  async function switchProfile(profile) {
    if (profile === activeProfile) {
      return;
    }
    setActiveProfile(profile);
    setStatus("loading", "Switching horizon…");
    try {
      const response = await fetch("/dashboard/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const data = await response.json();
      setStatus("", "");
      renderDashboard(data);
    } catch (error) {
      setActiveProfile(activeProfile);
      setStatus(
        "error",
        error instanceof Error ? error.message : "Could not switch horizon.",
      );
    }
  }

  for (const button of profileButtons) {
    button.addEventListener("click", () => switchProfile(button.dataset.profile));
  }

  function startPolling() {
    if (pollTimer) {
      return;
    }
    pollTimer = setInterval(() => loadDashboard({ silent: true }), POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPolling();
    } else {
      loadDashboard({ silent: true });
      startPolling();
    }
  });

  setInterval(tickUpdatedAgo, 1000);

  loadDashboard();
  startPolling();
})();
