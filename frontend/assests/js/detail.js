const API_BASE = window.API_BASE_URL || "http://localhost:8000";
const IMG_BASE = "https://image.tmdb.org/t/p/original";
const FALLBACK_IMG = "assests/LuminaLogo.png";

/* ----------------------------- Normalizers ----------------------------- */
function extractId(value) {
    if (value == null) return null;
    if (typeof value === "number") return String(value);

    if (typeof value === "string") {
        const v = value.trim();
        if (!v || v === "[object Object]") return null;
        return /^\d+$/.test(v) ? v : null;
    }

    if (typeof value === "object") {
        return (
            extractId(value.tmdb_id) ||
            extractId(value.id) ||
            extractId(value.movie_id) ||
            extractId(value.tv_id) ||
            extractId(value.external_id) ||
            extractId(value.content_id) ||
            null
        );
    }

    return null;
}

function normalizeType(value) {
    const raw = typeof value === "object" ? (value.media_type || value.content_type || "") : value;
    const t = String(raw || "movie").toLowerCase();

    if (t === "tv") return "series";
    if (t === "series" || t === "movie" || t === "book") return t;

    return "movie";
}

function normalizeItem(item) {
    const type = normalizeType(item?.content_type || item?.media_type);
    const id =
        extractId(item?.tmdb_id) ||
        extractId(item?.external_id) ||
        extractId(item?.id) ||
        extractId(item?.movie_id) ||
        extractId(item?.content_id);

    return {
        ...item,
        id,
        content_type: type
    };
}

/* ------------------------------- Helpers ------------------------------- */
function pickPosterUrl(item) {
    const posterPath = item?.poster_path || item?.image || item?.poster_url || "";
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

function cleanSearchQuery(value) {
    let q = String(value || "").replace(/\s+/g, " ").trim();

    // remove suffixes like "Movie · 2025", "TV • 2024"
    q = q.replace(/\s*[•·|-]\s*(movie|tv|series|show|book)?\s*\d{4}\s*$/i, "");
    q = q.replace(/\s*(movie|tv|series|show|book)\s*$/i, "");

    return q.trim();
}

function goToSearch(query) {
    const q = cleanSearchQuery(query);
    if (!q) return;
    sessionStorage.removeItem("selectedSearchContent");
    sessionStorage.setItem("lastSearchQuery", q);
    window.location.href = `search.html?q=${encodeURIComponent(q)}`;
}

/* ------------------------------ Renderers ------------------------------ */
function renderSimilarVibe(items) {
    const container = document.getElementById("similarVibeContainer");
    if (!container) return;

    container.innerHTML = "";

    if (!Array.isArray(items) || !items.length) {
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

    (cast || []).slice(0, 10).forEach((person, index) => {
        const row = table.insertRow();
        row.className = index % 2 === 0 ? "even" : "odd";

        const profileImg = person?.profile_path
            ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
            : (person?.image || FALLBACK_IMG);

        row.innerHTML = `
            <td style="width:50px">
                <img src="${profileImg}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" alt="${person?.name || "Cast"}">
            </td>
            <td><strong>${person?.name || "Unknown"}</strong></td>
            <td style="color:#666">as</td>
            <td>${person?.character || "Cast Member"}</td>
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

/* ------------------------------- API calls ------------------------------ */
async function fetchContentDetails(item) {
    const normalized = normalizeItem(item);
    const type = normalized.content_type;
    const id = normalized.id;

    if (!id) throw new Error("Missing/invalid content id");

    let detailUrl = `${API_BASE}/discovery/movie/${id}`;
    if (type === "series") detailUrl = `${API_BASE}/discovery/series/${id}`;
    if (type === "book") detailUrl = `${API_BASE}/discovery/book/${id}`;

    const response = await fetch(detailUrl);
    if (!response.ok) throw new Error(`Failed detail fetch: ${response.status}`);

    return response.json();
}

async function fetchSimilar(item) {
    const normalized = normalizeItem(item);
    const type = normalized.content_type;
    const id = normalized.id;
    if (!id) return [];

    let similarUrl = `${API_BASE}/discovery/movies/similar/${id}`;
    if (type === "series") similarUrl = `${API_BASE}/discovery/series/similar/${id}`;
    if (type === "book") similarUrl = `${API_BASE}/discovery/books/similar?book_id=${id}`;

    const res = await fetch(similarUrl);
    if (!res.ok) return [];

    const payload = await res.json();
    return Array.isArray(payload) ? payload : (payload.items || []);
}

/* ----------------------------- Search wiring ---------------------------- */
function initDetailSearch() {
    const form = document.getElementById("detailSearchForm");
    const input = document.getElementById("detailSearchInput");
    const dropdown = document.getElementById("detailSearchDropdown");

    if (!form || !input) return;

    // submit via button / Enter
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        goToSearch(input.value);
    });

    // use existing shared autocomplete
    if (typeof window.initSearchAutocomplete === "function") {
        window.initSearchAutocomplete({
            inputId: "detailSearchInput",
            formId: "detailSearchForm",
            dropdownId: "detailSearchDropdown",
            onSelect: (item) => {
                const title = item?.title || item?.name || input.value;
                goToSearch(title);
            }
        });
    }

    // fallback click handler if autocomplete library doesn't invoke onSelect
    if (dropdown) {
        dropdown.addEventListener("click", (e) => {
            const row = e.target.closest("[data-title], .autocomplete-item, .suggestion-item, li, button, a");
            if (!row) return;

            const title =
                row.getAttribute("data-title") ||
                row.dataset?.title ||
                row.querySelector?.(".title, .suggestion-title, .auto-title")?.textContent ||
                row.textContent ||
                input.value;

            goToSearch(title);
        });
    }
}

/* -------------------------------- Boot --------------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
    initDetailSearch();

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
                setTimeout(() => {
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

        setText("dynTitle", full.title || selected.title || "Untitled");
        setText("dynRating", full.rating || selected.rating || "-");
        setText("dynVoteCount", formatVotes(full.vote_count || selected.vote_count));
        setText("dynOverview", full.overview || "No description available.");
        setText("dynGenres", full.genres?.length ? full.genres.join(", ") : "Genres unavailable");
        setText("dynRuntime", formatRuntime(type, full.runtime || selected.runtime));
        setText("dynReleaseDate", full.release_date || full.published_date || "Release date unavailable");

        const year = (full.release_date || full.published_date || "").split("-")[0];
        if (year) setText("titleYear", `(${year})`, "");

        if (type === "book") {
            setText("dynDirector", (full.authors || []).join(", ") || "Unknown");
            setText("dynStars", full.publisher || "Not available");

            const castTable = document.getElementById("dynCastTable");
            if (castTable?.parentElement) {
                castTable.parentElement.style.display = "none";
            }
        } else {
            setText("dynDirector", full.director || "Unknown");

            if (full.cast?.length) {
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
