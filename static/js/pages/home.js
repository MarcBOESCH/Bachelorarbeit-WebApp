/* Horizontal, swipeable and keyboard-accessible carousel for the 3 game modes. */
function createGameModes(carousel) {
    return [
        {
            name: "Quickplay",
            description: "Direkt Punkte erfassen, ohne Spieler oder Teams anzulegen. Das Spiel wird nicht gespeichert.",
            url: carousel.dataset.quickplayUrl
        },
        {
            name: "Ranglistenspiel",
            description: "Spiele mit registrierten Spielern um Glicko-2-Ratingpunkte und einen Platz in der Rangliste.",
            url: carousel.dataset.rankedUrl
        },
        {
            name: "6er-Kreuzjass",
            description: "Sechs Spieler in zwei Dreierteams – mit der gewohnten Punkteerfassung und ohne Rangliste.",
            url: carousel.dataset.sixPlayerUrl
        }
    ];
}

function initModePicker() {
    const carousel = document.getElementById("mode-carousel");
    if (!carousel) return;

    const modes = createGameModes(carousel);
    const cards = Array.from(carousel.querySelectorAll(".mode-carousel-card"));
    const dots = Array.from(document.querySelectorAll(".mode-carousel-dot"));
    const previous = document.getElementById("mode-previous");
    const next = document.getElementById("mode-next");
    const description = document.getElementById("mode-details-description");
    const start = document.getElementById("mode-start");
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let selected = 0;
    let scrollTimer = null;
    let lastWheelAt = 0;

    function centerCard(index, behavior = "smooth") {
        const card = cards[index];
        const cardRect = card.getBoundingClientRect();
        const carouselRect = carousel.getBoundingClientRect();
        const targetLeft = carousel.scrollLeft + (cardRect.left + cardRect.width / 2)
            - (carouselRect.left + carouselRect.width / 2);

        carousel.scrollTo({
            left: targetLeft,
            behavior: prefersReducedMotion ? "instant" : behavior
        });
    }

    function updateSelection(index, scroll = false, behavior = "smooth") {
        selected = Math.max(0, Math.min(index, modes.length - 1));
        const mode = modes[selected];

        cards.forEach((card, cardIndex) => {
            const active = cardIndex === selected;
            card.classList.toggle("is-active", active);
            card.setAttribute("aria-selected", String(active));
        });
        carousel.setAttribute("aria-activedescendant", cards[selected].id);

        dots.forEach((dot, dotIndex) => {
            const active = dotIndex === selected;
            dot.classList.toggle("is-active", active);
            if (active) dot.setAttribute("aria-current", "true");
            else dot.removeAttribute("aria-current");
        });

        previous.disabled = selected === 0;
        next.disabled = selected === modes.length - 1;
        description.textContent = mode.description;
        start.href = mode.url;
        start.replaceChildren(document.createTextNode(`Weiter zu ${mode.name} `));
        const arrow = document.createElement("i");
        arrow.className = "bi bi-arrow-right";
        arrow.setAttribute("aria-hidden", "true");
        start.append(arrow);

        if (scroll) centerCard(selected, behavior);
    }

    function closestCenteredCard() {
        const carouselRect = carousel.getBoundingClientRect();
        const centerX = carouselRect.left + carouselRect.width / 2;
        let closest = 0;
        let minDistance = Infinity;

        cards.forEach((card, index) => {
            const rect = card.getBoundingClientRect();
            const distance = Math.abs(rect.left + rect.width / 2 - centerX);
            if (distance < minDistance) {
                minDistance = distance;
                closest = index;
            }
        });
        return closest;
    }

    previous.addEventListener("click", () => updateSelection(selected - 1, true));
    next.addEventListener("click", () => updateSelection(selected + 1, true));

    cards.forEach((card, index) => card.addEventListener("click", () => {
        updateSelection(index, true);
        carousel.focus({preventScroll: true});
    }));

    dots.forEach((dot, index) => dot.addEventListener("click", () => updateSelection(index, true)));

    carousel.addEventListener("scroll", () => {
        window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(() => {
            updateSelection(closestCenteredCard());
        }, 100);
    }, {passive: true});

    carousel.addEventListener("keydown", event => {
        if (event.key === "ArrowLeft") updateSelection(selected - 1, true);
        else if (event.key === "ArrowRight") updateSelection(selected + 1, true);
        else if (event.key === "Home") updateSelection(0, true);
        else if (event.key === "End") updateSelection(modes.length - 1, true);
        else if (event.key === "Enter" || event.key === " ") {
            window.location.assign(modes[selected].url);
        } else return;
        event.preventDefault();
    });

    carousel.addEventListener("wheel", event => {
        // Horizontal trackpad swipes are native; vertical mouse wheels step cards.
        if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
        if (Math.abs(event.deltaY) < 8) return;
        event.preventDefault();
        const now = Date.now();
        if (now - lastWheelAt < 280) return;
        lastWheelAt = now;
        updateSelection(selected + Math.sign(event.deltaY), true);
    }, {passive: false});

    window.addEventListener("resize", () => centerCard(selected, "instant"), {passive: true});

    updateSelection(0);
}

document.addEventListener("DOMContentLoaded", initModePicker);
