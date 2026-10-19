/* iPhone-inspired game mode wheel: one centered selection, no DB effects. */
function wrapModeIndex(value, length) {
    return ((value % length) + length) % length;
}

function createGameModes(wheel) {
    return [
        {
            name: "Ranglistenspiel",
            size: "2 gegen 2",
            icon: "bi-trophy",
            description: "Spiele mit registrierten Spielern um Glicko-2-Ratingpunkte und einen Platz in der Rangliste.",
            meta: "Mit Ranking und Spielhistorie",
            url: wheel.dataset.rankedUrl
        },
        {
            name: "Quickplay",
            size: "2 gegen 2",
            icon: "bi-lightning-charge",
            description: "Direkt Punkte erfassen, ohne Spieler oder Teams anzulegen. Das Spiel wird nicht gespeichert.",
            meta: "Ohne Rating und Historie",
            url: wheel.dataset.quickplayUrl
        },
        {
            name: "6er-Kreuzjass",
            size: "3 gegen 3",
            icon: "bi-people-fill",
            description: "Sechs Spieler in zwei Dreierteams – mit der gewohnten Punkteerfassung und ohne Rangliste.",
            meta: "Freizeitmodus ohne Rating",
            url: wheel.dataset.sixPlayerUrl
        }
    ];
}

function initModePicker() {
    const wheel = document.getElementById("mode-wheel");
    if (!wheel) return;

    const modes = createGameModes(wheel);
    const previous = document.getElementById("mode-wheel-previous");
    const current = document.getElementById("mode-wheel-current");
    const next = document.getElementById("mode-wheel-next");
    const description = document.getElementById("mode-details-description");
    const title = document.getElementById("mode-details-title");
    const meta = document.getElementById("mode-details-meta");
    const icon = document.getElementById("mode-details-icon");
    const start = document.getElementById("mode-start");

    let selected = 0;
    let startY = null;
    let pointerId = null;
    let ignoreClick = false;
    let lastWheelAt = 0;

    function fillOption(node, mode, active) {
        node.replaceChildren();
        const symbol = document.createElement("i");
        symbol.className = `bi ${mode.icon}`;
        symbol.setAttribute("aria-hidden", "true");
        const label = document.createElement("span");
        label.textContent = mode.name;
        node.append(symbol, label);
        node.setAttribute("aria-selected", active ? "true" : "false");
        node.setAttribute("aria-label", `${mode.name}, ${mode.size}`);
    }

    function renderSelection() {
        const mode = modes[selected];
        fillOption(previous, modes[wrapModeIndex(selected - 1, modes.length)], false);
        fillOption(current, mode, true);
        fillOption(next, modes[wrapModeIndex(selected + 1, modes.length)], false);

        title.replaceChildren(document.createTextNode(`${mode.name} `));
        const size = document.createElement("span");
        size.textContent = `· ${mode.size}`;
        title.append(size);
        description.textContent = mode.description;
        meta.textContent = mode.meta;

        icon.replaceChildren();
        const symbol = document.createElement("i");
        symbol.className = `bi ${mode.icon}`;
        icon.append(symbol);
        start.href = mode.url;
        start.replaceChildren(document.createTextNode(`Weiter zu ${mode.name} `));
        const arrow = document.createElement("i");
        arrow.className = "bi bi-arrow-right";
        arrow.setAttribute("aria-hidden", "true");
        start.append(arrow);
    }

    function selectMode(index) {
        selected = wrapModeIndex(index, modes.length);
        renderSelection();
    }

    document.getElementById("mode-previous").addEventListener("click", () => selectMode(selected - 1));
    document.getElementById("mode-next").addEventListener("click", () => selectMode(selected + 1));

    previous.addEventListener("click", () => {
        if (!ignoreClick) selectMode(selected - 1);
    });
    next.addEventListener("click", () => {
        if (!ignoreClick) selectMode(selected + 1);
    });

    wheel.addEventListener("keydown", event => {
        const key = event.key;
        if (key === "ArrowUp" || key === "PageUp") selectMode(selected - 1);
        else if (key === "ArrowDown" || key === "PageDown") selectMode(selected + 1);
        else if (key === "Home") selectMode(0);
        else if (key === "End") selectMode(modes.length - 1);
        else if (key === "Enter" || key === " ") {
            window.location.assign(modes[selected].url);
        } else return;
        event.preventDefault();
    });

    wheel.addEventListener("wheel", event => {
        // Scroll over the picker changes a single selection; never scrolls the page.
        event.preventDefault();
        const now = Date.now();
        if (Math.abs(event.deltaY) < 4 || now - lastWheelAt < 220) return;
        lastWheelAt = now;
        selectMode(selected + (event.deltaY > 0 ? 1 : -1));
    }, {passive: false});

    wheel.addEventListener("pointerdown", event => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        startY = event.clientY;
        pointerId = event.pointerId;
    });

    wheel.addEventListener("pointerup", event => {
        if (startY === null || event.pointerId !== pointerId) return;
        const deltaY = event.clientY - startY;
        startY = null;
        pointerId = null;
        if (Math.abs(deltaY) < 26) return;

        // Finger upwards moves the item below into the highlighted center.
        selectMode(selected + (deltaY < 0 ? 1 : -1));
        ignoreClick = true;
        window.setTimeout(() => { ignoreClick = false; }, 60);
    });

    wheel.addEventListener("pointercancel", () => {
        startY = null;
        pointerId = null;
    });

    renderSelection();
}

document.addEventListener("DOMContentLoaded", initModePicker);
