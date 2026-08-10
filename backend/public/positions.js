(() => {
  const STORAGE_KEY = "market-analyst-positions-v1";

  const csvInput = document.getElementById("csv-input");
  const toggleManualBtn = document.getElementById("toggle-manual");
  const clearBtn = document.getElementById("clear-positions");
  const manualForm = document.getElementById("manual-form");
  const statusEl = document.getElementById("positions-status");
  const summaryEl = document.getElementById("portfolio-summary");
  const actionsSection = document.getElementById("recommended-actions");
  const actionsList = document.getElementById("actions-list");
  const cardsEl = document.getElementById("position-cards");

  let positions = loadPositions();
  let requestId = 0;

  function loadPositions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function savePositions() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    clearBtn.hidden = positions.length === 0;
  }

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
    return Number(value).toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }

  function pct(value) {
    const sign = value > 0 ? "+" : "";
    return `${sign}${Number(value).toFixed(2)}%`;
  }

  function moveLabel(move) {
    if (move === "ADD") {
      return "STRONG BUY / ADD";
    }
    return move;
  }

  function upsertPosition(position) {
    const ticker = position.ticker.toUpperCase();
    const next = {
      ticker,
      shares: Number(position.shares),
      avgCost: Number(position.avgCost),
      currentPrice: Number(position.currentPrice),
    };
    const index = positions.findIndex((item) => item.ticker === ticker);
    if (index >= 0) {
      positions[index] = next;
    } else {
      positions.push(next);
    }
    savePositions();
  }

  function renderSummary(summary) {
    summaryEl.hidden = false;
    summaryEl.innerHTML = `
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
  }

  function renderActions(actions) {
    actionsSection.hidden = false;
    actionsList.innerHTML = "";
    for (const item of actions) {
      const li = document.createElement("li");
      li.textContent = `${moveLabel(item.move)} ${item.ticker}`;
      actionsList.appendChild(li);
    }
  }

  function renderCards(items) {
    cardsEl.innerHTML = "";
    for (const item of items) {
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
      metrics[0].textContent = `Scanner: ${item.signalScore}`;
      metrics[1].textContent = `Setup: ${item.setupQuality}`;
      card.querySelector(".position-catalyst").textContent = catalystText;
      card.querySelector(".position-reason").textContent = item.reason;

      cardsEl.appendChild(card);
    }
  }

  async function analyze() {
    if (positions.length === 0) {
      summaryEl.hidden = true;
      actionsSection.hidden = true;
      cardsEl.innerHTML = "";
      setStatus("", "");
      return;
    }

    const current = ++requestId;
    setStatus("loading", "Running SHORT_TERM analysis on your positions…");

    try {
      const response = await fetch("/portfolio/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.message || `Request failed (${response.status})`);
      }
      const data = await response.json();
      if (current !== requestId) {
        return;
      }
      setStatus("", "");
      renderSummary(data.summary);
      renderActions(data.summary.recommendedActions);
      renderCards(data.positions);
    } catch (error) {
      if (current !== requestId) {
        return;
      }
      setStatus(
        "error",
        error instanceof Error
          ? error.message
          : "Could not analyze positions.",
      );
    }
  }

  csvInput.addEventListener("change", async () => {
    const file = csvInput.files?.[0];
    csvInput.value = "";
    if (!file) {
      return;
    }

    const text = await file.text();
    setStatus("loading", "Parsing CSV…");
    try {
      const response = await fetch("/portfolio/parse-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "CSV parse failed");
      }

      if (data.positions?.length) {
        for (const position of data.positions) {
          upsertPosition(position);
        }
      }

      const errorText =
        data.errors?.length > 0
          ? data.errors.map((error) => error.message).join(" ")
          : "";

      if (positions.length === 0) {
        setStatus("error", errorText || "No valid positions found in CSV.");
        return;
      }

      if (errorText) {
        setStatus("loading", `Loaded with warnings: ${errorText}`);
      }
      await analyze();
    } catch (error) {
      setStatus(
        "error",
        error instanceof Error ? error.message : "CSV upload failed.",
      );
    }
  });

  toggleManualBtn.addEventListener("click", () => {
    manualForm.hidden = !manualForm.hidden;
  });

  clearBtn.addEventListener("click", () => {
    positions = [];
    savePositions();
    summaryEl.hidden = true;
    actionsSection.hidden = true;
    cardsEl.innerHTML = "";
    setStatus("", "");
  });

  manualForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const ticker = document.getElementById("manual-ticker").value.trim();
    const shares = document.getElementById("manual-shares").value.trim();
    const avgCost = document.getElementById("manual-avg").value.trim();
    const currentPrice = document.getElementById("manual-price").value.trim();

    if (!ticker || !shares || !avgCost || !currentPrice) {
      setStatus("error", "Fill ticker, shares, avg cost, and current price.");
      return;
    }

    const sharesN = Number(shares);
    const avgN = Number(avgCost);
    const priceN = Number(currentPrice);
    if (
      !/^[A-Za-z][A-Za-z0-9.\-]{0,9}$/.test(ticker) ||
      !Number.isFinite(sharesN) ||
      sharesN <= 0 ||
      !Number.isFinite(avgN) ||
      avgN <= 0 ||
      !Number.isFinite(priceN) ||
      priceN <= 0
    ) {
      setStatus("error", "Invalid position values.");
      return;
    }

    upsertPosition({
      ticker,
      shares: sharesN,
      avgCost: avgN,
      currentPrice: priceN,
    });
    manualForm.reset();
    manualForm.hidden = true;
    analyze();
  });

  clearBtn.hidden = positions.length === 0;
  if (positions.length > 0) {
    analyze();
  }
})();
