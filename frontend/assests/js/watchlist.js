const FALLBACK_IMG = "assests/LuminaLogo.png";

function toDetailPayload(item) {
  return {
    id: item.external_id,
    external_id: item.external_id,
    tmdb_id: item.external_id,
    title: item.title,
    poster_url: item.poster_url,
    content_type: item.content_type,
    rating: item.rating
  };
}

function cardTemplate(item) {
  const img = item.poster_url && String(item.poster_url).startsWith("http")
    ? item.poster_url
    : (item.poster_url ? `https://image.tmdb.org/t/p/w500${item.poster_url}` : FALLBACK_IMG);

  return `
    <article class="watch-card" data-id="${item.external_id}" data-type="${item.content_type}">
      <img src="${img}" alt="${item.title}" onerror="this.src='${FALLBACK_IMG}'">
      <div class="watch-card-body">
        <p class="watch-card-title">${item.title}</p>
        <div class="watch-card-meta">${item.content_type} ${item.rating ? `• ${item.rating}/10` : ""}</div>
        <div class="watch-card-actions">
          <button class="watch-btn open" data-action="open">Open</button>
          <button class="watch-btn remove" data-action="remove">Remove</button>
        </div>
      </div>
    </article>
  `;
}

async function loadWatchlistPage() {
  const status = document.getElementById("watchlistStatus");
  const grid = document.getElementById("watchlistGrid");
  try {
    const items = await window.getWatchlist();
    if (!items.length) {
      status.textContent = "Your watchlist is empty.";
      grid.innerHTML = "";
      return;
    }
    status.textContent = `${items.length} saved title${items.length > 1 ? "s" : ""}`;
    grid.innerHTML = items.map(cardTemplate).join("");

    grid.querySelectorAll(".watch-card").forEach((card, idx) => {
      const item = items[idx];
      card.addEventListener("click", async (e) => {
        const action = e.target?.dataset?.action;
        if (!action) return;
        if (action === "open") {
          sessionStorage.setItem("selectedContent", JSON.stringify(toDetailPayload(item)));
          window.location.href = "detail.html";
          return;
        }
        if (action === "remove") {
          await window.removeFromWatchlist(item.external_id, item.content_type);
          loadWatchlistPage();
        }
      });
    });
  } catch (err) {
    status.textContent = "Could not load watchlist.";
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", loadWatchlistPage);
