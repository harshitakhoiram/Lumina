const WATCHLIST_API_BASE = window.API_BASE_URL || "http://localhost:8000";

function watchlistToken() {
  return localStorage.getItem("access_token");
}

function watchlistHeaders() {
  const token = watchlistToken();
  return {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  };
}

function normalizeWatchlistPayload(item) {
  return {
    external_id: String(item.tmdb_id || item.external_id || item.id || "").trim(),
    title: item.title || "Untitled",
    poster_url: item.poster_url || item.image || item.poster_path || "",
    content_type: String(item.content_type || "movie").toLowerCase() === "tv" ? "series" : String(item.content_type || "movie").toLowerCase(),
    rating: item.rating ?? item.vote_average ?? null
  };
}

async function addToWatchlist(item) {
  const payload = normalizeWatchlistPayload(item);
  if (!payload.external_id) {
    throw new Error("Missing content id");
  }
  const res = await fetch(WATCHLIST_API_BASE + "/watchlist", {
    method: "POST",
    headers: watchlistHeaders(),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Failed to add to watchlist");
  }
  return res.json();
}

async function getWatchlist() {
  const res = await fetch(WATCHLIST_API_BASE + "/watchlist", {
    method: "GET",
    headers: watchlistHeaders()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Failed to load watchlist");
  }
  return res.json();
}

async function removeFromWatchlist(externalId, contentType) {
  const query = new URLSearchParams({ content_type: String(contentType || "movie").toLowerCase() });
  const res = await fetch(WATCHLIST_API_BASE + "/watchlist/" + encodeURIComponent(externalId) + "?" + query.toString(), {
    method: "DELETE",
    headers: watchlistHeaders()
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Failed to remove from watchlist");
  }
  return res.json();
}

window.addToWatchlist = addToWatchlist;
window.getWatchlist = getWatchlist;
window.removeFromWatchlist = removeFromWatchlist;
