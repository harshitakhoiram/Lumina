// assests/js/login.js
const API_BASE = window.API_BASE_URL || "http://localhost:8000";

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = e.target.querySelector('button');

    // Button Loading State
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Authenticating...';
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // Save required identity data for your teammate's dashboard stability
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('user_id', data.user_id);
            
            // Redirect to dashboard
            window.location.href = 'dashboard.html';
        } else {
            alert(data.detail || "Login failed. Please check your email and password.");
            btn.innerHTML = 'Login <i class="fas fa-sign-in-alt"></i>';
            btn.disabled = false;
        }
    } catch (err) {
        console.error("Login connection error:", err);
        alert("Server error. Please ensure your FastAPI backend is running.");
        btn.innerHTML = 'Login <i class="fas fa-sign-in-alt"></i>';
        btn.disabled = false;
    }
});