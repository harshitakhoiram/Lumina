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
  const languageRadios = Array.from(document.querySelectorAll('input[name="language"]'));
  const genreContainer = document.getElementById("genreOptions");
  const genreLabel = document.getElementById("genreLabel");
  const genreHint = document.getElementById("genreHint");

  // genre definitions
  const videoGenres = [
    {value:'action',label:'Action'},
    {value:'drama',label:'Drama'},
    {value:'comedy',label:'Comedy'},
    {value:'sci-fi',label:'Sci‑Fi'}
  ];
  const bookGenres = [
    {value:'fiction',label:'Fiction'},
    {value:'nonfiction',label:'Non‑fiction'},
    {value:'mystery',label:'Mystery'},
    {value:'fantasy',label:'Fantasy'}
  ];
  let genreRadios = [];

  // movie/book data sample
  let selectedLanguage = 'en';
  // placeholder actor data (would come from API based on previous selections)
  const sampleActors = ['Robert Downey Jr.','Scarlett Johansson','Leonardo DiCaprio','Meryl Streep','Denzel Washington'];
  const sampleItems = {
    video: {
      action: ['Die Hard','Mad Max','John Wick','The Matrix','Gladiator'],
      drama: ['Forrest Gump','The Shawshank Redemption','Moonlight','No Country for Old Men','The Godfather'],
      comedy: ['Superbad','Step Brothers','The Big Lebowski','Groundhog Day','Anchorman'],
      'sci-fi': ['Inception','Interstellar','Blade Runner','Arrival','Ex Machina']
    },
    books: {
      fiction: ['1984','Pride and Prejudice','The Great Gatsby','To Kill a Mockingbird','The Hobbit'],
      nonfiction: ['Sapiens','Educated','Becoming','The Wright Brothers','The Immortal Life of Henrietta Lacks'],
      mystery: ['Gone Girl','The Girl with the Dragon Tattoo','Sherlock Holmes','Big Little Lies','In the Woods'],
      fantasy: ['Harry Potter','The Name of the Wind','The Way of Kings','Mistborn','The Lies of Locke Lamora']
    }
  };

  let selectedItems = new Set();

  // user preferences object to track all selections across steps
  const userPrefs = {
    fullName: null,           // step1
    email: null,              // step1 (prefilled from landing)
    password: null,           // step1
    interest: null,           // step 2: 'video' or 'books'
    language: null,           // step 3: selected language
    genre: null,              // step 3: selected genre
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
      const selectedLang = languageRadios.find(r => r.checked);
      if (selectedLang) userPrefs.language = selectedLang.value;
      const selectedGenre = genreRadios.find(r => r.checked);
      if (selectedGenre) userPrefs.genre = selectedGenre.value;
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
    userPrefs.finalConfirmation = true;

    try {
      // first, sign the user up with credentials collected
      const signupResp = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userPrefs.fullName,
          email: userPrefs.email,
          password: userPrefs.password
        })
      });

      if (!signupResp.ok) {
        const errText = await signupResp.text();
        throw new Error(`Signup failed (${signupResp.status}): ${errText}`);
      }

      const signupData = await signupResp.json();
      const token = signupData.access_token;
      localStorage.setItem('access_token', token);

      // now save the rest of the preferences to profile endpoint
      const profilePayload = { ...userPrefs };
      // remove password before sending profile
      delete profilePayload.password;

      const profileResp = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profilePayload)
      });

      if (profileResp.ok) {
        const result = await profileResp.json();
        console.log('Profile saved successfully:', result);
        window.location.href = '/frontend/dashboard.html';
      } else {
        console.error('Profile save failed:', profileResp.status);
        alert('Error saving profile. Please try again later.');
      }
    } catch (err) {
      console.error('Error during finishOnboarding:', err);
      alert('An error occurred. Please try again.');
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
    if (step === 5) renderActors();

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
    genreContainer.innerHTML = '';
    list.forEach((g, idx) => {
      const label = document.createElement('label');
      label.className = 'radio-option';
      label.innerHTML = `
        <input type="radio" name="genre" value="${g.value}" ${idx===0?'checked':''}> <span>${g.label}</span>
      `;
      genreContainer.appendChild(label);
    });
    genreRadios = Array.from(document.querySelectorAll('input[name="genre"]'));
    // if user is already on the grid step, changing genre should refresh titles
    genreRadios.forEach(r => {
      r.addEventListener('change', () => {
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

    // render appropriate genres
    if (interest === 'video') {
      genreLabel.innerHTML = '<i class="fas fa-star"></i> favorite genre?';
      renderGenres(videoGenres);
    } else if (interest === 'books') {
      genreLabel.innerHTML = '<i class="fas fa-book"></i> favorite book genre?';
      renderGenres(bookGenres);
    }
    // update language choice
    const lang = languageRadios.find(r=>r.checked);
    if (lang) selectedLanguage = lang.value;

    // smart hint in step3
    if (interest === "video") {
      let genre = genreRadios.length ? genreRadios.find(r=>r.checked).value : videoGenres[0].value;
      hintSpan.innerText = `🎬 you like ${genre} content. any favorite title?`;
    } else if (interest === "books") {
      let genre = genreRadios.length ? genreRadios.find(r=>r.checked).value : bookGenres[0].value;
      hintSpan.innerText = `📚 ${genre} books are your thing. any recent read?`;
    }
  }

  // listeners
  interestSelect.addEventListener("change", () => {
    updateConditionalAndHint();
    // when type changes, clear previous selections
    selectedItems.clear();
    if (currentStep === 4) renderGrid();
  });
  languageRadios.forEach(r=>{
    r.addEventListener('change', ()=>{
      selectedLanguage = r.value;
      // if we're already choosing titles, re-fetch with the new language
      if (currentStep === 4) renderGrid();
    });
  });

  // enable next button in step1 when all fields are populated
  ['fullName','email','password'].forEach(id => {
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
  function renderActors() {
    const grid = document.getElementById('actorGrid');
    grid.innerHTML = '';
    selectedItems.clear();
    const list = sampleActors; 
    list.forEach(name => {
      const card = document.createElement('div');
      card.className = 'selection-card';
      card.textContent = name;
      card.addEventListener('click', () => {
        if (selectedItems.has(name)) {
          selectedItems.delete(name);
          card.classList.remove('selected');
        } else {
          selectedItems.add(name);
          card.classList.add('selected');
        }
        updateNextState();
      });
      grid.appendChild(card);
    });
  }
  // list of titles (can be replaced with API call)
  async function renderGrid() {
    const grid = document.getElementById('movieGrid');
    const captionEl = document.getElementById('step4Caption');
    const interest = interestSelect.value;
    const genre = genreRadios.length ? genreRadios.find(r=>r.checked).value : null;
    const lang = selectedLanguage;

    // show intermediate state
    grid.innerHTML = '<div class="placeholder">Loading…</div>';
    selectedItems.clear();

    // update caption to reflect language/interest
    if (captionEl) {
      const typeLabel = interest === 'video' ? 'movies/TV' : 'books';
      captionEl.innerText = `step 4/7 – ${typeLabel} (${lang.toUpperCase()}) – choose at least three`;
    }

    let list = [];

    if (genre) {
      try {
        const res = await fetch(`/api/onboarding/items?type=${interest}&genre=${genre}&lang=${lang}`);
        if (res.ok) {
          const payload = await res.json();
          list = payload.items || [];
        } else {
          console.warn('onboarding fetch failed', res.status);
        }
      } catch (err) {
        console.error('error fetching onboarding items', err);
      }
    }

    // fallback sample data when backend has no result
    if (!list.length) {
      if (interest === 'video' && genre) {
        list = (sampleItems.video[genre] || []).map(t=>`${t} (${lang})`);
      }
      if (interest === 'books' && genre) {
        list = (sampleItems.books[genre] || []).map(t=>`${t} (${lang})`);
      }
    }

    grid.innerHTML = '';

    if (!list.length) {
      grid.innerHTML = '<p class="genreHint">no items available – try a different language or genre</p>';
      return;
    }

    list.forEach(title => {
      const card = document.createElement('div');
      card.className = 'selection-card';
      card.textContent = title;
      card.addEventListener('click', () => {
        if (selectedItems.has(title)) {
          selectedItems.delete(title);
          card.classList.remove('selected');
        } else {
          selectedItems.add(title);
          card.classList.add('selected');
        }
        updateNextState();
      });
      grid.appendChild(card);
    });
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
  updateConditionalAndHint();
  updateNextState();
})();
