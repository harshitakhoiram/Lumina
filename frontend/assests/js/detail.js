const API_BASE = window.API_BASE_URL || "http://localhost:8000";
const IMG_BASE = "https://image.tmdb.org/t/p/original";
const FALLBACK_IMG = "assests/LuminaLogo.png";

function normalizeType(value) {
    const t = String(value || "movie").toLowerCase();
    if (t === "tv") return "series";
    return t;
}

function normalizeItem(item) {
    const type = normalizeType(item.content_type);
    const id = item.tmdb_id || item.external_id || item.id || item.movie_id || item.content_id || null;
    return {
        ...item,
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
    const type = normalizeType(item.content_type);
    const id = item.id;

    if (!id) {
        throw new Error("Missing content id");
    }

    let detailUrl = `${API_BASE}/discovery/movie/${id}`;
    if (type === "series") detailUrl = `${API_BASE}/discovery/series/${id}`;
    if (type === "book") detailUrl = `${API_BASE}/discovery/book/${id}`;

    const response = await fetch(detailUrl);
    if (!response.ok) {
        throw new Error(`Failed detail fetch: ${response.status}`);
    }

    return response.json();
}

async function fetchSimilar(item) {
    const type = normalizeType(item.content_type);
    const id = item.id;
    if (!id) return [];

    let similarUrl = `${API_BASE}/discovery/movies/similar/${id}`;
    if (type === "series") similarUrl = `${API_BASE}/discovery/series/similar/${id}`;
    if (type === "book") similarUrl = `${API_BASE}/discovery/books/similar?book_id=${id}`;

    const res = await fetch(similarUrl);
    if (!res.ok) return [];

    const payload = await res.json();
    return Array.isArray(payload) ? payload : (payload.items || []);
}

document.addEventListener("DOMContentLoaded", async () => {
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
