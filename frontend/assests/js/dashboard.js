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

// 1. Slider Navigation
const slider = document.getElementById("daily-recommendations");
const nextBtn = document.getElementById("nextBtn");
const prevBtn = document.getElementById("prevBtn");

if (nextBtn && prevBtn && slider) {
    const scrollAmount = 320;

    nextBtn.addEventListener("click", () => {
        slider.scrollBy({ left: scrollAmount, behavior: "smooth" });
    });

    prevBtn.addEventListener("click", () => {
        slider.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    });
}

// 2. Load Daily Recommendations
async function loadDailyRecommendations() {
    try {
        const response = await fetch(`${API_BASE_URL}/recommendations`, {
            headers: { Authorization: `Bearer ${currentToken}` },
        });

        if (response.ok) {
            const data = await response.json();
            displayRecommendations(data.items || []);
        } else {
            // Fallback: fetch trending movies
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
            displayRecommendations(movies);
        }
    } catch (error) {
        console.error("Error fetching trending movies:", error);
    }
}

function displayRecommendations(items) {
    if (!slider) return;

    slider.innerHTML = "";

    if (items.length === 0) {
        slider.innerHTML =
            '<p class="loading">Start searching to get personalized recommendations!</p>';
        return;
    }

    items.forEach((item) => {
        const anchor = document.createElement("a");
        anchor.href = "#";
        anchor.className = "rec-link";

        const img = document.createElement("img");
        img.src = item.image || item.poster_url || "https://via.placeholder.com/300x450";
        img.alt = item.title || "Content";
        img.loading = "lazy";

        anchor.appendChild(img);
        anchor.addEventListener("click", (e) => {
            e.preventDefault();
            sessionStorage.setItem("selectedContent", JSON.stringify(item));
            window.location.href = "search.html";
        });

        slider.appendChild(anchor);
    });
}

// Load recommendations on page load
loadDailyRecommendations();

// Refresh recommendations every 5 minutes
setInterval(loadDailyRecommendations, 5 * 60 * 1000);