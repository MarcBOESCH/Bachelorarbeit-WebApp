/**
 * utils.js
 * Globale Hilfsfunktionen für die gesamte Jass Scoring App.
 */

// Toast Benachrichtigungs-System
function showToast(message, type = "error") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `app-toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Nach 3 Sekunden verschwinden lassen
    setTimeout(() => {
        toast.classList.add("fade-out");

        toast.addEventListener("animationend", () => {
            toast.remove();
        });
    }, 3000);
}