const API_BASE_URL = "http://localhost:8000";
const PROFILE_ENDPOINT = `${API_BASE_URL}/auth/me/profile`;
const accessToken = localStorage.getItem("access_token");

if (!accessToken) {
    window.location.href = "index.html";
}

const state = {
    original: null,
    editing: false
};

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
    };
}

function toArray(value) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }

    if (typeof value === "string") {
        return value.split(",").map((item) => item.trim()).filter(Boolean);
    }

    return [];
}

function toCsv(value) {
    return toArray(value).join(", ");
}

function setStatus(message = "", type = "") {
    const status = document.getElementById("profileStatus");
    status.textContent = message;
    status.className = `status-message ${type}`.trim();
}

function renderChips(containerId, values, emptyLabel = "None selected") {
    const container = document.getElementById(containerId);
    const items = toArray(values);

    container.innerHTML = items.length
        ? items.map((item) => `<span class="chip">${item}</span>`).join("")
        : `<span class="chip">${emptyLabel}</span>`;
}

function fillForm(profile) {
    document.getElementById("profileName").value = profile.name || "";
    document.getElementById("profileEmail").value = profile.email || "";
    document.getElementById("profileTitles").value = toCsv(profile.selected_titles);
    document.getElementById("profileLanguage").value = profile.language || "";
    document.getElementById("profileGenres").value = toCsv(profile.genres);
    document.getElementById("profileActors").value = toCsv(profile.selected_actors);

    renderChips("titlesPreview", profile.selected_titles);
    renderChips("genresPreview", profile.genres);
    renderChips("actorsPreview", profile.selected_actors);
}

function readForm() {
    return {
        name: document.getElementById("profileName").value.trim(),
        language: document.getElementById("profileLanguage").value.trim(),
        genres: toArray(document.getElementById("profileGenres").value),
        selected_titles: toArray(document.getElementById("profileTitles").value),
        selected_actors: toArray(document.getElementById("profileActors").value)
    };
}

function setEditMode(enabled) {
    state.editing = enabled;

    document.getElementById("profileName").disabled = !enabled;
    document.getElementById("profileTitles").disabled = !enabled;
    document.getElementById("profileLanguage").disabled = !enabled;
    document.getElementById("profileGenres").disabled = !enabled;
    document.getElementById("profileActors").disabled = !enabled;

    document.getElementById("profileActions").classList.toggle("hidden", !enabled);
    document.getElementById("editBtn").classList.toggle("hidden", enabled);
}

async function loadProfile() {
    setStatus("Loading profile...");

    const response = await fetch(PROFILE_ENDPOINT, {
        method: "GET",
        headers: authHeaders()
    });

    if (!response.ok) {
        throw new Error("Failed to load profile");
    }

    const data = await response.json();
    state.original = data;
    fillForm(data);
    setStatus("");
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

    if (!response.ok) {
        throw new Error("Failed to save profile");
    }

    const updated = await response.json();
    state.original = updated;
    fillForm(updated);
    setEditMode(false);
    setStatus("Profile updated successfully.", "success");
}

function bindEvents() {
    document.getElementById("editBtn").addEventListener("click", () => {
        setEditMode(true);
        setStatus("");
    });

    document.getElementById("cancelBtn").addEventListener("click", () => {
        if (state.original) {
            fillForm(state.original);
        }
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
    } catch (error) {
        console.error(error);
        setStatus("Could not load profile.", "error");
    }
});