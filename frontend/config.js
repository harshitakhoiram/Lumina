// API Configuration
// This file sets the API base URL for all frontend calls
// Update this based on your deployment environment

(function() {
  // Production API URL (update with your Render backend URL)
  // Example: https://lumina-api-xxxx.onrender.com
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  const API_URL = isLocalHost
    ? 'http://127.0.0.1:8000'
    : 'https://lumina-spzz.onrender.com';

  // Make API_BASE_URL globally available
  window.API_BASE_URL = API_URL;
  window.API_BASE = API_URL;
  window.WATCHLIST_API_BASE = API_URL;
})();
