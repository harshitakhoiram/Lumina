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
});

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