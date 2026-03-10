document.addEventListener('DOMContentLoaded', () => {
    const rawData = sessionStorage.getItem('selectedContent');
    if (!rawData) {
        window.location.href = 'dashboard.html';
        return;
    }

    const item = JSON.parse(rawData);
    const IMG_BASE = "https://image.tmdb.org/t/p/original";

    // 1. Basic Info
    document.getElementById('dynTitle').innerHTML = `${item.title} <span id="titleYear" class="grey">(${item.release_date?.split('-')[0] || '2026'})</span>`;
    document.getElementById('dynRating').innerText = item.vote_average || "7.6";
    document.getElementById('dynOverview').innerText = item.overview || "Description not available.";
    document.getElementById('dynReleaseDate').innerText = item.release_date || "Coming Soon";

    // 2. Images
   const posterPath = item.poster_path || item.poster_url || item.image;
   const fallbackImage = "https://via.placeholder.com/300x450?text=No+Poster+Available";

   document.getElementById('dynPoster').src = posterPath 
      ? (posterPath.startsWith('http') ? posterPath : `${IMG_BASE}${posterPath}`)
      : fallbackImage;
   document.getElementById('sidebarImage').src = document.getElementById('dynPoster').src;

    // 3. Dynamic Cast Table (Simulated from item data)
    const castTable = document.getElementById('dynCastTable');
    if (item.stars || item.cast) {
        const actors = item.stars || ["Lead Actor", "Supporting Actor"];
        actors.forEach((actor, index) => {
            const row = castTable.insertRow();
            row.className = index % 2 === 0 ? 'even' : 'odd';
            row.innerHTML = `
                <td class="primary_photo"><i class="fas fa-user-circle fa-2x"></i></td>
                <td class="itemprop"><strong>${actor}</strong></td>
                <td class="ellipsis">...</td>
                <td class="character">Main Character</td>
            `;
        });
    }
});