// Search Page Logic

const API_BASE = window.API_BASE_URL || "http://localhost:8000";
const IMG_BASE = "https://image.tmdb.org/t/p/original";
const FALLBACK_IMG = "assests/LuminaLogo.png";
const MIN_SIMILAR_TILES = 14;

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return (params.get(name) || "").trim();
}

function normalizeMovie(item) {
    const tmdbId = item?.tmdb_id || item?.id || item?.movie_id || null;
    return {
        ...item,
        id: tmdbId,
        tmdb_id: tmdbId,
        title: item?.title || item?.name || "Untitled",
        overview: item?.overview || "",
        poster_url: item?.poster_url || item?.image || item?.poster_path || "",
        rating: item?.rating ?? item?.vote_average ?? 0,
        vote_count: item?.vote_count ?? 0,
        release_date: item?.release_date || "",
        content_type: "movie",
        media_type: "movie"
    };
}

function getPosterUrl(item) {
    const raw = item?.poster_url || item?.image || item?.poster_path || "";
    if (!raw) return FALLBACK_IMG;
    return raw.startsWith("http") ? raw : `${IMG_BASE}${raw}`;
}

function getYear(item) {
    const value = String(item?.release_date || "");
    return value.includes("-") ? value.split("-")[0] : (value || "-");
}

function setSearchQueryInputValue(value) {
    const input = document.getElementById("searchQueryInput");
    if (input) input.value = value || "";
}

function saveSelectedContent(item) {
    const id = normalizeId(item?.tmdb_id) || normalizeId(item?.id) || normalizeId(item?.movie_id);
    const payload = {
        ...item,
        tmdb_id: id,
        id: id,
        media_type: "movie",
        content_type: "movie",
        poster_url: item?.poster_url || item?.image || item?.poster_path || ""
    };
    sessionStorage.setItem("selectedContent", JSON.stringify(payload));
}

function openDetailPage(item) {
    saveSelectedContent(item);
    window.location.href = "detail.html";
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function createMovieCard(item, allowOpen = true) {
    const card = document.createElement("article");
    card.className = "search-card";

    const posterUrl = getPosterUrl(item);
    const title = item?.title || "Untitled";
    const rating = Number(item?.rating || 0);
    const year = getYear(item);

    card.innerHTML = `
        <div class="search-card-poster-wrap">
            <img class="search-card-poster" src="${posterUrl}" alt="${escapeHtml(title)} poster">
        </div>
        <div class="search-card-body">
            <h3 class="search-card-title">${escapeHtml(title)}</h3>
            <div class="search-card-meta">
                <span>${escapeHtml(year)}</span>
                <span class="search-card-rating">${rating ? `${rating.toFixed(1)}/10` : "-"}</span>
            </div>
        </div>
    `;

    const img = card.querySelector("img");
    if (img) {
        img.onerror = () => {
            img.onerror = null;
            img.src = FALLBACK_IMG;
        };
    }

    if (allowOpen) {
        card.addEventListener("click", () => openDetailPage(item));
    }

    return card;
}

function renderSpotlight(movie, searchedText) {
    const container = document.getElementById("searchedMovieSpotlight");
    if (!container) return;

    if (!movie) {
        container.innerHTML = `<div class="search-empty-card">No movie found for "${escapeHtml(searchedText)}".</div>`;
        return;
    }

    const posterUrl = getPosterUrl(movie);
    const title = movie.title || searchedText || "Search Result";
    const year = getYear(movie);
    const rating = Number(movie.rating || 0);

    container.innerHTML = `
        <article class="search-spotlight-card">
            <img class="search-spotlight-poster" src="${posterUrl}" alt="${escapeHtml(title)} poster">
            <div class="search-spotlight-body">
                <div class="search-spotlight-meta">
                    <span class="search-pill">Top match</span>
                    <span>${escapeHtml(year)}</span>
                    <span>${rating ? `${rating.toFixed(1)}/10` : "-"}</span>
                </div>

                <h1 class="search-spotlight-title">${escapeHtml(title)}</h1>

                <p class="search-spotlight-overview">
                    ${escapeHtml(movie.overview || "No overview available for this title yet.")}
                </p>

                <div class="search-spotlight-actions">
                    <button id="openSpotlightBtn" class="search-action-btn primary" type="button">View details</button>
                    <button id="researchBtn" class="search-action-btn secondary" type="button">Search again</button>
                </div>
            </div>
        </article>
    `;

    const poster = container.querySelector(".search-spotlight-poster");
    if (poster) {
        poster.onerror = () => {
            poster.onerror = null;
            poster.src = FALLBACK_IMG;
        };
    }

    const openBtn = document.getElementById("openSpotlightBtn");
    if (openBtn) {
        openBtn.addEventListener("click", () => openDetailPage(movie));
    }

    const researchBtn = document.getElementById("researchBtn");
    if (researchBtn) {
        researchBtn.addEventListener("click", () => {
            const input = document.getElementById("searchQueryInput");
            if (input) input.focus();
        });
    }
}

function setSimilarTitle(text) {
    const titleEl = document.getElementById("similarSectionTitle");
    if (!titleEl) return;
    titleEl.textContent = `Movies similar to ${text || "your search"}`;
}

function renderGrid(items) {
    const grid = document.getElementById("similarMoviesGrid");
    if (!grid) return;

    grid.innerHTML = "";

    if (!items.length) {
        grid.innerHTML = `<div class="search-empty-card">No similar movies found.</div>`;
        return;
    }

    items.forEach((item) => {
        if (item.__placeholder__) {
            const placeholder = document.createElement("div");
            placeholder.className = "search-placeholder-card";
            placeholder.textContent = "More titles coming soon";
            grid.appendChild(placeholder);
            return;
        }

        grid.appendChild(createMovieCard(item, true));
    });
}

function padToFourteen(items) {
    const finalItems = [...items];
    while (finalItems.length < MIN_SIMILAR_TILES) {
        finalItems.push({ __placeholder__: true, id: `placeholder-${finalItems.length}` });
    }
    return finalItems.slice(0, MIN_SIMILAR_TILES);
}

function uniqueByTmdbId(items) {
    const seen = new Set();
    const output = [];

    for (const raw of items) {
        const item = normalizeMovie(raw);
        const key = String(item.tmdb_id || "");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        output.push(item);
    }

    return output;
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
}

async function fetchSearchResults(query) {
    const payload = await fetchJson(`${API_BASE}/discovery/movies/search?q=${encodeURIComponent(query)}`);
    return Array.isArray(payload) ? payload.map(normalizeMovie) : [];
}

async function fetchSimilarMovies(movieId) {
    const payload = await fetchJson(`${API_BASE}/discovery/movies/similar/${encodeURIComponent(movieId)}`);
    return Array.isArray(payload) ? payload.map(normalizeMovie) : [];
}

async function fetchTrendingMovies() {
    const payload = await fetchJson(`${API_BASE}/discovery/movies/trending`);
    return Array.isArray(payload) ? payload.map(normalizeMovie) : [];
}

async function buildSimilarGrid(topMovie, searchResults) {
    let similar = [];

    if (topMovie?.tmdb_id) {
        try {
            similar = await fetchSimilarMovies(topMovie.tmdb_id);
        } catch (_error) {
            similar = [];
        }
    }

    let merged = uniqueByTmdbId([
        ...similar,
        ...searchResults.filter((item) => String(item.tmdb_id) !== String(topMovie?.tmdb_id || ""))
    ]);

    if (merged.length < MIN_SIMILAR_TILES) {
        try {
            const trending = await fetchTrendingMovies();
            merged = uniqueByTmdbId([
                ...merged,
                ...trending.filter((item) => String(item.tmdb_id) !== String(topMovie?.tmdb_id || ""))
            ]);
        } catch (_error) {
            // no-op
        }
    }

    return padToFourteen(merged);
}

function readSelectedSearchContent() {
    try {
        const raw = sessionStorage.getItem("selectedSearchContent");
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function normalizeSelectedItem(item) {
    if (!item) return null;

    const mediaType = ["tv", "series"].includes(String(item?.media_type || item?.content_type || "").toLowerCase())
        ? "tv"
        : "movie";

    const id = normalizeId(item?.tmdb_id) || normalizeId(item?.id) || normalizeId(item?.movie_id) || normalizeId(item?.tv_id);

    return {
        ...item,
        id,
        tmdb_id: id,
        title: item?.title || item?.name || "Untitled",
        poster_url: item?.poster_url || item?.image || item?.poster_path || "",
        media_type: mediaType,
        content_type: mediaType === "tv" ? "series" : "movie",
        rating: item?.rating ?? item?.vote_average ?? 0,
        release_date: item?.release_date || item?.first_air_date || ""
    };
}

async function fetchSimilarForSelected(item) {
    if (!item?.tmdb_id) return [];

    const endpoint = item.media_type === "tv"
        ? `${API_BASE}/discovery/series/similar/${encodeURIComponent(item.tmdb_id)}`
        : `${API_BASE}/discovery/movies/similar/${encodeURIComponent(item.tmdb_id)}`;

    const payload = await fetchJson(endpoint);
    return Array.isArray(payload)
        ? payload.map((raw) => ({
            ...normalizeMovie(raw),
            media_type: item.media_type,
            content_type: item.media_type === "tv" ? "series" : "movie"
        }))
        : [];
}

function bindSearchPageForm() {
    const form = document.getElementById("searchPageSearchForm");
    const input = document.getElementById("searchQueryInput");

    if (!form || !input) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const query = input.value.trim();
        if (!query) return;

        sessionStorage.removeItem("selectedSearchContent");
        sessionStorage.setItem("lastSearchQuery", query);
        window.location.href = `search.html?q=${encodeURIComponent(query)}`;
    });

    if (typeof window.initSearchAutocomplete === "function") {
        window.initSearchAutocomplete({
            inputId: "searchQueryInput",
            formId: "searchPageSearchForm",
            dropdownId: "searchPageSuggestions",
            onSelect: (item) => {
                sessionStorage.setItem("selectedSearchContent", JSON.stringify(normalizeSelectedItem(item)));
                sessionStorage.setItem("lastSearchQuery", item.title || "");
                window.location.href = `search.html?q=${encodeURIComponent(item.title || "")}`;
            }
        });
    }
}

async function runSearch(query) {
    const cleanedQuery = String(query || "").trim();
    setSearchQueryInputValue(cleanedQuery);

    const selected = normalizeSelectedItem(readSelectedSearchContent());
    const selectedMatchesQuery =
        selected &&
        cleanedQuery &&
        String(selected.title || "").toLowerCase() === cleanedQuery.toLowerCase();

    const spotlightRoot = document.getElementById("searchedMovieSpotlight");
    const grid = document.getElementById("similarMoviesGrid");

    if (spotlightRoot) spotlightRoot.innerHTML = `<div class="search-loading-card">Searching...</div>`;
    if (grid) grid.innerHTML = `<div class="search-loading-card">Loading similar titles...</div>`;

    try {
        let topItem = null;
        let similarItems = [];

        if (selectedMatchesQuery) {
            topItem = selected;
            similarItems = await fetchSimilarForSelected(topItem);
        } else {
            const searchResults = await fetchSearchResults(cleanedQuery);
            topItem = searchResults[0] || null;
            similarItems = topItem ? await buildSimilarGrid(topItem, searchResults) : [];
        }

        renderSpotlight(topItem, cleanedQuery);
        setSimilarTitle(topItem?.title || cleanedQuery);
        renderGrid(padToFourteen(similarItems));
    } catch (error) {
        console.error("Search page error:", error);
        renderSpotlight(null, cleanedQuery);
        renderGrid(padToFourteen([]));
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    bindSearchPageForm();
    const query = getQueryParam("q") || sessionStorage.getItem("lastSearchQuery") || "";
    await runSearch(query);
});

function normalizeId(value) {
    if (value == null) return null;
    if (typeof value === "number") return String(value);
    if (typeof value === "string") {
        const v = value.trim();
        return /^\d+$/.test(v) ? v : null;
    }
    if (typeof value === "object") {
        return normalizeId(value.tmdb_id) || normalizeId(value.id) || normalizeId(value.movie_id) || normalizeId(value.tv_id);
    }
    return null;
}
