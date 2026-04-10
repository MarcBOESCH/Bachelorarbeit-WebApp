/**
 * utils.js
 * Globale Hilfsfunktionen für die gesamte Jass Scoring App.
 */

// Toast Benachrichtigungs-System
function showToast(message, type = "error") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const existingToasts = container.querySelectorAll(".app-toast");
    if (existingToasts.length >= 3) {
        existingToasts[0].remove();
    }

    const toast = document.createElement("div");
    toast.className = `app-toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("fade-out");

        toast.addEventListener("animationend", () => {
            toast.remove();
        });
    }, 3000);
}