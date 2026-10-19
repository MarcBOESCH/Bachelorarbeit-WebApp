/* 6er-Kreuzjass uses the same player selection rules as ranked 2v2:
   existing registered players, create-on-search, unique choices across teams. */
const sixPlayerSelection = {
    allPlayers: [],
    selects: new Map(),
    syncing: false
};

function sixSelectionKeys() {
    return ["a", "b"].flatMap(side =>
        [1, 2, 3].map(position => `team-${side}-player-${position}`)
    );
}

function sixSelectionValues() {
    return sixSelectionKeys().map(key => ({
        key,
        id: sixPlayerSelection.selects.get(key)?.getValue() || ""
    }));
}

function sixSelectedNames(side) {
    return [1, 2, 3].map(position => {
        const select = sixPlayerSelection.selects.get(`team-${side}-player-${position}`);
        const player = sixPlayerSelection.allPlayers.find(p => String(p.id) === String(select?.getValue()));
        return player?.name || "";
    });
}

function sixPlayerSelectionReady() {
    const ids = sixSelectionValues().map(item => item.id);
    return ids.length === 6 && ids.every(Boolean) && new Set(ids).size === 6;
}

function refreshSixPlayerOptions() {
    if (sixPlayerSelection.syncing) return;
    sixPlayerSelection.syncing = true;
    try {
        const entries = sixSelectionValues();
        const selections = entries.map(entry => entry.id).filter(Boolean);
        for (const {key, id} of entries) {
            const select = sixPlayerSelection.selects.get(key);
            if (!select) continue;

            // Mirror the ranked 2v2 lock: a selected player stays available
            // in their own field, but disappears from the other five.
            select.clearOptions();
            for (const player of sixPlayerSelection.allPlayers) {
                const value = String(player.id);
                if (value === String(id) || !selections.includes(value)) {
                    select.addOption(player);
                }
            }
            select.refreshOptions(false);
            if (id) select.setValue(id, true);
        }
    } finally {
        sixPlayerSelection.syncing = false;
    }
}

function updateSixPlayerPreview() {
    const selected = sixSelectionValues();
    const allIds = selected.map(entry => entry.id).filter(Boolean);
    const complete = sixPlayerSelectionReady();

    for (const side of ["a", "b"]) {
        const name = document.getElementById(`team-${side}-custom-name`).value.trim() ||
            `Team ${side.toUpperCase()}`;
        const names = sixSelectedNames(side);
        document.getElementById(`preview-team-${side}-name`).textContent = name;
        document.getElementById(`preview-team-${side}-players`).textContent =
            names.filter(Boolean).join(" & ") || "–";
    }

    for (const {key, id} of selected) {
        const suffix = key.slice("team-".length).replace("-player-", "-");
        document.getElementById(`chosen-player-${suffix}`).value = id;
    }

    document.getElementById("match-preview-card").classList.toggle("d-none", allIds.length === 0);
    document.getElementById("start-match-btn").disabled = !complete;

    const error = document.getElementById("six-player-error");
    error.classList.toggle("d-none", allIds.length === 0 || complete);
    error.textContent = !complete && allIds.length > 0
        ? "Bitte sechs unterschiedliche Spieler auswählen."
        : "";
}

async function createSixPlayer(input) {
    const name = String(input).trim();
    if (!name) return null;
    try {
        const response = await fetch("/api/players", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({name})
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || "Spieler konnte nicht erstellt werden.", "error");
            return null;
        }
        const created = data.player;
        sixPlayerSelection.allPlayers.push(created);
        for (const select of sixPlayerSelection.selects.values()) {
            select.addOption(created);
        }
        return created;
    } catch (error) {
        console.error("Fehler beim Erstellen:", error);
        showToast("Verbindung zum Server fehlgeschlagen.", "error");
        return null;
    }
}

async function initSixPlayerSelection() {
    try {
        const response = await fetch("/api/players");
        if (!response.ok) throw new Error("Spielerliste konnte nicht geladen werden.");

        sixPlayerSelection.allPlayers = await response.json();
        for (const key of sixSelectionKeys()) {
            const select = new TomSelect(`#${key}`, {
                valueField: "id",
                labelField: "name",
                searchField: "name",
                options: sixPlayerSelection.allPlayers,
                placeholder: "Spieler suchen oder erstellen...",
                render: {
                    option_create(data, escape) {
                        return `<div class="create text-success fw-bold">
                            <i class="bi bi-person-plus-fill"></i> Spieler "${escape(data.input)}" anlegen...
                        </div>`;
                    }
                },
                create: async function (input, callback) {
                    const player = await createSixPlayer(input);
                    callback(player || false);
                },
                onChange() {
                    if (!sixPlayerSelection.syncing) {
                        refreshSixPlayerOptions();
                        updateSixPlayerPreview();
                    }
                }
            });
            sixPlayerSelection.selects.set(key, select);
        }

        for (const side of ["a", "b"]) {
            document.getElementById(`team-${side}-custom-name`).addEventListener(
                "input", updateSixPlayerPreview
            );
        }

        document.getElementById("six-player-selection-form").addEventListener("submit", event => {
            updateSixPlayerPreview();
            if (!sixPlayerSelectionReady()) {
                event.preventDefault();
                showToast("Bitte sechs unterschiedliche Spieler auswählen.", "error");
            }
        });
        refreshSixPlayerOptions();
        updateSixPlayerPreview();
    } catch (error) {
        console.error(error);
        showToast("Spielerliste konnte nicht geladen werden.", "error");
    }
}

document.addEventListener("DOMContentLoaded", initSixPlayerSelection);
