// Dashboard Script
const API_BASE_URL = "http://localhost:8000";
const currentToken = localStorage.getItem("access_token");
const userId = localStorage.getItem("user_id");

// 1. GLOBAL STATE & AUTH CHECK
if (!currentToken) {
    window.location.href = "index.html";
}

let heroIndex = 0;
let heroData = [];
let heroNavInitialized = false;

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

// 2. NAVIGATION & SEARCH
const setupNavigation = () => {
    const accountMenu = document.getElementById("accountMenu");
    const accountTrigger = document.getElementById("accountTrigger");
    const accountDropdown = document.getElementById("accountDropdown");
    const logoutBtn = document.getElementById("logoutBtn");

    if (accountTrigger && accountDropdown) {
        accountTrigger.addEventListener("click", (event) => {
            event.stopPropagation();
            const isHidden = accountDropdown.classList.contains("hidden");
            accountDropdown.classList.toggle("hidden", !isHidden);
            accountTrigger.setAttribute("aria-expanded", String(isHidden));
        });

        document.addEventListener("click", (event) => {
            if (!accountMenu || accountMenu.contains(event.target)) return;
            accountDropdown.classList.add("hidden");
            accountTrigger.setAttribute("aria-expanded", "false");
        });

        document.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            accountDropdown.classList.add("hidden");
            accountTrigger.setAttribute("aria-expanded", "false");
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("access_token");
            localStorage.removeItem("user_id");
            localStorage.removeItem("refresh_token");
            sessionStorage.clear();
            window.location.href = "index.html";
        });
    }
};

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

function bindDashboardSearch() {
    const form = document.getElementById("dashboardSearchForm");
    const input = document.getElementById("navbar-query");

    if (!form || !input) return;

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const query = input.value.trim();
        if (!query) {
            input.focus();
            return;
        }

        sessionStorage.removeItem("selectedSearchContent");
        sessionStorage.setItem("lastSearchQuery", query);
        window.location.href = `search.html?q=${encodeURIComponent(query)}`;
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

// 3. HERO CAROUSEL LOGIC
function initHeroNav() {
    const next = document.getElementById("heroNext");
    const prev = document.getElementById("heroPrev");

    if (next) {
        next.onclick = (e) => {
            e.stopPropagation();
            if (!heroData.length) return;
            heroIndex = (heroIndex + 1) % heroData.length;
            renderHero();
        };
    }

    if (prev) {
        prev.onclick = (e) => {
            e.stopPropagation();
            if (!heroData.length) return;
            heroIndex = (heroIndex - 1 + heroData.length) % heroData.length;
            renderHero();
        };
    }

    if (!heroNavInitialized) {
        window.addEventListener("keydown", (e) => {
            if (!heroData.length) return;

            if (e.key === "ArrowRight") {
                heroIndex = (heroIndex + 1) % heroData.length;
                renderHero();
            } else if (e.key === "ArrowLeft") {
                heroIndex = (heroIndex - 1 + heroData.length) % heroData.length;
                renderHero();
            }
        });

        heroNavInitialized = true;
    }
}

function renderHero() {
    const display = document.getElementById("hero-display");
    if (!display || heroData.length === 0) return;

    const item = heroData[heroIndex];
    const tmdbBaseUrl = "https://image.tmdb.org/t/p/original";
    const imagePath = item.image || item.poster_url || item.backdrop_url || "";
    let finalImageUrl = "assests/LuminaLogo.png";

    if (imagePath) {
        finalImageUrl = imagePath.startsWith('http') ? imagePath : `${tmdbBaseUrl}${imagePath}`;
    }

    display.innerHTML = `
        <div class="hero-slide active" style="background-image: url('${finalImageUrl}');">
            <div class="hero-info-box">
                <h2 class="gold-accent">${item.title || "Featured Content"}</h2>
                <p>${item.overview ? item.overview.substring(0, 160) + '...' : 'Discover your next favorite on Lumina.'}</p>
                <button id="heroKnowMore" class="nav-btn-header" style="background: var(--accent); color: black; border: none; font-weight: bold; margin-top: 15px;">
                    Know More
                </button>
            </div>
        </div>
    `;

    const knowMoreBtn = document.getElementById("heroKnowMore");
    if (knowMoreBtn) {
        knowMoreBtn.addEventListener("click", () => {
            sessionStorage.setItem("selectedContent", JSON.stringify(normalizeItem(item)));
            window.location.href = "detail.html";
        });
    }
}

// 4. DATA FETCHING & RENDERING
async function loadDailyRecommendations() {
    try {
        const response = await fetch(`${API_BASE_URL}/recommendations/personalized?t=${Date.now()}`, {
            headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (response.ok) {
            const data = await response.json();

            // Setup Hero Section
            heroData = (data.slider || []).map(normalizeItem);
            if (heroData.length > 0) {
                renderHero();
                initHeroNav();
            }

            // Render Row Grids
            renderGenreSections(data);
            renderSection("container-interest", (data.interest_trending || []).map(normalizeItem));
            renderSection("container-global", (data.global_top || []).map(normalizeItem));

            // Handle Book Recommendation
            const bookSection = document.getElementById("book-rec-section");
            if (bookSection && data.book_recommendation) {
                bookSection.style.display = "block";
                renderSection("container-book", [normalizeItem(data.book_recommendation)]);
                const bookHeader = document.getElementById("header-book");
                if (bookHeader) bookHeader.innerHTML = `Recommended Read in <span class="gold-accent">${data.genre_name}</span>`;
            }

            // Update Dynamic Headings
            const interestHeader = document.getElementById("header-interest");
            if (interestHeader && data.liked_title) {
                const cleanTitle = data.liked_title.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                interestHeader.innerHTML = `Since you like <span class="gold-accent">${cleanTitle}</span>`;
            }
            const recommendationHeader = document.getElementById("header-recommendation-day");
            if (recommendationHeader && data.genre_name) {
                recommendationHeader.innerHTML = `Recommendation of the Day in <span class="gold-accent">${data.genre_name}</span>`;
            }
        } else {
            fetchTrendingFallback();
        }
    } catch (error) {
        console.error("Error loading recommendations:", error);
        fetchTrendingFallback();
    }
}

async function fetchTrendingFallback() {
    try {
        const response = await fetch(`${API_BASE_URL}/discovery/movies/trending`, {
            headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (response.ok) {
            const movies = await response.json();
            heroData = movies.map(normalizeItem);
            renderHero();
            initHeroNav();
        }
    } catch (error) {
        console.error("Fallback failed:", error);
    }
}

function renderSection(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (containerId === "container-global") {
        renderFanFavorites(items);
        return;
    }

    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = '<p class="loading">No matches found for this category.</p>';
        return;
    }
    const tmdbBaseUrl = "https://image.tmdb.org/t/p/w500"; //will see 
    const compactBookCard = containerId === "container-book";

    items.forEach((raw) => {
        const item = normalizeItem(raw);
        const anchor = document.createElement("a");
        anchor.href = "#";
        anchor.className = compactBookCard ? "rec-link rec-link-book" : "rec-link";

        const img = document.createElement("img");
        const imagePath = item.poster_url || item.image || "";
        let finalImageUrl = "assests/LuminaLogo.png"; // Fallback to your logo

        if (imagePath) {
            finalImageUrl = imagePath.startsWith('http') ? imagePath : `${tmdbBaseUrl}${imagePath}`;
        }
        // Prioritize vertical posters for grid sections
        img.src = finalImageUrl;
        img.alt = item.title || "Content";
        img.loading = "lazy";

        if (compactBookCard) {
            const textWrap = document.createElement("div");
            textWrap.className = "book-mini-info";
            textWrap.innerHTML = `
                <h3>${item.title || "Recommended Read"}</h3>
                <p>${item.rating ? `Rating ${item.rating}/10` : "Picked for your taste"}</p>
            `;
            anchor.appendChild(img);
            anchor.appendChild(textWrap);
        } else {
            anchor.appendChild(img);
        }

        anchor.addEventListener("click", (e) => {
            e.preventDefault();
            if (!item.id && !item.movie_id) {
                console.error("This item is missing an ID! Check backend _format_movie_data");
            }
            sessionStorage.setItem("selectedContent", JSON.stringify(normalizeItem(item)));
            window.location.href = "detail.html";
        });

        container.appendChild(anchor);
    });
}

function renderFanFavorites(items) {
    const container = document.getElementById("container-global");
    if (!container) return;

    container.innerHTML = "";
    if (!items.length) {
        container.innerHTML = '<p class="loading">No fan favorites available right now.</p>';
        return;
    }

    const tmdbBaseUrl = "https://image.tmdb.org/t/p/w500";
    items.forEach((raw) => {
        const item = normalizeItem(raw);
        const imagePath = item.poster_url || item.image || "";
        const finalImageUrl = imagePath
            ? (imagePath.startsWith("http") ? imagePath : `${tmdbBaseUrl}${imagePath}`)
            : "assests/LuminaLogo.png";

        const card = document.createElement("a");
        card.href = "#";
        card.className = "fan-card";
        card.innerHTML = `
            <img src="${finalImageUrl}" alt="${item.title || "Fan favorite"}" loading="lazy">
            <div class="fan-meta">
                <div class="fan-rating">★ ${item.rating || "-"}</div>
                <div class="fan-title">${item.title || "Untitled"}</div>
            </div>
        `;

        card.addEventListener("click", (e) => {
            e.preventDefault();
            sessionStorage.setItem("selectedContent", JSON.stringify(normalizeItem(item)));
            window.location.href = "detail.html";
        });

        container.appendChild(card);
    });

    // Refresh arrow visibility after the strip content updates.
    window.requestAnimationFrame(updateFanCarouselNavState);
}

function updateFanCarouselNavState() {
    const strip = document.getElementById("container-global");
    const prev = document.getElementById("fanPrev");
    const next = document.getElementById("fanNext");
    if (!strip || !prev || !next) return;

    const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const hasOverflow = maxScrollLeft > 2;
    const atStart = strip.scrollLeft <= 2;
    const atEnd = strip.scrollLeft >= (maxScrollLeft - 2);

    if (!hasOverflow) {
        prev.style.visibility = "hidden";
        next.style.visibility = "hidden";
        prev.style.pointerEvents = "none";
        next.style.pointerEvents = "none";
        return;
    }

    prev.style.visibility = atStart ? "hidden" : "visible";
    next.style.visibility = atEnd ? "hidden" : "visible";
    prev.style.pointerEvents = atStart ? "none" : "auto";
    next.style.pointerEvents = atEnd ? "none" : "auto";
}

function initFanCarouselNav() {
    const strip = document.getElementById("container-global");
    const prev = document.getElementById("fanPrev");
    const next = document.getElementById("fanNext");
    if (!strip || !prev || !next) return;

    const scrollByCards = () => Math.max(260, Math.floor(strip.clientWidth * 0.8));

    prev.addEventListener("click", () => {
        strip.scrollBy({ left: -scrollByCards(), behavior: "smooth" });
        window.setTimeout(updateFanCarouselNavState, 220);
    });

    next.addEventListener("click", () => {
        strip.scrollBy({ left: scrollByCards(), behavior: "smooth" });
        window.setTimeout(updateFanCarouselNavState, 220);
    });

    strip.addEventListener("scroll", updateFanCarouselNavState, { passive: true });
    window.addEventListener("resize", updateFanCarouselNavState);
    updateFanCarouselNavState();
}

// 5. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    bindDashboardSearch();
    initFanCarouselNav();
    loadDailyRecommendations();
});

function buildSelectedContent(item) {
    const pickNumericId = (...values) => {
        for (const value of values) {
            const str = String(value ?? "").trim();
            if (/^\d+$/.test(str)) return str;
        }
        return null;
    };

    return {
        ...item,
        tmdb_id: pickNumericId(item?.tmdb_id, item?.movie_id, item?.id),
        app_content_id: item?.content_id || null
    };
}

// When opening detail page:
function openDetailPage(item) {
    sessionStorage.setItem('selectedContent', JSON.stringify(buildSelectedContent(item)));
    window.location.href = "detail.html";
}

function renderGenreSections(data) {
    const sections = Array.isArray(data.genre_sections) ? data.genre_sections : [];
    const headerGenre = document.getElementById("header-genre");
    const extraWrapper = document.getElementById("genre-sections-extra");

    if (!sections.length) {
        renderSection("container-genre", (data.genre_highlights || []).map(normalizeItem));
        if (headerGenre && data.genre_name) {
            const cleanGenre = data.genre_name.charAt(0).toUpperCase() + data.genre_name.slice(1);
            headerGenre.innerHTML = `Explore <span class="gold-accent">${cleanGenre}</span>`;
        }
        if (extraWrapper) extraWrapper.innerHTML = "";
        return;
    }

    const primarySection = sections[0] || {};
    const primaryName = primarySection.genre_name || data.genre_name || "Trending";
    if (headerGenre) {
        headerGenre.innerHTML = `Explore <span class="gold-accent">${primaryName}</span>`;
    }
    renderSection("container-genre", (primarySection.items || []).map(normalizeItem));

    if (!extraWrapper) return;
    extraWrapper.innerHTML = "";

    sections.slice(1).forEach((section) => {
        const title = section.genre_name || section.genre || "Genre Picks";
        const sectionHeader = document.createElement("h1");
        sectionHeader.innerHTML = `Explore <span class="gold-accent">${title}</span>`;

        const sectionBox = document.createElement("div");
        sectionBox.className = "box";

        const items = (section.items || []).map(normalizeItem);
        if (!items.length) {
            sectionBox.innerHTML = '<p class="loading">No matches found for this category.</p>';
        } else {
            const tmdbBaseUrl = "https://image.tmdb.org/t/p/w500";
            items.forEach((item) => {
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
                anchor.addEventListener("click", (e) => {
                    e.preventDefault();
                    sessionStorage.setItem("selectedContent", JSON.stringify(normalizeItem(item)));
                    window.location.href = "detail.html";
                });

                sectionBox.appendChild(anchor);
            });
        }

        extraWrapper.appendChild(sectionHeader);
        extraWrapper.appendChild(sectionBox);
    });
}