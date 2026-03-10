document.addEventListener('DOMContentLoaded', async () => {
    const rawData = sessionStorage.getItem('selectedContent');
    if (!rawData) return;

    let item;
    try {
        item = JSON.parse(rawData);
    } catch {
        const titleEl = document.getElementById('dynTitle');
        if (titleEl) titleEl.innerText = "Invalid Content Data";
        return;
    }

    const pickNumericId = (...values) => {
        for (const value of values) {
            const str = String(value ?? "").trim();
            if (/^\d+$/.test(str)) return str;
        }
        return "";
    };

    const tmdbId = pickNumericId(item?.tmdb_id, item?.movie_id, item?.id);

    const API_BASE = "http://localhost:8000";
    const IMG_BASE = "https://image.tmdb.org/t/p/original";
    const FALLBACK_IMG = "assests/LuminaLogo.png";

    const titleEl = document.getElementById('dynTitle');
    const ratingEl = document.getElementById('dynRating');
    const posterEl = document.getElementById('dynPoster');
    const sidebarImageEl = document.getElementById('sidebarImage');
    const overviewEl = document.getElementById('dynOverview');
    const genresEl = document.getElementById('dynGenres');
    const yearEl = document.getElementById('titleYear');
    const directorEl = document.getElementById('dynDirector');
    const starsEl = document.getElementById('dynStars');

    if (titleEl) titleEl.innerText = item.title || "Loading...";
    if (ratingEl) ratingEl.innerText = item.rating || item.vote_average || "7.6";

    const posterPath = item.poster_path || item.image || item.poster_url || "";
    const posterUrl = posterPath
        ? (posterPath.startsWith('http') ? posterPath : `${IMG_BASE}${posterPath}`)
        : FALLBACK_IMG;

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

    if (!tmdbId) {
        if (overviewEl) {
            overviewEl.innerText =
                item.overview ||
                "Detailed information is unavailable for this item.";
        }
        if (genresEl && item.content_type) genresEl.innerText = item.content_type;
        if (directorEl) directorEl.innerText = "-";
        if (starsEl) starsEl.innerText = "-";
        if (yearEl) yearEl.innerText = "";
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/discovery/movie/${encodeURIComponent(tmdbId)}`);
        if (!response.ok) throw new Error(`Failed to fetch full details (${response.status})`);

        const fullDetails = await response.json();

        if (overviewEl) {
            overviewEl.innerText = fullDetails.overview || "No description available.";
        }

        if (genresEl && fullDetails.genres?.length) {
            genresEl.innerText = fullDetails.genres.join(', ');
        }

        if (yearEl && fullDetails.release_date) {
            yearEl.innerText = `(${fullDetails.release_date.split('-')[0]})`;
        }

        if (directorEl && fullDetails.director) {
            directorEl.innerText = fullDetails.director;
        }

        if (fullDetails.cast?.length) {
            const stars = fullDetails.cast.slice(0, 3).map(c => c.name || c).join(', ');
            if (starsEl) starsEl.innerText = stars;
            renderCastTable(fullDetails.cast);
        }
    } catch (err) {
        console.error("Detail fetch error:", err);
        if (overviewEl) {
            overviewEl.innerText = item.overview || "Could not load detailed summary.";
        }
    }
});

function renderCastTable(cast) {
    const table = document.getElementById('dynCastTable');
    if (!table) return;

    table.innerHTML = "";
    const FALLBACK_IMG = "assests/LuminaLogo.png";

    cast.slice(0, 10).forEach((person, index) => {
        const row = table.insertRow();
        row.className = index % 2 === 0 ? 'even' : 'odd';

        const profileImg = person.profile_path
            ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
            : FALLBACK_IMG;

        row.innerHTML = `
            <td style="width:50px">
                <img src="${profileImg}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
            </td>
            <td><strong>${person.name || person}</strong></td>
            <td style="color:#666">...</td>
            <td>${person.character || 'Cast Member'}</td>
        `;

        const img = row.querySelector('img');
        if (img) {
            img.onerror = () => {
                img.onerror = null;
                img.src = FALLBACK_IMG;
            };
        }
    });
}