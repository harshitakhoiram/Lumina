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

// 2. NAVIGATION & SEARCH
const setupNavigation = () => {
    const searchPageBtn = document.getElementById("searchPageBtn");
    if (searchPageBtn) {
        searchPageBtn.addEventListener("click", () => {
            window.location.href = "search.html";
        });
    }

    const profileBtn = document.getElementById("profileBtn");
    if (profileBtn) {
        profileBtn.addEventListener("click", () => {
            window.location.href = "profile.html";
        });
    }

    const globalSearch = document.getElementById("global-search");
    if (globalSearch) {
        globalSearch.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                const query = globalSearch.value.trim();
                if (query) {
                    sessionStorage.setItem("searchQuery", query);
                    window.location.href = "search.html";
                }
            }
        });
    }
};

// 3. HERO CAROUSEL LOGIC
function initHeroNav() {
    const next = document.getElementById("heroNext");
    const prev = document.getElementById("heroPrev");

    // Remove existing listeners to prevent double-firing if re-initialized
    if (next && prev) {
        next.onclick = () => {
            heroIndex = (heroIndex + 1) % heroData.length;
            renderHero();
        };
        prev.onclick = () => {
            heroIndex = (heroIndex - 1 + heroData.length) % heroData.length;
            renderHero();
        };
    }
}

function renderHero() {
    const display = document.getElementById("hero-display");
    if (!display || heroData.length === 0) return;

    const item = heroData[heroIndex];
    
    // 1. Correct TMDB Base URL
    const tmdbBaseUrl = "https://image.tmdb.org/t/p/original"; 
    
    // 2. CHECK THE KEYS: Your backend likely sends 'image' or 'poster_url'
    // We add a fallback to make sure imagePath is NEVER undefined before the .startsWith check
    const imagePath = item.image || item.poster_url || item.backdrop_url || "";
    
    // 3. FIX THE TYPO: Changed 'assests' to 'assets'
    let finalImageUrl = "assets/placeholder.png"; 

    if (imagePath) {
        // If it's a full URL (starts with http), use it. Otherwise, append TMDB base.
        finalImageUrl = imagePath.startsWith('http') ? imagePath : `${tmdbBaseUrl}${imagePath}`;
    }

    console.log("SUCCESS: Loading Hero Image ->", finalImageUrl);

    display.innerHTML = `
        <div class="hero-slide active" style="background-image: url('${finalImageUrl}');">
            <div class="hero-info-box">
                <h2 class="gold-accent">${item.title || "Featured Content"}</h2>
                <p>${item.overview ? item.overview.substring(0, 160) + '...' : 'Discover your next favorite on Lumina.'}</p>
                <button id="heroKnowMore" class="nav-btn-header" style="background: var(--accent); color: black; border: none; font-weight: bold; margin-top: 15px;">
                    <i class="fas fa-play"></i> Know More
                </button>
            </div>
        </div>
    `;
    document.getElementById("heroKnowMore").addEventListener("click", () => {
        // Save the current movie data so the next page knows what to show
        sessionStorage.setItem("selectedContent", JSON.stringify(item));
        
        // Redirect to your details or search page
        window.location.href = "detail.html"; 
    });
}

// 4. DATA FETCHING & RENDERING
async function loadDailyRecommendations() {
    try {
        const response = await fetch(`${API_BASE_URL}/recommendations/personalized`, {
            headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (response.ok) {
            const data = await response.json();

            // Setup Hero Section
            heroData = data.slider || [];
            if (heroData.length > 0) {
                renderHero();
                initHeroNav();
            }

            // Render Row Grids
            renderSection("container-genre", data.genre_highlights || []);
            renderSection("container-interest", data.interest_trending || []);
            renderSection("container-global", data.global_top || []);

            // Update Heading Context
            const genreHeader = document.getElementById("header-genre");
            if (genreHeader && data.genre_name) {
                genreHeader.innerHTML = `Since you liked <span class="gold-accent">${data.genre_name}</span>`;
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
            heroData = movies;
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
    
    container.innerHTML = "";

    if (items.length === 0) {
        container.innerHTML = '<p class="loading">No matches found for this category.</p>';
        return;
    }
    const tmdbBaseUrl = "https://image.tmdb.org/t/p/w500"; //will see 
    items.forEach((item) => {
        const anchor = document.createElement("a");
        anchor.href = "#";
        anchor.className = "rec-link";

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

        anchor.appendChild(img);
        anchor.addEventListener("click", (e) => {
            e.preventDefault();
            sessionStorage.setItem("selectedContent", JSON.stringify(item));
            window.location.href = "detail.html";
        });

        container.appendChild(anchor);
    });
}

// 5. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    setupNavigation();
    loadDailyRecommendations();
});

// Auto-refresh recommendations every 5 minutes
setInterval(loadDailyRecommendations, 5 * 60 * 1000);