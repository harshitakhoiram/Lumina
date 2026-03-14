const API_BASE = window.API_BASE_URL || "http://localhost:8000";
const IMG_BASE = "https://image.tmdb.org/t/p/original";
const FALLBACK_IMG = "assests/LuminaLogo.png";

function normalizeType(value) {
    const t = String(value || "movie").toLowerCase();
    if (t === "tv") return "series";
    return t;
}

function pickNumericId(...values) {
    for (const value of values) {
        let raw = String(value ?? "").trim();
        if (raw.startsWith("tmdb-")) {
            raw = raw.replace("tmdb-", "");
        }
        if (/^\d+$/.test(raw)) return raw;
    }
    return null;
}

function resolveDetailId(item) {
    return pickNumericId(
        item?.tmdb_id,
        item?.external_id,
        item?.movie_id,
        item?.id,
        item?.content_id
    );
}

async function resolveDetailIdFromTitle(item) {
    const type = normalizeType(item?.content_type);
    if (type !== "movie" && type !== "series") return null;

    const title = String(item?.title || item?.name || "").trim();
    if (!title) return null;

    const endpoint = type === "series" ? "/discovery/series/search" : "/discovery/movies/search";
    const searchUrl = `${API_BASE}${endpoint}?q=${encodeURIComponent(title)}`;

    try {
        const response = await fetch(searchUrl);
        if (!response.ok) return null;
        const results = await response.json();
        if (!Array.isArray(results) || !results.length) return null;

        for (const candidate of results) {
            const candidateId = pickNumericId(
                candidate?.tmdb_id,
                candidate?.external_id,
                candidate?.id,
                candidate?.movie_id
            );
            if (candidateId) return candidateId;
        }
    } catch (_error) {
        return null;
    }

    return null;
}

function normalizeItem(item) {
    const type = normalizeType(item.content_type);
    const detailId = resolveDetailId(item);
    const id = detailId || item.id || item.content_id || null;
    return {
        ...item,
        tmdb_id: detailId || item.tmdb_id || item.external_id || null,
        id,
        content_type: type
    };
}

function pickPosterUrl(item) {
    const posterPath = item.poster_path || item.image || item.poster_url || "";
    if (!posterPath) return FALLBACK_IMG;
    return posterPath.startsWith("http") ? posterPath : `${IMG_BASE}${posterPath}`;
}

function setText(id, value, fallback = "-") {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerText = value ?? fallback;
}

function formatRuntime(type, minutes) {
    const value = Number(minutes || 0);
    if (!value) return type === "series" ? "Episode runtime N/A" : "Runtime N/A";
    return `${value} min`;
}

function formatVotes(votes) {
    const count = Number(votes || 0);
    if (!count) return "0";
    return count.toLocaleString("en-US");
}

function renderSimilarVibe(items) {
    const container = document.getElementById("similarVibeContainer");
    if (!container) return;

    container.innerHTML = "";
    if (!items.length) {
        container.innerHTML = "<p class='no-data'>No similar matches found.</p>";
        return;
    }

    items.slice(0, 6).forEach((raw) => {
        const item = normalizeItem(raw);
        const row = document.createElement("button");
        row.className = "similar-item-mini";
        row.type = "button";
        row.addEventListener("click", () => {
            sessionStorage.setItem("selectedContent", JSON.stringify(item));
            window.location.reload();
        });

        const imageUrl = pickPosterUrl(item);
        const year = (item.release_date || "").split("-")[0] || "-";
        row.innerHTML = `
            <img src="${imageUrl}" alt="${item.title || "Similar title"}" class="mini-poster">
            <div class="mini-info">
                <div class="mini-title">${item.title || "Untitled"}</div>
                <div class="mini-meta">${year} | ${item.rating || "-"}/10</div>
            </div>
        `;

        const img = row.querySelector("img");
        if (img) {
            img.onerror = () => {
                img.onerror = null;
                img.src = FALLBACK_IMG;
            };
        }

        container.appendChild(row);
    });
}

function renderCastTable(cast) {
    const table = document.getElementById("dynCastTable");
    if (!table) return;

    table.innerHTML = "";

    cast.slice(0, 10).forEach((person, index) => {
        const row = table.insertRow();
        row.className = index % 2 === 0 ? "even" : "odd";

        const profileImg = person.profile_path
            ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
            : (person.image || FALLBACK_IMG);

        row.innerHTML = `
            <td style="width:50px">
                <img src="${profileImg}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;" alt="${person.name || "Cast"}">
            </td>
            <td><strong>${person.name || person}</strong></td>
            <td style="color:#666">as</td>
            <td>${person.character || "Cast Member"}</td>
        `;

        const img = row.querySelector("img");
        if (img) {
            img.onerror = () => {
                img.onerror = null;
                img.src = FALLBACK_IMG;
            };
        }
    });
}

async function fetchContentDetails(item) {
    const originalType = normalizeType(item.content_type);
    let id = originalType === "book" ? (item.id || item.content_id) : resolveDetailId(item);

    if ((originalType === "movie" || originalType === "series") && !id) {
        id = await resolveDetailIdFromTitle(item);
    }

    if (!id) {
        throw new Error("Missing content id");
    }

    const tryFetch = async (type, detailId) => {
        let url = `${API_BASE}/discovery/movie/${detailId}`;
        if (type === "series") url = `${API_BASE}/discovery/series/${detailId}`;
        if (type === "book") url = `${API_BASE}/discovery/book/${detailId}`;
        
        const response = await fetch(url);
        if (response.ok) return await response.json();
        return null;
    };

    // 1. Try original type
    let data = await tryFetch(originalType, id);
    if (data) return data;

    // 2. If 404 and it's Movie/Series, try the other one
    if (originalType === "movie" || originalType === "series") {
        const otherType = originalType === "movie" ? "series" : "movie";
        console.log(`original type ${originalType} failed, trying ${otherType}...`);
        data = await tryFetch(otherType, id);
        if (data) {
            // Update item type in memory so following calls (like similar) use it
            item.content_type = otherType;
            return data;
        }
    }

    // 3. Last stand: search by title again if we're still empty
    const fallbackId = await resolveDetailIdFromTitle(item);
    if (fallbackId && String(fallbackId) !== String(id)) {
        data = await tryFetch(originalType, fallbackId);
        if (data) return data;
        
        const otherType = originalType === "movie" ? "series" : "movie";
        data = await tryFetch(otherType, fallbackId);
        if (data) {
            item.content_type = otherType;
            return data;
        }
    }

    throw new Error(`Failed to fetch details for ${item.title || id}`);
}

async function fetchSimilar(item) {
    const type = normalizeType(item.content_type);
    let id = type === "book" ? (item.id || item.content_id) : resolveDetailId(item);
    if (!id && (type === "movie" || type === "series")) {
        id = await resolveDetailIdFromTitle(item);
    }
    if (!id) return [];

    let similarUrl = `${API_BASE}/discovery/movies/similar/${id}`;
    if (type === "series") similarUrl = `${API_BASE}/discovery/series/similar/${id}`;
    if (type === "book") similarUrl = `${API_BASE}/discovery/books/similar?book_id=${id}`;

    const res = await fetch(similarUrl);
    if (!res.ok) return [];

    const payload = await res.json();
    return Array.isArray(payload) ? payload : (payload.items || []);
}

// Search Autocomplete Logic
function buildSearchSelection(item) {
    const mediaType = String(item?.media_type || item?.content_type || "").toLowerCase() === "tv" ||
        String(item?.content_type || "").toLowerCase() === "series"
        ? "tv"
        : "movie";

    return {
        ...item,
        id: item?.tmdb_id || item?.id || null,
        tmdb_id: item?.tmdb_id || item?.id || null,
        title: item?.title || item?.name || "Untitled",
        poster_url: item?.poster_url || item?.image || item?.poster_path || "",
        media_type: mediaType,
        content_type: mediaType === "tv" ? "series" : "movie",
        release_date: item?.release_date || item?.first_air_date || ""
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize Global Navigation Search
    const searchForm = document.getElementById("dashboardSearchForm");
    const searchInput = document.getElementById("navbar-query");

    if (searchForm && searchInput) {
        searchForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (query) {
                sessionStorage.removeItem("selectedSearchContent");
                sessionStorage.setItem("lastSearchQuery", query);
                window.location.href = `search.html?q=${encodeURIComponent(query)}`;
            }
        });

        if (typeof window.initSearchAutocomplete === "function") {
            window.initSearchAutocomplete({
                inputId: "navbar-query",
                formId: "dashboardSearchForm",
                dropdownId: "dashboardSearchSuggestions",
                onSelect: (item) => {
                    const selected = buildSearchSelection(item);
                    sessionStorage.setItem("selectedSearchContent", JSON.stringify(selected));
                    sessionStorage.setItem("lastSearchQuery", selected.title);
                    window.location.href = `search.html?q=${encodeURIComponent(selected.title)}`;
                }
            });
        }
    }

    const rawData = sessionStorage.getItem("selectedContent");
    if (!rawData) {
        setText("dynTitle", "No content selected");
        return;
    }

    let selected;
    try {
        selected = normalizeItem(JSON.parse(rawData));
    } catch (_error) {
        setText("dynTitle", "Invalid content data");
        return;
    }

    const type = selected.content_type;
    const posterUrl = pickPosterUrl(selected);

    const watchlistBtn = document.getElementById("addToWatchlistBtn");
    if (watchlistBtn) {
        watchlistBtn.addEventListener("click", async () => {
            if (!window.addToWatchlist) return;
            watchlistBtn.disabled = true;
            const previous = watchlistBtn.innerText;
            watchlistBtn.innerText = "Saving...";
            try {
                await window.addToWatchlist(normalizeItem(selected));
                watchlistBtn.innerText = "Added";
            } catch (_error) {
                watchlistBtn.innerText = "Retry Add";
            } finally {
                window.setTimeout(() => {
                    watchlistBtn.disabled = false;
                    watchlistBtn.innerText = previous;
                }, 1200);
            }
        });
    }

    setText("dynTitle", selected.title || "Loading title...");
    setText("dynRating", selected.rating || selected.vote_average || "-");
    setText("dynOverview", selected.overview || selected.description || "Loading description...");
    setText("dynRuntime", formatRuntime(type, selected.runtime));
    setText("dynVoteCount", formatVotes(selected.vote_count));
    setText("dynRatingType", type === "series" ? "TV" : (type === "book" ? "BOOK" : "M"));

    const posterEl = document.getElementById("dynPoster");
    const sidebarImageEl = document.getElementById("sidebarImage");
    if (posterEl) {
        posterEl.src = posterUrl;
        posterEl.onerror = () => {
            posterEl.onerror = null;
            posterEl.src = FALLBACK_IMG;
        };
    }
    if (sidebarImageEl) {
        sidebarImageEl.src = posterUrl;
        sidebarImageEl.onerror = () => {
            sidebarImageEl.onerror = null;
            sidebarImageEl.src = FALLBACK_IMG;
        };
    }

    try {
        const full = await fetchContentDetails(selected);

        const resolvedId = pickNumericId(
            full?._resolved_id,
            full?.id,
            full?.tmdb_id,
            selected?.tmdb_id,
            selected?.id
        );
        if (resolvedId) {
            selected.id = resolvedId;
            selected.tmdb_id = resolvedId;
        }

        setText("dynTitle", full.title || selected.title || "Untitled");
        setText("dynRating", full.rating || selected.rating || "-");
        setText("dynVoteCount", formatVotes(full.vote_count || selected.vote_count));
        setText("dynOverview", full.overview || "No description available.");
        setText("dynGenres", full.genres && full.genres.length ? full.genres.join(", ") : "Genres unavailable");
        setText("dynRuntime", formatRuntime(type, full.runtime || selected.runtime));
        setText("dynReleaseDate", full.release_date || full.published_date || "Release date unavailable");

        const year = (full.release_date || full.published_date || "").split("-")[0];
        if (year) setText("titleYear", `(${year})`, "");

        if (type === "book") {
            setText("dynDirector", (full.authors || []).join(", ") || "Unknown");
            setText("dynStars", full.publisher || "Not available");
            const castTable = document.getElementById("dynCastTable");
            if (castTable && castTable.parentElement) {
                castTable.parentElement.style.display = "none";
            }
        } else {
            setText("dynDirector", full.director || "Unknown");
            if (full.cast && full.cast.length) {
                const stars = full.cast.slice(0, 4).map((c) => c.name || c).join(", ");
                setText("dynStars", stars);
                renderCastTable(full.cast);
            } else {
                setText("dynStars", "Cast not available");
            }
        }
    } catch (error) {
        console.error("Detail fetch error:", error);
    }

    try {
        const similarItems = await fetchSimilar(selected);
        renderSimilarVibe(similarItems);
    } catch (error) {
        console.error("Similar fetch error:", error);
        renderSimilarVibe([]);
    }
});
