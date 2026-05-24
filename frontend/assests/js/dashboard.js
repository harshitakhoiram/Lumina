// Dashboard Script
const API_BASE_URL = window.API_BASE_URL || "http://localhost:8000";
const currentToken = localStorage.getItem("access_token");
const userId = localStorage.getItem("user_id");
const DASHBOARD_MEDIA_MODE_KEY = "dashboard_media_mode";
const isAuthenticated = Boolean(currentToken);

// 1. GLOBAL STATE & AUTH STATE

let heroIndex = 0;
let heroData = [];
let heroNavInitialized = false;
let currentMediaMode = normalizeMediaMode(localStorage.getItem(DASHBOARD_MEDIA_MODE_KEY) || "all");

function normalizeMediaMode(value) {
    const normalized = String(value || "all").toLowerCase();
    if (["movie", "movies"].includes(normalized)) return "movie";
    if (["series", "tv", "shows"].includes(normalized)) return "series";
    return "all";
}

function normalizeContentType(value) {
    return String(value || "movie").toLowerCase();
}

function getAuthHeaders() {
    return currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
}

function createPublicDashboardData(items = [], mediaMode = currentMediaMode) {
    const normalizedItems = items.map(normalizeItem);
    const heroItems = normalizedItems.slice(0, 8);
    const gridItems = normalizedItems.slice(0, 12);

    return {
        media_mode: mediaMode,
        available_media_modes: ["all", "movie", "series"],
        slider: heroItems,
        genre_name: "Trending",
        genre_highlights: gridItems,
        genre_sections: [{ genre_name: "Trending now", items: gridItems }],
        interest_trending: gridItems,
        global_top: gridItems,
        liked_title: "",
        book_recommendation: null
    };
}

function updateAccessState() {
    const guestSignInLink = document.getElementById("guestSignInLink");
    const accountMenu = document.getElementById("accountMenu");
    const accessNote = document.getElementById("dashboardAccessNote");

    if (guestSignInLink) {
        guestSignInLink.hidden = isAuthenticated;
    }

    if (accountMenu) {
        accountMenu.hidden = !isAuthenticated;
    }

    if (accessNote) {
        accessNote.textContent = isAuthenticated
            ? "Your dashboard is personalized from your profile."
            : "Search without signing in. Log in to personalize your feed and watchlist.";
    }
}

function syncMediaToggle(availableModes = ["all", "movie", "series"], mode = currentMediaMode) {
    const controls = document.getElementById("dashboardControls");
    const buttons = Array.from(document.querySelectorAll(".media-toggle-btn"));
    const subtitle = document.getElementById("mediaToggleCopy");
    if (!controls || !buttons.length) return;

    const allowed = new Set((availableModes || []).map(normalizeMediaMode));
    const resolvedMode = allowed.has(normalizeMediaMode(mode)) ? normalizeMediaMode(mode) : normalizeMediaMode(availableModes[0] || "all");
    currentMediaMode = resolvedMode;
    localStorage.setItem(DASHBOARD_MEDIA_MODE_KEY, resolvedMode);

    buttons.forEach((button) => {
        const buttonMode = normalizeMediaMode(button.dataset.mediaMode);
        const isAllowed = allowed.has(buttonMode);
        const isActive = buttonMode === resolvedMode;
        button.hidden = !isAllowed;
        button.disabled = !isAllowed;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });

    controls.hidden = allowed.size <= 1;
    if (subtitle) {
        subtitle.textContent = resolvedMode === "series"
            ? "Showing series-first recommendations across the dashboard."
            : resolvedMode === "movie"
                ? "Showing movie-first recommendations across the dashboard."
                : "Showing mixed picks from both movies and series.";
    }
}

function bindMediaToggle() {
    const buttons = document.querySelectorAll(".media-toggle-btn");
    buttons.forEach((button) => {
        button.addEventListener("click", () => {
            const nextMode = normalizeMediaMode(button.dataset.mediaMode);
            if (nextMode === currentMediaMode) return;
            currentMediaMode = nextMode;
            localStorage.setItem(DASHBOARD_MEDIA_MODE_KEY, currentMediaMode);
            syncMediaToggle(["all", "movie", "series"], currentMediaMode);
            loadDailyRecommendations();
        });
    });
}

function setDashboardSwitching(isSwitching) {
    const container = document.querySelector(".main-container");
    if (!container) return;
    container.classList.toggle("is-switching", Boolean(isSwitching));

    let loader = document.getElementById("modeSwitchLoader");
    if (!loader) {
        loader = document.createElement("div");
        loader.id = "modeSwitchLoader";
        loader.className = "mode-switch-loader";
        loader.innerHTML = `
            <div class="mode-loader-card" role="status" aria-live="polite">
                <span class="mode-loader-spinner" aria-hidden="true"></span>
                <span class="mode-loader-text">Loading recommendations...</span>
            </div>
        `;
        document.body.appendChild(loader);
    }

    const text = loader.querySelector(".mode-loader-text");
    if (text && isSwitching) {
        const modeLabel = currentMediaMode === "series" ? "series" : (currentMediaMode === "movie" ? "movies" : "mixed");
        text.textContent = `Loading ${modeLabel} recommendations...`;
    }
    loader.classList.toggle("visible", Boolean(isSwitching));
}

function updateDashboardText(mediaMode) {
    const headerGlobal = document.getElementById("header-global");
    const fanSubtitle = document.getElementById("fan-subtitle");
    if (headerGlobal) {
        headerGlobal.textContent = mediaMode === "series"
            ? "Fan-favorite series"
            : mediaMode === "movie"
                ? "Fan-favorite movies"
                : "Fan favorites";
    }
    if (fanSubtitle) {
        fanSubtitle.textContent = mediaMode === "series"
            ? "This week's most talked-about shows"
            : mediaMode === "movie"
                ? "This week's most talked-about films"
                : "This week's top picks";
    }
}

function formatContentTypeLabel(contentType) {
    const normalized = normalizeContentType(contentType);
    if (normalized === "series") return "Series";
    if (normalized === "book") return "Book";
    return "Movie";
}

function getModeHeadingSuffix() {
    if (currentMediaMode === "series") return " Series";
    if (currentMediaMode === "movie") return " Movies";
    return "";
}

function createContentTypeBadge(item) {
    const badge = document.createElement("span");
    badge.className = "content-type-badge";
    badge.textContent = formatContentTypeLabel(item.content_type);
    return badge;
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

function pickNumericId(...values) {
    for (const value of values) {
        const str = String(value ?? "").trim();
        if (/^\d+$/.test(str)) return str;
    }
    return null;
}

function filterItemsByMode(items = [], mode = currentMediaMode) {
    const normalizedMode = normalizeMediaMode(mode);
    const normalizedItems = items.map(normalizeItem);
    if (normalizedMode === "series") {
        return normalizedItems.filter((item) => item.content_type === "series");
    }
    if (normalizedMode === "movie") {
        return normalizedItems.filter((item) => item.content_type === "movie");
    }
    return normalizedItems;
}

function filterPayloadForMode(payload, mode = currentMediaMode) {
    const filtered = { ...payload };
    filtered.slider = filterItemsByMode(payload.slider || [], mode);
    filtered.genre_highlights = filterItemsByMode(payload.genre_highlights || [], mode);
    filtered.interest_trending = filterItemsByMode(payload.interest_trending || [], mode);
    filtered.global_top = filterItemsByMode(payload.global_top || [], mode);
    filtered.genre_sections = (payload.genre_sections || []).map((section) => ({
        ...section,
        items: filterItemsByMode(section.items || [], mode)
    }));
    return filtered;
}

// 2. NAVIGATION & SEARCH
const setupNavigation = () => {
    const accountMenu = document.getElementById("accountMenu");
    const accountTrigger = document.getElementById("accountTrigger");
    const accountDropdown = document.getElementById("accountDropdown");
    const logoutBtn = document.getElementById("logoutBtn");

    if (!isAuthenticated) return;

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

async function fetchPublicDashboardData() {
    const fallbackPath = currentMediaMode === "series"
        ? "/discovery/series/trending"
        : "/discovery/movies/trending";

    const response = await fetch(`${API_BASE_URL}${fallbackPath}`);
    if (!response.ok) {
        return createPublicDashboardData([], currentMediaMode);
    }

    const items = await response.json();
    return createPublicDashboardData(Array.isArray(items) ? items : [], currentMediaMode);
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

    const summaryText = item.overview || item.description || "";
    const overview = summaryText
        ? `${summaryText.substring(0, 220)}${summaryText.length > 220 ? '...' : ''}`
        : 'Discover your next favorite on Lumina.';
    const contentType = String(item.content_type || 'movie').toLowerCase();
    const typeLabel = contentType === 'series' ? 'Series Pick' : 'Movie Pick';

    display.innerHTML = `
        <div class="hero-slide active" style="background-image: url('${finalImageUrl}');">
            <div class="hero-overlay"></div>
            <div class="hero-content">
                <div class="hero-poster-wrap">
                    <img class="hero-poster" src="${finalImageUrl}" alt="${item.title || 'Featured'}" onerror="this.src='assests/LuminaLogo.png'">
                </div>
                <div class="hero-info-box">
                    <div class="hero-meta-row">
                        <span class="hero-chip">${typeLabel}</span>
                        <span class="hero-chip">${item.rating ? `Rating ${item.rating}/10` : 'Personalized'}</span>
                    </div>
                    <h2 class="gold-accent">${item.title || "Featured Content"}</h2>
                    <p>${overview}</p>
                    <div class="hero-action-row">
                        <button id="heroKnowMore" class="hero-cta-btn">Know More</button>
                        <button id="heroWatchlist" class="hero-ghost-btn">+ Watchlist</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const knowMoreBtn = document.getElementById("heroKnowMore");
    const watchlistBtn = document.getElementById("heroWatchlist");
    if (knowMoreBtn) {
        knowMoreBtn.addEventListener("click", () => {
            openDetailPage(item);
        });
    }
    if (watchlistBtn) {
        watchlistBtn.addEventListener("click", () => addItemToWatchlist(normalizeItem(item)));
    }
}

// 4. DATA FETCHING & RENDERING
async function loadDailyRecommendations() {
    // 1. Check Cache First
    const cacheKey = `dashboard_data_${currentMediaMode}`;
    const cachedData = sessionStorage.getItem(cacheKey);
    const navigationType = window.performance?.getEntriesByType("navigation")[0]?.type;
    
    // Only use cache if it's NOT a manual reload
    if (cachedData && navigationType !== "reload") {
        console.log("Loading dashboard from session cache...");
        try {
            const data = JSON.parse(cachedData);
            renderDashboardFromData(data);
            return;
        } catch (e) {
            console.warn("Failed to parse cached dashboard data", e);
        }
    }

    setDashboardSwitching(true);
    try {
        if (!isAuthenticated) {
            const publicData = await fetchPublicDashboardData();
            syncMediaToggle(publicData.available_media_modes, publicData.media_mode || currentMediaMode);
            updateDashboardText(publicData.media_mode || currentMediaMode);
            renderDashboardFromData(publicData);
            return;
        }

        const response = await fetch(`${API_BASE_URL}/recommendations/personalized?media_mode=${encodeURIComponent(currentMediaMode)}&t=${Date.now()}`, {
            headers: getAuthHeaders(),
        });

        if (response.ok) {
            const apiData = await response.json();
            syncMediaToggle(apiData.available_media_modes, apiData.media_mode || currentMediaMode);
            updateDashboardText(apiData.media_mode || currentMediaMode);
            const data = filterPayloadForMode(apiData, currentMediaMode);

            // Setup Hero Section
            heroData = data.slider || [];
            if (heroData.length > 0) {
                renderHero();
                initHeroNav();
            }

            // Render Row Grids
            renderGenreSections(data);
            renderSection("container-interest", data.interest_trending || []);
            renderSection("container-global", data.global_top || []);

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

            // 4. Save to Cache
            sessionStorage.setItem(cacheKey, JSON.stringify(apiData));
        } else {
            await fetchTrendingFallback();
        }
    } catch (error) {
        console.error("Error loading recommendations:", error);
        await fetchTrendingFallback();
    } finally {
        window.setTimeout(() => setDashboardSwitching(false), 120);
    }
}

function renderDashboardFromData(apiData) {
    syncMediaToggle(apiData.available_media_modes, apiData.media_mode || currentMediaMode);
    updateDashboardText(apiData.media_mode || currentMediaMode);
    const data = filterPayloadForMode(apiData, currentMediaMode);

    // Setup Hero Section
    heroData = data.slider || [];
    if (heroData.length > 0) {
        renderHero();
        initHeroNav();
    }

    // Render Row Grids
    renderGenreSections(data);
    renderSection("container-interest", data.interest_trending || []);
    renderSection("container-global", data.global_top || []);

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
}

async function fetchTrendingFallback() {
    try {
        const fallbackPath = currentMediaMode === "series"
            ? "/discovery/series/trending"
            : "/discovery/movies/trending";
        const response = await fetch(`${API_BASE_URL}${fallbackPath}`);

        if (response.ok) {
            const items = await response.json();
            heroData = items.map(normalizeItem);
            renderHero();
            initHeroNav();
        }
    } catch (error) {
        console.error("Fallback failed:", error);
    }
}

function renderSection(containerId, items) {
    const container = (typeof containerId === "string") ? document.getElementById(containerId) : containerId;
    if (!container) return;

    if (container.id === "container-global") {
        renderFanFavorites(items);
        return;
    }

    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = '<p class="loading">No matches found for this category.</p>';
        const parentCarousel = container.closest(".row-carousel");
        if (parentCarousel) {
            const navs = parentCarousel.querySelectorAll(".carousel-nav");
            navs.forEach(n => n.classList.remove("visible"));
        }
        return;
    }
    const tmdbBaseUrl = "https://image.tmdb.org/t/p/w500";
    const compactBookCard = container.id === "container-book";

    items.forEach((raw) => {
        const item = normalizeItem(raw);
        const card = document.createElement("div");
        card.className = "rec-card-stack";
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
            anchor.appendChild(createContentTypeBadge(item));
        }

        anchor.addEventListener("click", (e) => {
            e.preventDefault();
            if (!item.id && !item.movie_id) {
                console.error("This item is missing an ID! Check backend _format_movie_data");
            }
            openDetailPage(item);
        });

        const wlBtn = document.createElement("button");
        wlBtn.type = "button";
        wlBtn.className = "watchlist-btn";
        wlBtn.textContent = "+ Watchlist";
        wlBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            addItemToWatchlist(item);
        });

        card.appendChild(anchor);
        if (!compactBookCard) {
            card.appendChild(wlBtn);
        }
        container.appendChild(card);
    });

    // Initialize carousel navigation if this is a carousel strip
    if (container.classList.contains("carousel-strip")) {
        const parent = container.parentElement;
        if (parent && parent.classList.contains("row-carousel")) {
            const prev = parent.querySelector(".carousel-nav.prev");
            const next = parent.querySelector(".carousel-nav.next");
            if (prev && next) {
                initCarouselNavigation(container, prev, next);
            }
        }
    }
}

function initCarouselNavigation(strip, prev, next) {
    const updateArrows = () => {
        const maxScroll = strip.scrollWidth - strip.clientWidth;
        prev.classList.toggle("visible", strip.scrollLeft > 5);
        next.classList.toggle("visible", strip.scrollLeft < maxScroll - 5);
    };

    const scrollByValue = () => strip.clientWidth * 0.8;

    prev.onclick = (e) => {
        e.preventDefault();
        strip.scrollBy({ left: -scrollByValue(), behavior: "smooth" });
    };

    next.onclick = (e) => {
        e.preventDefault();
        strip.scrollBy({ left: scrollByValue(), behavior: "smooth" });
    };

    strip.onscroll = updateArrows;
    window.addEventListener("resize", updateArrows);
    // Initial check after items are rendered
    setTimeout(updateArrows, 100);
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

        const card = document.createElement("div");
        card.className = "fan-card";
        card.innerHTML = `
            <img src="${finalImageUrl}" alt="${item.title || "Fan favorite"}" loading="lazy">
            <div class="fan-meta">
                <div class="fan-type">${formatContentTypeLabel(item.content_type)}</div>
                <div class="fan-rating">★ ${item.rating || "-"}</div>
                <div class="fan-title">${item.title || "Untitled"}</div>
            </div>
        `;

        card.addEventListener("click", () => {
            openDetailPage(item);
        });

        const wlBtn = document.createElement("button");
        wlBtn.type = "button";
        wlBtn.className = "watchlist-btn fan-watchlist";
        wlBtn.textContent = "+ Watchlist";
        wlBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            e.preventDefault();
            addItemToWatchlist(item);
        });

        card.appendChild(wlBtn);

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

    // Add See All listeners
    const seeAllGenre = document.getElementById("seeAllGenre");
    const seeAllInterest = document.getElementById("seeAllInterest");

    const navigateToBrowse = (title, cacheKey) => {
        const fullData = sessionStorage.getItem(cacheKey);
        if (!fullData) return;
        const parsed = JSON.parse(fullData);
        let items = [];
        if (title === "Explore") {
            items = (parsed.genre_sections && parsed.genre_sections[0]) ? parsed.genre_sections[0].items : (parsed.genre_highlights || []);
            title = (parsed.genre_sections && parsed.genre_sections[0]) ? parsed.genre_sections[0].genre_name : (parsed.genre_name || "Explore");
        } else if (title === "Recommended") {
            items = parsed.interest_trending || [];
            title = `Because you like ${parsed.liked_title || "Lumina"}`;
        }

        sessionStorage.setItem("browse_category_title", title);
        sessionStorage.setItem("browse_category_items", JSON.stringify(items));
        window.location.href = "browse.html";
    };

    if (seeAllGenre) {
        seeAllGenre.onclick = (e) => {
            e.preventDefault();
            navigateToBrowse("Explore", `dashboard_data_${currentMediaMode}`);
        };
    }
    if (seeAllInterest) {
        seeAllInterest.onclick = (e) => {
            e.preventDefault();
            navigateToBrowse("Recommended", `dashboard_data_${currentMediaMode}`);
        };
    }
}

// 5. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    updateAccessState();
    setupNavigation();
    bindDashboardSearch();
    bindMediaToggle();
    syncMediaToggle(["all", "movie", "series"], currentMediaMode);
    updateDashboardText(currentMediaMode);
    initFanCarouselNav();
    loadDailyRecommendations();
});

function buildSelectedContent(item) {
    const normalized = normalizeItem(item || {});
    const detailId = pickNumericId(
        normalized?.tmdb_id,
        normalized?.external_id,
        normalized?.movie_id,
        normalized?.id,
        normalized?.content_id
    );

    return {
        ...normalized,
        id: detailId || normalized?.id || normalized?.content_id || null,
        tmdb_id: detailId,
        app_content_id: normalized?.content_id || null
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
        const genreItems = filterItemsByMode(data.genre_highlights || [], currentMediaMode);
        renderSection("container-genre", genreItems);
        if (headerGenre && data.genre_name) {
            const cleanGenre = data.genre_name.charAt(0).toUpperCase() + data.genre_name.slice(1);
            headerGenre.innerHTML = `Explore <span class="gold-accent">${cleanGenre}</span>${getModeHeadingSuffix()}`;
        }
        if (extraWrapper) extraWrapper.innerHTML = "";
        return;
    }

    const primarySection = sections[0] || {};
    const primaryName = primarySection.genre_name || data.genre_name || "Trending";
    if (headerGenre) {
        headerGenre.innerHTML = `Explore <span class="gold-accent">${primaryName}</span>${getModeHeadingSuffix()}`;
    }
    const primaryItems = filterItemsByMode(primarySection.items || [], currentMediaMode);
    renderSection("container-genre", primaryItems);

    if (!extraWrapper) return;
    extraWrapper.innerHTML = "";

    sections.slice(1).forEach((section, idx) => {
        const title = section.genre_name || section.genre || "Genre Picks";
        const sectionWrapper = document.createElement("div");
        sectionWrapper.className = "genre-extra-section";
        
        const headerRow = document.createElement("div");
        headerRow.className = "section-header-row";
        headerRow.innerHTML = `
            <h1>Explore <span class="gold-accent">${title}</span>${getModeHeadingSuffix()}</h1>
            <a href="#" class="see-all-link">
                See All <span class="see-all-arrow">&#10132;</span>
            </a>
        `;
        headerRow.querySelector(".see-all-link").onclick = (e) => {
            e.preventDefault();
            sessionStorage.setItem("browse_category_title", title);
            sessionStorage.setItem("browse_category_items", JSON.stringify(section.items || []));
            window.location.href = "browse.html";
        };

        const carouselWrapper = document.createElement("div");
        carouselWrapper.className = "row-carousel";
        
        const prevBtn = document.createElement("button");
        prevBtn.className = "carousel-nav prev";
        prevBtn.innerHTML = "&#10094;";
        
        const strip = document.createElement("div");
        strip.className = "carousel-strip";
        strip.id = `container-genre-extra-${idx}`;
        
        const nextBtn = document.createElement("button");
        nextBtn.className = "carousel-nav next";
        nextBtn.innerHTML = "&#10095;";

        carouselWrapper.appendChild(prevBtn);
        carouselWrapper.appendChild(strip);
        carouselWrapper.appendChild(nextBtn);

        sectionWrapper.appendChild(headerRow);
        sectionWrapper.appendChild(carouselWrapper);
        extraWrapper.appendChild(sectionWrapper);

        renderSection(strip, section.items || []);
    });
}

function showToast(message) {
    const old = document.getElementById("watchlistToast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.id = "watchlistToast";
    toast.className = "watchlist-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
}

async function addItemToWatchlist(item) {
    if (!isAuthenticated) {
        showToast("Sign in to save to your watchlist");
        return;
    }

    if (!window.addToWatchlist) {
        showToast("Watchlist service unavailable");
        return;
    }
    try {
        await window.addToWatchlist(item);
        showToast("Added to watchlist");
    } catch (_err) {
        showToast("Could not add to watchlist");
    }
}