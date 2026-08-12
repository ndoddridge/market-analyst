(() => {
  const csvInput = document.getElementById("csv-input");
  const toggleManualBtn = document.getElementById("toggle-manual");
  const clearBtn = document.getElementById("clear-positions");
  const manualForm = document.getElementById("manual-form");
  const statusEl = document.getElementById("positions-status");
  const uploadMetaEl = document.getElementById("upload-meta");
  const listEl = document.getElementById("position-list");

  let requestId = 0;

  function formatApiError(payload, fallback) {
    if (!payload) {
      return fallback;
    }
    if (typeof payload.message === "string") {
      return payload.message;
    }
    if (Array.isArray(payload.message)) {
      return payload.message.join(" ");
    }
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      return payload.errors.map((error) => error.message).join(" ");
    }
    return fallback;
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

  function renderUploadMeta(portfolio) {
    if (!portfolio || !portfolio.uploadedAt) {
      uploadMetaEl.hidden = true;
      uploadMetaEl.textContent = "";
      return;
    }
    uploadMetaEl.hidden = false;
    const when = new Date(portfolio.uploadedAt);
    const whenText = Number.isNaN(when.getTime()) ? "" : when.toLocaleString();
    uploadMetaEl.textContent = portfolio.sourceFilename
      ? `Loaded from ${portfolio.sourceFilename} · ${whenText}`
      : `Last updated ${whenText}`;
  }

  function renderList(positions) {
    clearBtn.hidden = positions.length === 0;
    listEl.innerHTML = "";
    if (positions.length === 0) {
      listEl.innerHTML =
        '<p class="empty-hint">No positions yet. Upload a CSV or add one manually above.</p>';
      return;
    }
    for (const item of positions) {
      const card = document.createElement("article");
      card.className = "position-card";
      card.innerHTML = `
        <div class="position-card-top">
          <p class="position-ticker"></p>
          <button type="button" class="ghost-btn remove-btn">Remove</button>
        </div>
        <p class="position-meta"></p>
        <p class="position-price"></p>
      `;
      card.querySelector(".position-ticker").textContent = item.ticker;
      card.querySelector(".position-meta").textContent =
        `${item.shares} shares · Avg ${money(item.avgCost)}`;
      card.querySelector(".position-price").textContent =
        `Last known price: ${money(item.currentPrice)}`;
      card
        .querySelector(".remove-btn")
        .addEventListener("click", () => removePosition(item.ticker));
      listEl.appendChild(card);
    }
  }

  async function loadPortfolio() {
    const current = ++requestId;
    try {
      const response = await fetch("/portfolio");
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const data = await response.json();
      if (current !== requestId) {
        return;
      }
      renderUploadMeta(data);
      renderList(data.positions || []);
    } catch (error) {
      if (current !== requestId) {
        return;
      }
      setStatus(
        "error",
        error instanceof Error ? error.message : "Could not load your portfolio.",
      );
    }
  }

  async function removePosition(ticker) {
    setStatus("loading", `Removing ${ticker}…`);
    try {
      const response = await fetch(
        `/portfolio/positions/${encodeURIComponent(ticker)}`,
        { method: "DELETE" },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(formatApiError(data, `Request failed (${response.status})`));
      }
      setStatus("", "");
      renderUploadMeta(data);
      renderList(data.positions || []);
    } catch (error) {
      setStatus(
        "error",
        error instanceof Error ? error.message : "Could not remove position.",
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
    setStatus("loading", "Uploading and replacing portfolio…");
    try {
      const response = await fetch("/portfolio/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, filename: file.name }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(formatApiError(data, "CSV import failed"));
      }

      renderUploadMeta({ uploadedAt: data.uploadedAt, sourceFilename: file.name });
      renderList(data.positions || []);

      const errorText =
        data.errors?.length > 0
          ? data.errors.map((error) => error.message).join(" ")
          : "";
      setStatus(
        errorText ? "loading" : "",
        errorText
          ? `Portfolio replaced: ${data.positions.length} position(s) loaded with warnings: ${errorText}`
          : `Portfolio replaced: ${data.positions.length} position(s) loaded. See the Dashboard for recommendations.`,
      );
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

  clearBtn.addEventListener("click", async () => {
    setStatus("loading", "Clearing portfolio…");
    try {
      const response = await fetch("/portfolio", { method: "DELETE" });
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }
      const data = await response.json();
      setStatus("", "");
      renderUploadMeta(data);
      renderList(data.positions || []);
    } catch (error) {
      setStatus(
        "error",
        error instanceof Error ? error.message : "Could not clear portfolio.",
      );
    }
  });

  manualForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const ticker = document.getElementById("manual-ticker").value.trim();
    const shares = document.getElementById("manual-shares").value.trim();
    const avgCost = document.getElementById("manual-avg").value.trim();
    const currentPrice = document.getElementById("manual-price").value.trim();

    if (!ticker || !shares || !avgCost || !currentPrice) {
      setStatus("error", "Fill ticker, shares, avg cost, and current price.");
      return;
    }

    setStatus("loading", "Saving position…");
    try {
      const response = await fetch("/portfolio/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          shares: Number(shares),
          avgCost: Number(avgCost),
          currentPrice: Number(currentPrice),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(formatApiError(data, "Invalid position values."));
      }
      setStatus("", "");
      renderUploadMeta(data);
      renderList(data.positions || []);
      manualForm.reset();
      manualForm.hidden = true;
    } catch (error) {
      setStatus(
        "error",
        error instanceof Error ? error.message : "Could not save position.",
      );
    }
  });

  loadPortfolio();
})();
