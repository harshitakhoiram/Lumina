(function () {
  // state
  let currentStep = 1;
  const totalSteps = 7;

  const step1 = document.getElementById("step1");
  const step2 = document.getElementById("step2");
  const step3 = document.getElementById("step3");
  const step4 = document.getElementById("step4");
  const step5 = document.getElementById("step5");
  const step6 = document.getElementById("step6");
  const step7 = document.getElementById("step7");
  const steps = [step1, step2, step3, step4, step5, step6, step7];

  const badges = [
    document.getElementById("step1Badge"),
    document.getElementById("step2Badge"),
    document.getElementById("step3Badge"),
    document.getElementById("step4Badge"),
    document.getElementById("step5Badge"),
    document.getElementById("step6Badge"),
    document.getElementById("step7Badge")
  ];

  const progressFill = document.getElementById("progressFill");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  // interactive elements
  const interestSelect = document.getElementById("interestSelect");
  const conditionalBlock = document.getElementById("conditionalDevBlock");
  const hintSpan = document.getElementById("hintText");
  const languageContainer = document.getElementById("languageOptions");
  const genreContainer = document.getElementById("genreOptions");
  const genreLabel = document.getElementById("genreLabel");
  const genreHint = document.getElementById("genreHint");
  const API_BASE = window.API_BASE_URL ||
    ((window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost")
      ? "http://127.0.0.1:8000"
      : "https://lumina-spzz.onrender.com");

  function buildApiUrl(path, params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      query.set(key, String(value));
    });
    return `${API_BASE}${path}${query.size ? `?${query.toString()}` : ''}`;
  }

  async function readErrorMessage(response, fallbackMessage) {
    try {
      const data = await response.json();
      if (typeof data?.detail === 'string' && data.detail.trim()) {
        return data.detail;
      }
      if (typeof data?.message === 'string' && data.message.trim()) {
        return data.message;
      }
    } catch (_) {
      // Ignore JSON parse issues and fall back to status text.
    }

    return `${fallbackMessage} (${response.status})`;
  }

  // genre definitions
  const fallbackVideoGenres = [
    { value: 'action', label: 'Action' },
    { value: 'drama', label: 'Drama' },
    { value: 'comedy', label: 'Comedy' },
    { value: 'sci-fi', label: 'Sci‑Fi' }
  ];
  const fallbackBookGenres = [
    { value: 'fiction', label: 'Fiction' },
    { value: 'nonfiction', label: 'Non‑fiction' },
    { value: 'mystery', label: 'Mystery' },
    { value: 'fantasy', label: 'Fantasy' }
  ];
  let genreRadios = [];
  const optionsCache = { video: null, books: null };
  const allowedOnboardingLanguages = [
    'en', 'fr', 'de', 'zh', 'ja', 'kn', 'hi', 'te', 'ta', 'ml', 'es', 'ko', 'th'
  ];

  // movie/book data sample
  let selectedLanguages = ['en'];
  let selectedItems = new Set();

  function getLanguageInputs() {
    return Array.from(document.querySelectorAll('input[name="language"]'));
  }

  function languageLabel(code) {
    const key = String(code || '').trim().toLowerCase();
    if (!key) return 'Unknown';

    // Normalize common non-standard values seen in dataset.
    const aliases = {
      cn: 'zh',
      jp: 'ja',
      kr: 'ko'
    };
    const normalized = aliases[key] || key;

    const manual = {
      en: 'English', hi: 'Hindi', es: 'Spanish', fr: 'French', ta: 'Tamil', te: 'Telugu',
      ml: 'Malayalam', kn: 'Kannada', bn: 'Bengali', mr: 'Marathi', de: 'German', it: 'Italian',
      pt: 'Portuguese', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian', ar: 'Arabic',
      he: 'Hebrew', no: 'Norwegian', et: 'Estonian', fi: 'Finnish', af: 'Afrikaans', cs: 'Czech',
      lv: 'Latvian', pl: 'Polish', sr: 'Serbian', th: 'Thai', tl: 'Tagalog', tr: 'Turkish'
    };

    let name = manual[normalized] || '';
    if (!name && typeof Intl !== 'undefined' && Intl.DisplayNames) {
      try {
        const display = new Intl.DisplayNames(['en'], { type: 'language' });
        name = display.of(normalized) || '';
      } catch (_) {
        name = '';
      }
    }

    if (!name) {
      name = normalized.toUpperCase();
    }

    return name;
  }

  function onLanguageChange(changedInput = null) {
    const inputs = getLanguageInputs();
    const selected = inputs.filter(i => i.checked).map(i => i.value);
    if (!selected.length && changedInput) {
      changedInput.checked = true;
      return;
    }

    selectedLanguages = selected.length ? selected : ['en'];
    userPrefs.languages = [...selectedLanguages];
    userPrefs.language = selectedLanguages[0] || 'en';
    if (currentStep === 4) renderGrid();
  }

  function renderLanguageOptions(languages) {
    // API returns [{value, label}, ...]; normalize to code strings
    const normalize = (lang) => String(lang?.value || lang || '').trim().toLowerCase();
    const dbSet = new Set(
      (Array.isArray(languages) && languages.length ? languages : []).map(normalize)
    );
    const previous = new Set(selectedLanguages);
    // Only show languages from our curated list; if db has data, further
    // restrict to those present in db (skip restriction if db returned nothing).
    const curated = dbSet.size > 0
      ? allowedOnboardingLanguages.filter((code) => dbSet.has(code))
      : [...allowedOnboardingLanguages];

    languageContainer.innerHTML = '';
    curated.forEach((langCode) => {
      const code = String(langCode || '').trim().toLowerCase();
      if (!code) return;
      const label = document.createElement('label');
      label.className = 'radio-option';
      label.innerHTML = `<input type="checkbox" name="language" value="${code}"> <span>${languageLabel(code)}</span>`;
      languageContainer.appendChild(label);
    });

    const inputs = getLanguageInputs();
    inputs.forEach((input) => {
      input.checked = previous.has(input.value) || (!previous.size && input.value === 'en');
      input.addEventListener('change', () => onLanguageChange(input));
    });

    if (!inputs.some(i => i.checked) && inputs.length) {
      inputs[0].checked = true;
    }
    onLanguageChange();
  }

  async function loadDynamicOptionsForInterest(interest) {
    if (!interest) return;
    if (!optionsCache[interest]) {
      try {
        const response = await fetch(buildApiUrl('/discovery/onboarding/options', { type: interest }));
        if (response.ok) {
          optionsCache[interest] = await response.json();
        }
      } catch (error) {
        console.warn('Failed to load onboarding options', error);
      }
    }

    const options = optionsCache[interest] || {};
    const genres = Array.isArray(options.genres) && options.genres.length
      ? options.genres
      : (interest === 'books' ? fallbackBookGenres : fallbackVideoGenres);
    const languages = Array.isArray(options.languages) && options.languages.length
      ? options.languages
      : allowedOnboardingLanguages;

    renderGenres(genres);
    renderLanguageOptions(languages);
  }

  // user preferences object to track all selections across steps
  const userPrefs = {
    fullName: null,           // step1
    email: null,              // step1 (prefilled from landing)
    password: null,           // step1
    interest: null,           // step 2: 'video' or 'books'
    language: null,           // step 3: legacy primary language
    languages: [],            // step 3: selected languages
    genre: [],                // step 3: selected genres (ARRAY)
    selectedTitles: [],       // step 4: array of selected movie/book titles
    selectedActors: [],       // step 5: array of selected actors/authors
    favoriteContent: null,    // step 6: favorite from selections
    finalConfirmation: false  // step 7: user confirmed
  };

  // save selections when leaving each step
  function saveStepSelections() {
    if (currentStep === 1) {
      const nameEl = document.getElementById('fullName');
      const emailEl = document.getElementById('email');
      const pwdEl = document.getElementById('password');
      if (nameEl) userPrefs.fullName = nameEl.value.trim();
      if (emailEl) userPrefs.email = emailEl.value.trim();
      if (pwdEl) userPrefs.password = pwdEl.value;
    } else if (currentStep === 2) {
      userPrefs.interest = interestSelect.value;
    } else if (currentStep === 3) {
      const selectedLangs = getLanguageInputs().filter(r => r.checked).map(r => r.value);
      selectedLanguages = selectedLangs.length ? selectedLangs : ['en'];
      userPrefs.languages = [...selectedLanguages];
      userPrefs.language = selectedLanguages[0] || 'en';
      const selectedGenres = Array.from(document.querySelectorAll('input[name="genre"]:checked')).map(cb => cb.value);
      userPrefs.genre = selectedGenres;
    } else if (currentStep === 4) {
      userPrefs.selectedTitles = Array.from(selectedItems);
      selectedItems.clear();
    } else if (currentStep === 5) {
      userPrefs.selectedActors = Array.from(selectedItems);
      selectedItems.clear();
    }
  }

  // POST user preferences to backend
  async function finishOnboarding() {
    // 1. Final state sync: ensure the last selections are captured
    userPrefs.finalConfirmation = true;
    userPrefs.selectedActors = Array.from(selectedItems); // Capture Step 5 selections

    try {
      nextBtn.disabled = true; // Prevent double clicks
      nextBtn.innerHTML = `Finishing... <i class="fas fa-spinner fa-spin"></i>`;

      // Step A: Try Sign up
      let signupResp = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userPrefs.fullName,
          email: userPrefs.email,
          password: userPrefs.password
        })
      });

      let token, userId;

      if (signupResp.ok) {
        const signupData = await signupResp.json();
        token = signupData.access_token;
        userId = signupData.user_id;
      } else if (signupResp.status === 400) {
        // Fallback: Try Login if email exists
        console.log("Email exists, trying login fallback...");
        const loginResp = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userPrefs.email,
            password: userPrefs.password
          })
        });
        if (loginResp.ok) {
          const loginData = await loginResp.json();
          token = loginData.access_token;
          userId = loginData.user_id;
        } else {
          throw new Error("User exists but login failed. Check password.");
        }
      } else {
        throw new Error("Signup failed with status " + signupResp.status);
      }

      localStorage.setItem('access_token', token);
      localStorage.setItem('user_id', userId);

      // Step B: Save the complete profile (preferences)
      const profilePayload = {
        interest: userPrefs.interest,
        language: userPrefs.language,
        languages: userPrefs.languages,
        genre: userPrefs.genre,
        selectedTitles: userPrefs.selectedTitles,
        selectedActors: userPrefs.selectedActors,
        favoriteContent: userPrefs.selectedTitles[0] || null
      };

      const profileResp = await fetch(`${API_BASE}/auth/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profilePayload)
      });

      if (profileResp.ok) {
        console.log('Onboarding complete!');
        window.location.href = 'dashboard.html';
      } else {
        alert('Error saving your preferences. Please try again.');
        nextBtn.disabled = false;
        nextBtn.innerHTML = `finish <i class="fas fa-check"></i>`;
      }
    } catch (err) {
      console.error('Final Step Error:', err);
      alert(err.message || 'An error occurred during finish.');
      nextBtn.disabled = false;
      nextBtn.innerHTML = `finish <i class="fas fa-check"></i>`;
    }
  }
  // step change
  function showStep(step) {
    steps.forEach((s, idx) => {
      if (idx + 1 === step) s.classList.remove("hidden-step");
      else s.classList.add("hidden-step");
    });
    // if returning to step1, pre‑populate fields from userPrefs
    if (step === 1) {
      const nameEl = document.getElementById('fullName');
      const emailEl = document.getElementById('email');
      const pwdEl = document.getElementById('password');
      if (nameEl && userPrefs.fullName) nameEl.value = userPrefs.fullName;
      if (emailEl && userPrefs.email) emailEl.value = userPrefs.email;
      if (pwdEl && userPrefs.password) pwdEl.value = userPrefs.password;
      updateNextState();
    }
    // if entering grid step
    if (step === 4) renderGrid();
    if (step === 5) renderPeople();

    // update badges
    badges.forEach((badge, idx) => {
      const stepNum = idx + 1;
      badge.classList.remove("active", "completed");
      if (stepNum === step) {
        badge.classList.add("active");
      } else if (stepNum < step) {
        badge.classList.add("completed");
        if (stepNum === totalSteps) badge.innerHTML = '<i class="fas fa-check"></i>';
        else badge.innerText = stepNum;
      } else {
        if (stepNum === totalSteps) badge.innerHTML = '<i class="fas fa-check"></i>';
        else badge.innerText = stepNum;
      }
    });

    const progressPercent = ((step - 1) / (totalSteps - 1)) * 100;
    progressFill.style.width = progressPercent + "%";

    prevBtn.disabled = step === 1;
    if (step === totalSteps) {
      nextBtn.innerHTML = `finish <i class="fas fa-check"></i>`;
    } else {
      nextBtn.innerHTML = `next <i class="fas fa-arrow-right"></i>`;
    }
    // disable next during movie/actor selection until minimum reached
    if (step === 4 || step === 5) {
      updateNextState();
    }
  }

  // conditional + hint update (conversational logic)
  // build genre radio inputs for given list
  function renderGenres(list) {
    const prevSelected = new Set(userPrefs.genre || []);
    genreContainer.innerHTML = '';
    list.forEach((g) => {
      const label = document.createElement('label');
      label.className = 'radio-option';
      label.innerHTML = `
        <input type="checkbox" name="genre" value="${g.value}" ${prevSelected.has(g.value) ? 'checked' : ''}> <span>${g.label}</span>
      `;
      genreContainer.appendChild(label);
    });
    genreRadios = Array.from(document.querySelectorAll('input[name="genre"]'));
    // if user is already on the grid step, changing genre should refresh titles
    genreRadios.forEach(r => {
      r.addEventListener('change', () => {
        userPrefs.genre = Array.from(document.querySelectorAll('input[name="genre"]:checked')).map(cb => cb.value);
        updateConditionalAndHint();
        if (currentStep === 4) renderGrid();
      });
    });
  }

  function updateConditionalAndHint() {
    const interest = interestSelect.value;
    if (interest === "video" || interest === "books") {
      conditionalBlock.classList.remove("hidden-step");
    } else {
      conditionalBlock.classList.add("hidden-step");
    }

    if (interest === 'video') {
      genreLabel.innerHTML = '<i class="fas fa-star"></i> favorite genre?';
    } else if (interest === 'books') {
      genreLabel.innerHTML = '<i class="fas fa-book"></i> favorite book genre?';
    }

    // smart hint in step3
    if (interest === "video") {
      let selected = Array.from(document.querySelectorAll('input[name="genre"]:checked')).map(cb => cb.value);
      let genreText = selected.length > 0 ? selected.join(' & ') : "something";
      hintSpan.innerText = `🎬 you like ${genreText} content. any favorite title?`;
    } else if (interest === "books") {
      let selected = Array.from(document.querySelectorAll('input[name="genre"]:checked')).map(cb => cb.value);
      let genreText = selected.length > 0 ? selected.join(' & ') : "something";
      hintSpan.innerText = `📚 ${genreText} books are your thing. any recent read?`;
    }
  }

  // listeners
  interestSelect.addEventListener("change", () => {
    userPrefs.interest = interestSelect.value;
    loadDynamicOptionsForInterest(userPrefs.interest);
    updateConditionalAndHint();
    // when type changes, clear previous selections
    selectedItems.clear();
    if (currentStep === 4) renderGrid();
  });

  // enable next button in step1 when all fields are populated
  ['fullName', 'email', 'password'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updateNextState);
    }
  });

  // navigation
  function goToNext() {
    // if at final step, submit the profile
    if (currentStep === totalSteps) {
      finishOnboarding();
      return;
    }

    // save current step selections before moving forward
    saveStepSelections();

    if (currentStep < totalSteps) {
      currentStep++;
    } else return;
    showStep(currentStep);
    if (currentStep === 3) updateConditionalAndHint();
  }

  function goToPrev() {
    if (currentStep > 1) {
      currentStep--;
    }
    showStep(currentStep);
    if (currentStep === 3) updateConditionalAndHint();
  }

  nextBtn.addEventListener("click", goToNext);
  prevBtn.addEventListener("click", goToPrev);

  // helper for actor/author grid
  async function renderPeople() {
    const grid = document.getElementById('actorGrid');
    const titleEl = document.querySelector('#step5 .step-title');
    const captionEl = document.getElementById('step5Caption');
    const interest = interestSelect.value;
    if (interest === 'books') {
      titleEl.innerHTML = 'Pick some Authors <span class="gold-accent">✍️</span>';
      captionEl.innerText = 'step 5/7 - choose your favorite writers';
    } else {
      titleEl.innerHTML = 'Pick some Stars <span class="gold-accent">🌟</span>';
      captionEl.innerText = 'step 5/7 - choose a few favorites';
    }
    grid.innerHTML = '<div class="loading">✨ Finding your possible favs...</div>';
    selectedItems.clear();

    try {
      const response = await fetch(`${API_BASE}/discovery/onboarding/people`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titles: Array.from(userPrefs.selectedTitles),
          genres: userPrefs.genre.join(','), // Pass selected genres
          lang: selectedLanguages.join(','),
          type: interest
        })
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Could not load people'));
      }

      const data = await response.json();
      const peopleList = data.people || [];

      grid.innerHTML = ''; // Clear loading

      peopleList.forEach(item => { // We will use 'item' for consistency
        const card = document.createElement('div');
        card.className = 'selection-card';
        card.innerHTML = `
        <img src="${item.image}" alt="${item.name}" onerror="this.src='assests/LuminaLogo.png'" style="border-radius: 50%; width: 100px; height: 100px; object-fit: cover; margin-bottom: 10px;">
        <p>${item.name}</p>
    `;

        card.addEventListener('click', () => {
          card.classList.toggle('selected');
          // FIX: Use 'item.name' instead of 'person.name'
          if (selectedItems.has(item.name)) {
            selectedItems.delete(item.name);
          } else {
            selectedItems.add(item.name);
          }
          updateNextState();
        });
        grid.appendChild(card);
      });
    } catch (err) {
      console.error("People fetch error:", err);
      grid.innerHTML = `<p class="error">${err.message || 'Could not load people.'}</p>`;
    }
  }

  async function renderGrid() {
    const grid = document.getElementById('movieGrid');
    const interest = interestSelect.value;
    const selectedGenres = Array.from(document.querySelectorAll('input[name="genre"]:checked')).map(cb => cb.value);
    const genre = selectedGenres.join(','); // Pass as comma-separated
    const lang = selectedLanguages.join(',');

    grid.innerHTML = '<div class="loading">✨ Curating your matches...</div>';
    selectedItems.clear();

    try {
      const res = await fetch(buildApiUrl('/discovery/onboarding/items', {
        type: interest,
        genre,
        lang
      }));

      if (!res.ok) {
        throw new Error(await readErrorMessage(res, 'Could not load titles'));
      }

      const data = await res.json();
      const list = data.items;

      grid.innerHTML = ''; // Clear loading message

      if (list.length === 0) {
        grid.innerHTML = '<p class="error">No titles found for this selection. Try another genre!</p>';
        return;
      }

      list.forEach(item => {
        const card = document.createElement('div');
        card.className = 'selection-card';
        // Now using the real image path from TMDB/Google Books
        card.innerHTML = `
                <img src="${item.image}" alt="${item.title}" onerror="this.src='assests/LuminaLogo.png'">
                <p>${item.title}</p>
            `;

        card.addEventListener('click', () => {
          card.classList.toggle('selected');
          if (selectedItems.has(item.title)) {
            selectedItems.delete(item.title);
          } else {
            selectedItems.add(item.title);
          }
          updateNextState();
        });
        grid.appendChild(card);
      });
    } catch (err) {
      console.error("Fetch error:", err);
      grid.innerHTML = `<p class="error">${err.message || 'Connection failed. Is the backend running?'}</p>`;
    }
  }
  function updateNextState() {
    if (currentStep === 1) {
      // require name, email, and password
      const nameEl = document.getElementById('fullName');
      const emailEl = document.getElementById('email');
      const pwdEl = document.getElementById('password');
      nextBtn.disabled =
        !(nameEl && nameEl.value.trim() &&
          emailEl && emailEl.value.trim() &&
          pwdEl && pwdEl.value);
    }
    if (currentStep === 4) {
      nextBtn.disabled = selectedItems.size < 3;
    }
    if (currentStep === 5) {
      nextBtn.disabled = selectedItems.size < 2;
    }
  }

  // prefill email from landing page if available
  const landingEmail = sessionStorage.getItem('onboardingEmail');
  if (landingEmail) {
    const emailEl = document.getElementById('email');
    if (emailEl) {
      emailEl.value = landingEmail;
      userPrefs.email = landingEmail;
    }
    // clear session storage so it doesn't leak
    sessionStorage.removeItem('onboardingEmail');
  }

  // init
  showStep(1);
  userPrefs.interest = interestSelect.value;
  loadDynamicOptionsForInterest(userPrefs.interest).then(() => {
    updateConditionalAndHint();
  });
  updateNextState();
})();
