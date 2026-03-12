// API Configuration
// This file sets the API base URL for all frontend calls
// Update this based on your deployment environment

(function() {
  // Production API URL (update with your Render backend URL)
  // Example: https://lumina-api-xxxx.onrender.com
  const API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:8000'
    : 'https://your-render-api-url.onrender.com'; // REPLACE THIS

  // Make API_BASE_URL globally available
  window.API_BASE_URL = API_URL;
  window.API_BASE = API_URL;
  window.WATCHLIST_API_BASE = API_URL;
})();
