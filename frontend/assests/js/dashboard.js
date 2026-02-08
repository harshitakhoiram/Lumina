// 1. Handling the "Swipe" logic
const slider = document.getElementById('daily-recommendations');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');

nextBtn.addEventListener('click', () => {
  slider.scrollLeft += 320; // Width of image + gap
});

prevBtn.addEventListener('click', () => {
  slider.scrollLeft -= 320;
});

// 2. The Dynamic Fetch (Connect to your Backend)
async function loadDailyRecommendations() {
  try {
    // Replace with your actual Render URL later
    const response = await fetch('http://127.0.0.1:8000/api/recommendations/daily');
    const data = await response.json(); 

    slider.innerHTML = ''; // Clear the loading text

    data.forEach(item => {
      const anchor = document.createElement('a');
      anchor.href = `/content-details.html?id=${item.id}`;
      
      const img = document.createElement('img');
      img.src = item.image_url; 
      img.alt = item.title;

      anchor.appendChild(img);
      slider.appendChild(anchor);
    });
  } catch (error) {
    console.error("Failed to load recommendations:", error);
  }
}

// Call the function when page loads
loadDailyRecommendations();

//the loadDailyRecommendations() function waits for your FastAPI backend to send a list of movies.
// For every movie the database finds, the JavaScript automatically creates a new image and puts it inside the slider. 
// If your DB has 5 movies today, you'll see 5. If it has 20 tomorrow, the slider will simply grow longer and let you swipe more.