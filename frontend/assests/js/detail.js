(function() {
  const API_URL = "http://localhost:8000/discovery";
  
  let currentContentId = null;
  let currentRating = 0;
  const state = {
    liked: false,
    bookmarked: false,
    rated: false
  };

  // Get content ID from URL params
  function getContentIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  // Fetch and render content detail
  async function loadContentDetail() {
    const contentId = getContentIdFromUrl();
    if (!contentId) {
      showError();
      return;
    }
    currentContentId = contentId;

    try {
      const response = await fetch(`${API_URL}/content/${contentId}`);
      if (!response.ok) {
        showError();
        return;
      }
      const content = await response.json();
      renderContent(content);
    } catch (err) {
      console.error("Error loading content:", err);
      showError();
    }
  }

  function renderContent(content) {
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("contentDetail").classList.remove("hidden");

    // Title & basic info
    document.getElementById("contentTitle").textContent = content.title || "";
    document.getElementById("contentType").textContent = content.content_type?.toUpperCase() || "CONTENT";
    document.getElementById("rating").innerHTML = `<i class="fas fa-star"></i> ${content.rating || "N/A"}/10`;
    document.getElementById("releaseDate").textContent = content.release_date || "";
    document.getElementById("runtime").innerHTML = content.runtime ? `<i class="fas fa-clock"></i> ${content.runtime} min` : "";

    // Backdrop & poster
    if (content.image) {
      document.getElementById("backdropImage").style.backgroundImage = `url(${content.image})`;
      document.getElementById("posterImage").src = content.image;
    }

    // Overview
    document.getElementById("overview").textContent = content.overview || "No description available.";

    // Genres
    if (content.genres && Array.isArray(content.genres)) {
      const genresContainer = document.getElementById("genres");
      genresContainer.innerHTML = content.genres.map(g => `<span>${g}</span>`).join("");
    }

    // Cast
    renderCast(content.cast || []);

    // Director
    if (content.director) {
      document.getElementById("directorSection").classList.remove("hidden");
      document.getElementById("director").textContent = content.director;
    }

    // Language & Publisher
    document.getElementById("language").textContent = content.language || "-";
    document.getElementById("contentTypeDetail").textContent = content.content_type || "-";
    
    if (content.publisher) {
      document.getElementById("publisherSection").classList.remove("hidden");
      document.getElementById("publisher").textContent = content.publisher;
    }

    // External links
    if (content.tmdb_url) {
      document.getElementById("tmdbLink").href = content.tmdb_url;
    }
    if (content.imdb_id) {
      document.getElementById("imdbLink").href = `https://www.imdb.com/title/${content.imdb_id}/`;
      document.getElementById("imdbLink").classList.remove("hidden");
    }

    // Section visibility for content type
    if (content.content_type === "book") {
      document.getElementById("castSection")?.parentElement.classList.add("hidden");
    }
  }

  function renderCast(cast) {
    const castGrid = document.getElementById("castGrid");
    castGrid.innerHTML = "";
    
    if (!cast || !Array.isArray(cast) || cast.length === 0) {
      castGrid.innerHTML = "<p style='grid-column: 1/-1; color: #aaa;'>No cast information available</p>";
      return;
    }

    cast.slice(0, 12).forEach(member => {
      const name = typeof member === "string" ? member : member.name || member;
      const role = member.character || member.role || "";
      
      const card = document.createElement("div");
      card.className = "cast-member";
      card.innerHTML = `
        <div style="background: #333; height: 150px; display: flex; align-items: center; justify-content: center; color: #666;">
          <i class="fas fa-user" style="font-size: 3rem;"></i>
        </div>
        <div class="cast-member-name">${name}</div>
        ${role ? `<div class="cast-member-role">${role}</div>` : ""}
      `;
      castGrid.appendChild(card);
    });
  }

  function showError() {
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("contentDetail").classList.add("hidden");
    document.getElementById("errorState").classList.remove("hidden");
  }

  // Action button handlers
  function setupEventListeners() {
    // Like button
    document.getElementById("likeBtn").addEventListener("click", async () => {
      await trackInteraction("like");
      state.liked = !state.liked;
      updateLikeButton();
    });

    // Bookmark button
    document.getElementById("bookmarkBtn").addEventListener("click", async () => {
      await trackInteraction("bookmark");
      state.bookmarked = !state.bookmarked;
      updateBookmarkButton();
    });

    // Rate button
    document.getElementById("rateBtn").addEventListener("click", () => {
      openRatingModal();
    });

    // Rating modal star selection
    document.querySelectorAll("#starRating i").forEach(star => {
      star.addEventListener("click", () => {
        currentRating = parseInt(star.getAttribute("data-rating"));
        updateStarDisplay();
      });

      star.addEventListener("mouseover", () => {
        const rating = parseInt(star.getAttribute("data-rating"));
        document.querySelectorAll("#starRating i").forEach((s, idx) => {
          if (idx < rating) {
            s.classList.add("active");
          } else {
            s.classList.remove("active");
          }
        });
      });
    });

    document.getElementById("starRating").addEventListener("mouseleave", updateStarDisplay);

    // Submit rating
    document.getElementById("submitRatingBtn").addEventListener("click", async () => {
      if (currentRating > 0) {
        await trackInteraction("rate", currentRating);
        state.rated = true;
        updateRateButton();
        closeRatingModal();
      }
    });

    // Close modal
    document.querySelector(".close-modal").addEventListener("click", closeRatingModal);
    document.getElementById("ratingModal").addEventListener("click", (e) => {
      if (e.target.id === "ratingModal") closeRatingModal();
    });
  }

  async function trackInteraction(action, rating = null) {
    try {
      const payload = {
        content_id: currentContentId,
        action: action,
        rating: rating
      };

      const response = await fetch(`${API_URL}/interactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`Interaction recorded:`, result.message);
      }
    } catch (err) {
      console.error("Error tracking interaction:", err);
    }
  }

  function updateLikeButton() {
    const btn = document.getElementById("likeBtn");
    if (state.liked) {
      btn.classList.add("active");
      btn.innerHTML = '<i class="fas fa-heart"></i> Liked';
    } else {
      btn.classList.remove("active");
      btn.innerHTML = '<i class="far fa-heart"></i> Like';
    }
  }

  function updateBookmarkButton() {
    const btn = document.getElementById("bookmarkBtn");
    if (state.bookmarked) {
      btn.classList.add("active");
      btn.innerHTML = '<i class="fas fa-bookmark"></i> Bookmarked';
    } else {
      btn.classList.remove("active");
      btn.innerHTML = '<i class="far fa-bookmark"></i> Bookmark';
    }
  }

  function updateRateButton() {
    const btn = document.getElementById("rateBtn");
    if (state.rated && currentRating > 0) {
      btn.classList.add("active");
      btn.innerHTML = `<i class="fas fa-star"></i> ${currentRating}/10`;
    }
  }

  function updateStarDisplay() {
    document.querySelectorAll("#starRating i").forEach((star, idx) => {
      if (idx < currentRating) {
        star.classList.add("active");
      } else {
        star.classList.remove("active");
      }
    });
    document.getElementById("ratingDisplay").textContent = currentRating > 0 ? `Rating: ${currentRating}/10` : "Click to rate";
  }

  function openRatingModal() {
    document.getElementById("ratingModal").classList.remove("hidden");
    updateStarDisplay();
  }

  function closeRatingModal() {
    document.getElementById("ratingModal").classList.add("hidden");
  }

  // Initialize
  setupEventListeners();
  loadContentDetail();
})();
