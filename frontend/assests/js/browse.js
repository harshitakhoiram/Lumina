// Browse Page Logic
const API_BASE_URL = window.API_BASE_URL || "http://localhost:8000";

function normalizeContentType(value) {
    return String(value || "movie").toLowerCase();
}

function normalizeItem(item) {
    const contentType = normalizeContentType(item.content_type);
    const idCandidate = item.tmdb_id || item.external_id || item.id || item.movie_id || item.content_id;
    return {
        ...item,
        id: idCandidate,
        tmdb_id: item.tmdb_id || item.external_id || item.id || null,
        content_type: contentType
    };
}

function createContentTypeBadge(item) {
    const badge = document.createElement("span");
    badge.className = "content-type-badge";
    badge.textContent = item.content_type === "series" ? "Series" : "Movie";
    return badge;
}

function openDetailPage(item) {
    const idCandidate = item.tmdb_id || item.external_id || item.id || item.movie_id || item.content_id;
    const selected = {
        ...item,
        id: idCandidate,
        tmdb_id: idCandidate,
        app_content_id: item.content_id || null
    };
    sessionStorage.setItem('selectedContent', JSON.stringify(selected));
    window.location.href = "detail.html";
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

document.addEventListener("DOMContentLoaded", () => {
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

    const title = sessionStorage.getItem("browse_category_title") || "All Content";
    const itemsRaw = sessionStorage.getItem("browse_category_items");
    const container = document.getElementById("category-grid");
    const titleHeader = document.getElementById("category-title");

    if (titleHeader) titleHeader.innerHTML = `Explore <span class="gold-accent">${title}</span>`;

    if (!itemsRaw || !container) {
        if (container) container.innerHTML = '<p class="loading">No content found.</p>';
        return;
    }

    const items = JSON.parse(itemsRaw);
    const tmdbBaseUrl = "https://image.tmdb.org/t/p/w500";

    items.forEach((raw) => {
        const item = normalizeItem(raw);
        const card = document.createElement("div");
        card.className = "rec-card-stack";
        
        const anchor = document.createElement("a");
        anchor.href = "#";
        anchor.className = "rec-link";

        const img = document.createElement("img");
        const imagePath = item.poster_url || item.image || "";
        img.src = imagePath
            ? (imagePath.startsWith("http") ? imagePath : `${tmdbBaseUrl}${imagePath}`)
            : "assests/LuminaLogo.png";
        img.alt = item.title || "Content";
        img.loading = "lazy";

        anchor.appendChild(img);
        anchor.appendChild(createContentTypeBadge(item));
        anchor.addEventListener("click", (e) => {
            e.preventDefault();
            openDetailPage(item);
        });

        const wlBtn = document.createElement("button");
        wlBtn.type = "button";
        wlBtn.className = "watchlist-btn";
        wlBtn.textContent = "+ Watchlist";
        wlBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (window.addToWatchlist) {
                window.addToWatchlist(item);
            }
        });

        card.appendChild(anchor);
        card.appendChild(wlBtn);
        container.appendChild(card);
    });
});
