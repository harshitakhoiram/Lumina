// Search Page Logic

const API_BASE_URL = "http://localhost:8000";
let currentToken = localStorage.getItem("access_token");
let selectedContentId = null;
let selectedContentType = null;
let currentFilter = "all";
let userRating = 0;

// DOM Elements
const searchInput = document.getElementById("searchInput");
const filterButtons = document.querySelectorAll(".filter-btn");
const resultsSection = document.getElementById("searchResults");
const recommendationsSection = document.getElementById("recommendationsSection");
const resultsGrid = document.getElementById("resultsGrid");
const recommendationsGrid = document.getElementById("recommendationsGrid");
const noResults = document.getElementById("noResults");
const loadingSpinner = document.getElementById("loadingSpinner");
const detailModal = document.getElementById("detailModal");
const ratingModal = document.getElementById("ratingModal");
const closeModalBtn = document.querySelector(".close-modal");
const closeRatingBtn = document.querySelector(".close-rating");

// Navigation
document.getElementById("homeBtn").addEventListener("click", () => {
    window.location.href = "index.html";
});

document.getElementById("dashboardBtn").addEventListener("click", () => {
    window.location.href = "dashboard.html";
});

document.getElementById("profileBtn").addEventListener("click", () => {
    window.location.href = "profile.html";
});

document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_id");
    window.location.href = "index.html";
});

// Check authentication
if (!currentToken) {
    window.location.href = "index.html";
}

// Filter button event listeners
filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        filterButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentFilter = btn.dataset.type;
        if (searchInput.value.trim()) {
            searchContent(searchInput.value);
        }
    });
});

// Search with debounce
let searchTimeout;
searchInput.addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();

    if (query.length === 0) {
        hideAll();
        return;
    }

    searchTimeout = setTimeout(() => {
        searchContent(query);
    }, 500);
});

async function searchContent(query) {
    showSpinner();
    hideAll();

    try {
        const results = [];

        // Search movies
        if (currentFilter === "all" || currentFilter === "movie") {
            const movieRes = await fetch(
                `${API_BASE_URL}/discovery/movies/search?q=${encodeURIComponent(query)}`,
                {
                    headers: { Authorization: `Bearer ${currentToken}` },
                }
            );
            if (movieRes.ok) {
                const movies = await movieRes.json();
                results.push(...movies);
            }
        }

        // Search series
        if (currentFilter === "all" || currentFilter === "series") {
            const seriesRes = await fetch(
                `${API_BASE_URL}/discovery/series/search?q=${encodeURIComponent(query)}`,
                {
                    headers: { Authorization: `Bearer ${currentToken}` },
                }
            );
            if (seriesRes.ok) {
                const series = await seriesRes.json();
                results.push(...series);
            }
        }

        // Search books
        if (currentFilter === "all" || currentFilter === "book") {
            const bookRes = await fetch(
                `${API_BASE_URL}/discovery/books/search?q=${encodeURIComponent(query)}`,
                {
                    headers: { Authorization: `Bearer ${currentToken}` },
                }
            );
            if (bookRes.ok) {
                const books = await bookRes.json();
                results.push(...books);
            }
        }

        hideSpinner();

        if (results.length === 0) {
            noResults.classList.remove("hidden");
            return;
        }

        displayResults(results);
        resultsSection.classList.remove("hidden");
    } catch (error) {
        console.error("Search error:", error);
        hideSpinner();
        noResults.classList.remove("hidden");
    }
}
function displayResults(items) {
    resultsGrid.innerHTML = "";

    items.forEach((item) => {
        const card = createContentCard(item);
        resultsGrid.appendChild(card);
    });
}

function createContentCard(item) {
    const card = document.createElement("div");
    card.className = "content-card";

    // Determine content type and structure
    let title = item.title || "Unknown";
    let image = item.image || item.poster_url || "https://via.placeholder.com/200x300?text=No+Image";
    let rating = item.rating || "N/A";
    let type = item.content_type || "unknown";

    // Handle both API response formats
    if (item.volumeInfo) {
        // Google Books format
        title = item.volumeInfo.title;
        image = item.volumeInfo.imageLinks?.thumbnail || image;
        type = "book";
        rating = "Book";
    } else if (item.id && !item.authors) {
        // TMDB format
        type = item.content_type || "movie";
    }

    card.innerHTML = `
        <img src="${image}" alt="${title}" />
        <div class="content-info">
            <div class="content-title">${title}</div>
            <div class="content-type">${type}</div>
            <div class="content-rating">⭐ ${rating}</div>
        </div>
    `;

    card.addEventListener("click", () => {
        selectedContentId = item.id || item.content_id;
        selectedContentType = type;
        // Navigate to detail page
        window.location.href = `detail.html?id=${selectedContentId}`;
    });

    return card;
}

function showDetailModal(item) {
    const title = item.title || item.volumeInfo?.title || "Unknown";
    const image = item.image || item.poster_url || item.volumeInfo?.imageLinks?.thumbnail || "https://via.placeholder.com/200x300";
    const rating = item.rating || "N/A";
    const description = item.description || item.overview || item.volumeInfo?.description || "No description available.";
    const releaseDate = item.release_date || "";

    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalPoster").src = image;
    document.getElementById("modalType").textContent = selectedContentType?.toUpperCase();
    document.getElementById("modalRating").textContent = `⭐ Rating: ${rating}`;
    document.getElementById("modalDescription").textContent = description;
    document.getElementById("modalReleaseDate").textContent = releaseDate
        ? `Released: ${releaseDate}`
        : "";

    detailModal.classList.remove("hidden");
}

function closeModal() {
    detailModal.classList.add("hidden");
    ratingModal.classList.add("hidden");
}

closeModalBtn.addEventListener("click", closeModal);
closeRatingBtn.addEventListener("click", closeModal);

detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) closeModal();
});

ratingModal.addEventListener("click", (e) => {
    if (e.target === ratingModal) closeModal();
});

// Like button
document.getElementById("likeBtn").addEventListener("click", async () => {
    if (!selectedContentId) return;
    try {
        const res = await fetch(`${API_BASE_URL}/interactions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${currentToken}`,
            },
            body: JSON.stringify({
                content_id: selectedContentId,
                interaction_type: "like",
            }),
        });
        if (res.ok) {
            alert("Liked! ❤️");
            closeModal();
        }
    } catch (error) {
        console.error("Error liking:", error);
    }
});

// Bookmark button
document.getElementById("bookmarkBtn").addEventListener("click", async () => {
    if (!selectedContentId) return;
    try {
        const res = await fetch(`${API_BASE_URL}/interactions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${currentToken}`,
            },
            body: JSON.stringify({
                content_id: selectedContentId,
                interaction_type: "bookmark",
            }),
        });
        if (res.ok) {
            alert("Bookmarked! 🔖");
            closeModal();
        }
    } catch (error) {
        console.error("Error bookmarking:", error);
    }
});

// Rate button
document.getElementById("rateBtn").addEventListener("click", () => {
    userRating = 0;
    ratingModal.classList.remove("hidden");
    document.querySelectorAll(".star").forEach((star) => {
        star.classList.remove("active");
    });
});

// Star rating
document.querySelectorAll(".star").forEach((star) => {
    star.addEventListener("click", (e) => {
        userRating = e.target.dataset.value;
        document.querySelectorAll(".star").forEach((s) => {
            s.classList.remove("active");
        });
        for (let i = 0; i < userRating; i++) {
            document.querySelectorAll(".star")[i].classList.add("active");
        }
    });
});

// Submit rating
document.getElementById("submitRating").addEventListener("click", async () => {
    if (!selectedContentId || !userRating) {
        alert("Please select a rating!");
        return;
    }
    try {
        const res = await fetch(`${API_BASE_URL}/interactions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${currentToken}`,
            },
            body: JSON.stringify({
                content_id: selectedContentId,
                interaction_type: "rate",
                rating_value: parseInt(userRating),
            }),
        });
        if (res.ok) {
            alert(`Rated ${userRating} stars! ⭐`);
            closeModal();
        }
    } catch (error) {
        console.error("Error rating:", error);
    }
});

// Fetch recommendations based on selected content
async function fetchRecommendations(contentId, type) {
    try {
        let recommendations = [];

        if (type === "movie" || type === "series") {
            const res = await fetch(`${API_BASE_URL}/discovery/movies/similar/${contentId}`, {
                headers: { Authorization: `Bearer ${currentToken}` },
            });
            if (res.ok) {
                recommendations = await res.json();
            }
        } else if (type === "book") {
            // For books, use author/category based recommendation
            const res = await fetch(
                `${API_BASE_URL}/discovery/books/similar?author=Unknown&category=General`,
                {
                    headers: { Authorization: `Bearer ${currentToken}` },
                }
            );
            if (res.ok) {
                recommendations = await res.json();
            }
        }

        if (recommendations.length > 0) {
            displayRecommendations(recommendations);
            recommendationsSection.classList.remove("hidden");
        }
    } catch (error) {
        console.error("Error fetching recommendations:", error);
    }
}

function displayRecommendations(items) {
    recommendationsGrid.innerHTML = "";
    items.forEach((item) => {
        const card = createContentCard(item);
        recommendationsGrid.appendChild(card);
    });
}

function showSpinner() {
    loadingSpinner.classList.remove("hidden");
}

function hideSpinner() {
    loadingSpinner.classList.add("hidden");
}

function hideAll() {
    resultsSection.classList.add("hidden");
    recommendationsSection.classList.add("hidden");
    noResults.classList.add("hidden");
}

// Initial focus on search input
searchInput.focus();
