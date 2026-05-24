/**
 * Lumina Landing Page Logic
 * Targets: index.html
 */

document.addEventListener("DOMContentLoaded", () => {
    // --- 1. FAQ ACCORDION LOGIC ---
    const accordionItems = document.querySelectorAll(".accordion-item");

    accordionItems.forEach((item) => {
        const header = item.querySelector(".faq-header");
        
        if (header) {
            header.addEventListener("click", () => {
                const isActive = item.classList.contains("active");

                // Close all other items first
                accordionItems.forEach((el) => {
                    el.classList.remove("active");
                    const content = el.querySelector(".paragraph"); 
                    if (content) content.style.maxHeight = null;
                });

                // Open the clicked item
                if (!isActive) {
                    item.classList.add("active");
                    const content = item.querySelector(".paragraph");
                    if (content) {
                        content.style.maxHeight = content.scrollHeight + "px";
                    }
                }
            });
        }
    });

    // --- 2. FORM SUBMISSION (Onboarding) ---
    const emailForms = document.querySelectorAll(".email");
    emailForms.forEach(form => {
        form.addEventListener("submit", (e) => {
            e.preventDefault();
            const input = form.querySelector("input");
            if (input && !input.classList.contains("error")) {
                const email = input.value.trim();
                console.log("Lumina: get started with", email);
                // store temporarily and navigate to onboarding
                sessionStorage.setItem('onboardingEmail', email);
                window.location.href = 'onboarding.html';
            }
        });
    });

    // --- 3. SIGN IN NAVIGATION ---
    // Select the Sign In button by its class from index.html
    const signInBtn = document.querySelector(".sign-btn");
    if (signInBtn) {
        signInBtn.addEventListener("click", (e) => {
            e.preventDefault(); // Prevent default anchor behavior
            window.location.href = 'login.html';
        });
    }

    loadLandingPosters().catch((error) => {
        console.error("Unable to load landing posters:", error);
    });
});

function buildApiUrl(path, params = {}) {
    const apiBase = window.API_BASE_URL || "http://127.0.0.1:8000";
    const query = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        query.set(key, String(value));
    });

    return `${apiBase}${path}${query.size ? `?${query.toString()}` : ""}`;
}

function proxyImage(url) {
    const raw = String(url || "").trim();
    if (!raw) return "assests/LuminaLogo.png";
    if (raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("assests/")) return raw;
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return buildApiUrl("/discovery/image-proxy", { url: raw });
    }
    return raw;
}

function renderPosterSlot(element, item, fallbackLabel) {
    if (!element) return;

    const posterUrl = proxyImage(item?.poster_url || item?.poster_path || item?.image || "");
    element.innerHTML = "";
    element.style.backgroundImage = `url('${posterUrl}')`;
    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
    element.style.backgroundRepeat = "no-repeat";
    element.setAttribute("aria-label", fallbackLabel || item?.title || "Featured poster");
    element.setAttribute("role", "img");
}

async function loadLandingPosters() {
    const response = await fetch(buildApiUrl("/discovery/movies/trending"));
    if (!response.ok) {
        throw new Error(`Failed to fetch landing posters (${response.status})`);
    }

    const items = await response.json();
    const movies = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!movies.length) return;

    renderPosterSlot(document.getElementById("movieOfDayPoster"), movies[0], "Movie of the day poster");

    const releaseSlots = [
        document.getElementById("newReleasePoster1"),
        document.getElementById("newReleasePoster2"),
        document.getElementById("newReleasePoster3"),
    ];

    releaseSlots.forEach((slot, index) => {
        renderPosterSlot(slot, movies[index + 1] || movies[index] || movies[0], `New release poster ${index + 1}`);
    });
}

// --- 4. VALIDATION FUNCTIONS ---
function validateEmailField(inputClass, messageClass) {
    const input = document.querySelector(inputClass);
    const message = document.querySelector(messageClass);
    const pattern = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;

    if (!input || !message) return;

    if (pattern.test(input.value.trim())) {
        message.innerHTML = " ";
        input.classList.remove("error");
    } else if (input.value.length === 0) {
        message.innerHTML = "Email is required!";
        input.classList.add("error");
    } else {
        message.innerHTML = "Please enter a valid email address.";
        input.classList.add("error");
    }
}

function emailInputMessage() { validateEmailField(".em-input", ".email-message"); }
function emailFaqInputMessage() { validateEmailField(".em-input-faq", ".email-message-faq"); }