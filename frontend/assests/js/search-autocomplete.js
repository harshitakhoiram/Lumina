(() => {
    const API_BASE = "http://localhost:8000";
    const IMG_BASE = "https://image.tmdb.org/t/p/w185";
    const FALLBACK_IMG = "assests/LuminaLogo.png";

    const debounce = (fn, delay = 250) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    };

    const escapeHtml = (value) =>
        String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");

    const getPosterUrl = (item) => {
        const raw = item?.poster_url || item?.image || item?.poster_path || "";
        if (!raw) return FALLBACK_IMG;
        return raw.startsWith("http") ? raw : `${IMG_BASE}${raw}`;
    };

    const getYear = (item) => {
        const raw = item?.release_date || item?.first_air_date || "";
        return raw ? String(raw).split("-")[0] : "-";
    };

    const normalizeItem = (item, mediaType) => ({
        ...item,
        id: item?.tmdb_id || item?.id || item?.movie_id || item?.tv_id || null,
        tmdb_id: item?.tmdb_id || item?.id || item?.movie_id || item?.tv_id || null,
        title: item?.title || item?.name || "Untitled",
        poster_url: item?.poster_url || item?.image || item?.poster_path || "",
        media_type: mediaType,
        content_type: mediaType === "tv" ? "series" : "movie",
        rating: item?.rating ?? item?.vote_average ?? 0,
        release_date: item?.release_date || item?.first_air_date || ""
    });

    const rankItem = (query, item) => {
        const q = query.toLowerCase();
        const t = String(item.title || "").toLowerCase();
        if (t === q) return 0;
        if (t.startsWith(q)) return 1;
        if (t.includes(q)) return 2;
        return 3;
    };

    async function fetchJson(url) {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    }

    async function fetchSuggestions(query) {
        const [movies, series] = await Promise.all([
            fetchJson(`${API_BASE}/discovery/movies/search?q=${encodeURIComponent(query)}`),
            fetchJson(`${API_BASE}/discovery/series/search?q=${encodeURIComponent(query)}`)
        ]);

        const merged = [
            ...movies.map((item) => normalizeItem(item, "movie")),
            ...series.map((item) => normalizeItem(item, "tv"))
        ];

        const seen = new Set();
        const unique = [];

        for (const item of merged) {
            const key = `${item.media_type}-${item.tmdb_id}`;
            if (!item.tmdb_id || seen.has(key)) continue;
            seen.add(key);
            unique.push(item);
        }

        unique.sort((a, b) => rankItem(query, a) - rankItem(query, b));
        return unique.slice(0, 8);
    }

    window.initSearchAutocomplete = function initSearchAutocomplete({
        inputId,
        formId,
        dropdownId,
        onSelect
    }) {
        const input = document.getElementById(inputId);
        const form = document.getElementById(formId);
        const dropdown = document.getElementById(dropdownId);

        if (!input || !form || !dropdown) return;

        let suggestions = [];
        let activeIndex = -1;

        const hideDropdown = () => {
            dropdown.hidden = true;
            dropdown.innerHTML = "";
            activeIndex = -1;
        };

        const chooseItem = (item) => {
            input.value = item.title || "";
            hideDropdown();
            if (typeof onSelect === "function") onSelect(item);
        };

        const renderDropdown = () => {
            if (!suggestions.length) {
                hideDropdown();
                return;
            }

            dropdown.hidden = false;
            dropdown.innerHTML = suggestions.map((item, index) => `
                <button
                    type="button"
                    class="search-suggestion-item ${index === activeIndex ? "active" : ""}"
                    data-index="${index}"
                >
                    <img
                        class="search-suggestion-poster"
                        src="${getPosterUrl(item)}"
                        alt="${escapeHtml(item.title)} poster"
                    >
                    <span class="search-suggestion-copy">
                        <span class="search-suggestion-title">${escapeHtml(item.title)}</span>
                        <span class="search-suggestion-meta">
                            ${item.media_type === "tv" ? "Series" : "Movie"} · ${escapeHtml(getYear(item))}
                        </span>
                    </span>
                </button>
            `).join("");

            dropdown.querySelectorAll(".search-suggestion-item").forEach((button) => {
                button.addEventListener("click", () => {
                    const index = Number(button.dataset.index);
                    chooseItem(suggestions[index]);
                });
            });

            dropdown.querySelectorAll(".search-suggestion-poster").forEach((img) => {
                img.onerror = () => {
                    img.onerror = null;
                    img.src = FALLBACK_IMG;
                };
            });
        };

        const loadSuggestions = debounce(async () => {
            const query = input.value.trim();
            if (query.length < 2) {
                suggestions = [];
                hideDropdown();
                return;
            }

            suggestions = await fetchSuggestions(query);
            activeIndex = -1;
            renderDropdown();
        }, 250);

        input.addEventListener("input", loadSuggestions);

        input.addEventListener("focus", () => {
            if (suggestions.length) renderDropdown();
        });

        input.addEventListener("keydown", (event) => {
            if (dropdown.hidden || !suggestions.length) return;

            if (event.key === "ArrowDown") {
                event.preventDefault();
                activeIndex = (activeIndex + 1) % suggestions.length;
                renderDropdown();
            }

            if (event.key === "ArrowUp") {
                event.preventDefault();
                activeIndex = activeIndex <= 0 ? suggestions.length - 1 : activeIndex - 1;
                renderDropdown();
            }

            if (event.key === "Enter" && activeIndex >= 0) {
                event.preventDefault();
                chooseItem(suggestions[activeIndex]);
            }

            if (event.key === "Escape") {
                hideDropdown();
            }
        });

        document.addEventListener("click", (event) => {
            const clickedInside = form.contains(event.target) || dropdown.contains(event.target);
            if (!clickedInside) hideDropdown();
        });

        return { hideDropdown };
    };
})();