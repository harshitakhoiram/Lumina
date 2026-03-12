const API_BASE_URL = window.API_BASE_URL || "http://localhost:8000";
const PROFILE_ENDPOINT = `${API_BASE_URL}/auth/me/profile`;
const MEDIA_ENDPOINT = `${API_BASE_URL}/auth/me/profile/media`;
const accessToken = localStorage.getItem("access_token");

if (!accessToken) {
    window.location.href = "index.html";
}

const LANG_LABELS = {
    en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', ta: 'Tamil',
    te: 'Telugu', ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', mr: 'Marathi',
    de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese', ko: 'Korean',
    zh: 'Chinese', ru: 'Russian', ar: 'Arabic', th: 'Thai', tr: 'Turkish'
};

const state = { original: null, editing: false };

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
    };
}

function toArray(value) {
    if (Array.isArray(value)) {
        // Each element might itself be a PostgreSQL array literal like "{comedy}"
        return value.flatMap(s => toArray(s));
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        // Handle PostgreSQL array literal format: {item1,item2,item3}
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            const inner = trimmed.slice(1, -1);
            return inner.split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
        }
        return trimmed.split(",").map(s => s.trim()).filter(Boolean);
    }
    return [];
}

function toCsv(value) {
    return toArray(value).join(", ");
}

function setStatus(message = "", type = "") {
    const el = document.getElementById("profileStatus");
    el.textContent = message;
    el.className = `status-message ${type}`.trim();
}

function renderLanguages(langs) {
    const container = document.getElementById("languageDisplay");
    const items = toArray(langs);
    container.innerHTML = items.length
        ? items.map(code => `<span class="lang-badge">${LANG_LABELS[code] || (code ? code.toUpperCase() : "")}</span>`).join("")
        : `<span class="lang-badge" style="opacity:0.45">Not set</span>`;
}

function renderGenreChips(genres) {
    const container = document.getElementById("genresDisplay");
    const items = toArray(genres);
    container.innerHTML = items.length
        ? items.map(g => `<span class="lang-badge">${escapeHtml(g)}</span>`).join("")
        : `<span class="lang-badge" style="opacity:0.45">None selected</span>`;
}

function renderPosterGrid(movies) {
    const grid = document.getElementById("titlesGrid");
    if (!movies || !movies.length) {
        grid.innerHTML = `<p class="media-placeholder">No titles saved.</p>`;
        return;
    }
    grid.innerHTML = movies.map(m => `
        <div class="poster-card">
            <img src="${m.image || 'assests/LuminaLogo.png'}" alt="${escapeHtml(m.title)}" onerror="this.src='assests/LuminaLogo.png'">
            <p class="poster-title">${escapeHtml(m.title)}</p>
        </div>
    `).join("");
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function fillForm(profile) {
    document.getElementById("profileName").value = profile.name || "";
    document.getElementById("profileEmail").value = profile.email || "";
    document.getElementById("profileTitles").value = toCsv(profile.selected_titles);
    const langs = profile.languages && profile.languages.length ? profile.languages : (profile.language ? [profile.language] : []);
    document.getElementById("profileLanguage").value = langs.join(", ");
    document.getElementById("profileGenres").value = toCsv(profile.genres);
    renderLanguages(langs);
    renderGenreChips(profile.genres);
}

function readForm() {
    const langs = toArray(document.getElementById("profileLanguage").value);
    return {
        name: document.getElementById("profileName").value.trim(),
        language: langs[0] || "",
        languages: langs,
        genres: toArray(document.getElementById("profileGenres").value),
        selected_titles: toArray(document.getElementById("profileTitles").value),
        selected_actors: toArray(state.original?.selected_actors || [])
    };
}

function setEditMode(enabled) {
    state.editing = enabled;
    document.getElementById("profileName").disabled = !enabled;

    document.querySelectorAll(".view-only").forEach(el => el.classList.toggle("hidden", enabled));
    document.querySelectorAll(".edit-only").forEach(el => {
        el.classList.toggle("hidden", !enabled);
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
            el.disabled = !enabled;
        }
    });

    document.getElementById("profileActions").classList.toggle("hidden", !enabled);
    document.getElementById("editBtn").classList.toggle("hidden", enabled);
}

async function loadProfile() {
    setStatus("Loading profile...");
    const response = await fetch(PROFILE_ENDPOINT, { method: "GET", headers: authHeaders() });
    if (!response.ok) throw new Error("Failed to load profile");
    const data = await response.json();
    state.original = data;
    fillForm(data);
    setStatus("");
}

async function loadMedia() {
    const response = await fetch(MEDIA_ENDPOINT, { method: "GET", headers: authHeaders() });
    if (!response.ok) return;
    const data = await response.json();
    renderPosterGrid(data.movies);
}

async function saveProfile(event) {
    event.preventDefault();
    setStatus("Saving changes...");

    const payload = readForm();
    const response = await fetch(PROFILE_ENDPOINT, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("Failed to save profile");

    const updated = await response.json();
    state.original = updated;
    fillForm(updated);
    setEditMode(false);

    // Reload visual grids after save
    document.getElementById("titlesGrid").innerHTML = `<span class="media-placeholder">Reloading…</span>`;
    loadMedia();

    setStatus("Profile updated successfully.", "success");
}

function bindEvents() {
    document.getElementById("editBtn").addEventListener("click", () => {
        setEditMode(true);
        setStatus("");
    });

    document.getElementById("cancelBtn").addEventListener("click", () => {
        if (state.original) fillForm(state.original);
        setEditMode(false);
        setStatus("");
    });

    document.getElementById("profileForm").addEventListener("submit", async (event) => {
        try {
            await saveProfile(event);
        } catch (error) {
            console.error(error);
            setStatus("Could not save profile.", "error");
        }
    });

    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("user_id");
        sessionStorage.clear();
        window.location.href = "index.html";
    });
}

document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    setEditMode(false);
    try {
        await loadProfile();
        loadMedia(); // fire-and-forget: posters load in background
    } catch (error) {
        console.error(error);
        setStatus("Could not load profile.", "error");
    }
});