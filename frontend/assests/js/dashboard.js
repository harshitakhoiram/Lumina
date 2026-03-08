// Dashboard Script

const API_BASE_URL = "http://localhost:8000";
const currentToken = localStorage.getItem("access_token");
const userId = localStorage.getItem("user_id");

// Check authentication
if (!currentToken) {
    window.location.href = "index.html";
}

// Navigation
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

// Search functionality
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

// 1. Slider & Navigation Re-selection
let slider, nextBtn, prevBtn;

function initSlider() {
    slider = document.getElementById("daily-recommendations");
    nextBtn = document.getElementById("nextBtn");
    prevBtn = document.getElementById("prevBtn");

    if (nextBtn && prevBtn && slider) {
        const scrollAmount = 270; // Tile width (240) + partial gap (30)
        nextBtn.addEventListener("click", () => {
            slider.scrollBy({ left: scrollAmount, behavior: "smooth" });
        });
        prevBtn.addEventListener("click", () => {
            slider.scrollBy({ left: -scrollAmount, behavior: "smooth" });
        });
    }
}

// 2. Load Daily Recommendations
async function loadDailyRecommendations() {
    try {
        const response = await fetch(`${API_BASE_URL}/recommendations/personalized`, {
            headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (response.ok) {
            const data = await response.json();

            // Render Slider
            displayRecommendations(data.slider || [], slider);

            // Render Rows
            renderSection("container-genre", data.genre_highlights || []);
            renderSection("container-interest", data.interest_trending || []);
            renderSection("container-global", data.global_top || []);

            // Update Headings
            const genreHeader = document.getElementById("header-genre");
            if (genreHeader && data.genre_name) {
                genreHeader.innerHTML = `Since you liked <span class="gold-accent">${data.genre_name}</span>`;
            }
        } else {
            fetchTrendingMovies();
        }
    } catch (error) {
        console.error("Error loading recommendations:", error);
        fetchTrendingMovies();
    }
}

// Fallback: Load trending movies
async function fetchTrendingMovies() {
    try {
        const response = await fetch(`${API_BASE_URL}/discovery/movies/trending`, {
            headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (response.ok) {
            const movies = await response.json();
            displayRecommendations(movies, slider);
        }
    } catch (error) {
        console.error("Error fetching trending movies:", error);
    }
}

function renderSection(containerId, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    displayRecommendations(items, container);
}

function displayRecommendations(items, targetContainer) {
    if (!targetContainer) return;

    targetContainer.innerHTML = "";

    if (items.length === 0) {
        targetContainer.innerHTML =
            '<p class="loading">No matches found for this category.</p>';
        return;
    }

    items.forEach((item) => {
        const anchor = document.createElement("a");
        anchor.href = "#";
        anchor.className = "rec-link";

        const img = document.createElement("img");
        img.src = item.poster_url || item.image || "https://via.placeholder.com/300x450";
        img.alt = item.title || "Content";
        img.loading = "lazy";

        anchor.appendChild(img);
        anchor.addEventListener("click", (e) => {
            e.preventDefault();
            sessionStorage.setItem("selectedContent", JSON.stringify(item));
            window.location.href = "search.html";
        });

        targetContainer.appendChild(anchor);
    });
}

// Load recommendations on page load
document.addEventListener("DOMContentLoaded", () => {
    initSlider();
    loadDailyRecommendations();
});

// Refresh recommendations every 5 minutes
setInterval(loadDailyRecommendations, 5 * 60 * 1000);