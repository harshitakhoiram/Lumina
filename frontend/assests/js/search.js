// Search Page Logic

const API_BASE = window.API_BASE_URL || "http://localhost:8000";
const IMG_BASE = "https://image.tmdb.org/t/p/original";
const FALLBACK_IMG = "assests/LuminaLogo.png";
const MIN_SIMILAR_TILES = 14;

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return (params.get(name) || "").trim();
}

function normalizeSearchItem(item, providedMediaType = null) {
    const mediaType = providedMediaType || (["tv", "series"].includes(String(item?.media_type || item?.content_type || "").toLowerCase()) ? "tv" : "movie");
    const tmdbId = item?.tmdb_id || item?.id || item?.movie_id || item?.tv_id || null;
    
    return {
        ...item,
        id: tmdbId,
        tmdb_id: tmdbId,
        title: item?.title || item?.name || "Untitled",
        overview: item?.overview || "",
        poster_url: item?.poster_url || item?.image || item?.poster_path || "",
        rating: item?.rating ?? item?.vote_average ?? 0,
        vote_count: item?.vote_count ?? 0,
        release_date: item?.release_date || item?.first_air_date || "",
        media_type: mediaType,
        content_type: mediaType === "tv" ? "series" : "movie"
    };
}

function getPosterUrl(item) {
    const raw = item?.poster_url || item?.image || item?.poster_path || "";
    if (!raw) return FALLBACK_IMG;
    return raw.startsWith("http") ? raw : `${IMG_BASE}${raw}`;
}

function getYear(item) {
    const value = String(item?.release_date || item?.first_air_date || "");
    return value.includes("-") ? value.split("-")[0] : (value || "-");
}

function setSearchQueryInputValue(value) {
    const input = document.getElementById("searchQueryInput");
    if (input) input.value = value || "";
}

function saveSelectedContent(item) {
    const payload = normalizeSearchItem(item);
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

function createSearchCard(item, allowOpen = true) {
    const card = document.createElement("article");
    card.className = "search-card";

    const posterUrl = getPosterUrl(item);
    const title = item?.title || "Untitled";
    const rating = Number(item?.rating || 0);
    const year = getYear(item);
    const label = item.media_type === "tv" ? "Series" : "Movie";

    card.innerHTML = `
        <div class="search-card-poster-wrap">
            <img class="search-card-poster" src="${posterUrl}" alt="${escapeHtml(title)} poster">
            <span class="content-type-badge">${label}</span>
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

function renderSpotlight(item, searchedText) {
    const container = document.getElementById("searchedMovieSpotlight");
    if (!container) return;

    if (!item) {
        container.innerHTML = `<div class="search-empty-card">No results found for "${escapeHtml(searchedText)}".</div>`;
        return;
    }

    const posterUrl = getPosterUrl(item);
    const title = item.title || searchedText || "Search Result";
    const year = getYear(item);
    const rating = Number(item.rating || 0);
    const typeLabel = item.media_type === "tv" ? "Series" : "Movie";

    container.innerHTML = `
        <article class="search-spotlight-card">
            <img class="search-spotlight-poster" src="${posterUrl}" alt="${escapeHtml(title)} poster">
            <div class="search-spotlight-body">
                <div class="search-spotlight-meta">
                    <span class="search-pill">Top match</span>
                    <span>${typeLabel}</span>
                    <span>${escapeHtml(year)}</span>
                    <span>${rating ? `${rating.toFixed(1)}/10` : "-"}</span>
                </div>

                <h1 class="search-spotlight-title">${escapeHtml(title)}</h1>

                <p class="search-spotlight-overview">
                    ${escapeHtml(item.overview || "No overview available for this title yet.")}
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
        openBtn.addEventListener("click", () => openDetailPage(item));
    }

    const researchBtn = document.getElementById("researchBtn");
    if (researchBtn) {
        researchBtn.addEventListener("click", () => {
            const input = document.getElementById("searchQueryInput");
            if (input) input.focus();
        });
    }
}

function setSimilarTitle(item, searchText) {
    const titleEl = document.getElementById("similarSectionTitle");
    if (!titleEl) return;
    const type = item?.media_type === "tv" ? "Series" : "Movies";
    titleEl.textContent = `${type} similar to ${item?.title || searchText || "your search"}`;
}

function renderGrid(items) {
    const grid = document.getElementById("similarMoviesGrid");
    if (!grid) return;

    grid.innerHTML = "";

    if (!items.length) {
        grid.innerHTML = `<div class="search-empty-card">No similar results found.</div>`;
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

        grid.appendChild(createSearchCard(item, true));
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
        const item = normalizeSearchItem(raw);
        const key = `${item.media_type}-${item.tmdb_id}`;
        if (!item.tmdb_id || seen.has(key)) continue;
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
    const [movies, series] = await Promise.all([
        fetchJson(`${API_BASE}/discovery/movies/search?q=${encodeURIComponent(query)}`),
        fetchJson(`${API_BASE}/discovery/series/search?q=${encodeURIComponent(query)}`)
    ]);

    const results = [
        ...movies.map(m => normalizeSearchItem(m, "movie")),
        ...series.map(s => normalizeSearchItem(s, "tv"))
    ];

    // Simple relevance check: exact title match first
    results.sort((a, b) => {
        const q = query.toLowerCase();
        const aTitle = a.title.toLowerCase();
        const bTitle = b.title.toLowerCase();
        if (aTitle === q && bTitle !== q) return -1;
        if (bTitle === q && aTitle !== q) return 1;
        return (b.rating || 0) - (a.rating || 0);
    });

    return results;
}

async function fetchSimilarItems(item) {
    if (!item?.tmdb_id) return [];
    
    const endpoint = item.media_type === "tv"
        ? `${API_BASE}/discovery/series/similar/${encodeURIComponent(item.tmdb_id)}`
        : `${API_BASE}/discovery/movies/similar/${encodeURIComponent(item.tmdb_id)}`;

    try {
        const payload = await fetchJson(endpoint);
        return Array.isArray(payload) ? payload.map(r => normalizeSearchItem(r, item.media_type)) : [];
    } catch (_error) {
        return [];
    }
}

async function fetchTrendingFallback(mediaType = "movie") {
    const path = mediaType === "tv" ? "series" : "movies";
    const payload = await fetchJson(`${API_BASE}/discovery/${path}/trending`);
    return Array.isArray(payload) ? payload.map(r => normalizeSearchItem(r, mediaType)) : [];
}

async function buildSimilarGrid(topItem, searchResults) {
    let similar = await fetchSimilarItems(topItem);

    let merged = uniqueByTmdbId([
        ...similar,
        ...searchResults.filter((item) => String(item.tmdb_id) !== String(topItem?.tmdb_id || ""))
    ]);

    if (merged.length < MIN_SIMILAR_TILES) {
        try {
            const trending = await fetchTrendingFallback(topItem?.media_type || "movie");
            merged = uniqueByTmdbId([
                ...merged,
                ...trending.filter((item) => String(item.tmdb_id) !== String(topItem?.tmdb_id || ""))
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
                sessionStorage.setItem("selectedSearchContent", JSON.stringify(normalizeSearchItem(item)));
                sessionStorage.setItem("lastSearchQuery", item.title || "");
                window.location.href = `search.html?q=${encodeURIComponent(item.title || "")}`;
            }
        });
    }
}

async function runSearch(query) {
    const cleanedQuery = String(query || "").trim();
    setSearchQueryInputValue(cleanedQuery);

    const selected = normalizeSearchItem(readSelectedSearchContent());
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
        let results = [];

        if (selectedMatchesQuery) {
            topItem = selected;
            results = [topItem]; // Still might need search results from elsewhere for padding?
        } else {
            results = await fetchSearchResults(cleanedQuery);
            topItem = results[0] || null;
        }

        if (topItem) {
            similarItems = await buildSimilarGrid(topItem, results);
        }

        renderSpotlight(topItem, cleanedQuery);
        setSimilarTitle(topItem, cleanedQuery);
        renderGrid(similarItems);
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
