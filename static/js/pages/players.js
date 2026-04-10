// Lädt alle Spieler aus der API und rendert sie in die Spielerliste.
async function loadPlayers() {
    try {
        const response = await fetch("/api/players");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /api/players:", response.status, text);
            showToast(`Fehler beim Laden der Spieler (${response.status}).`, "error");
            return;
        }

        const players = await response.json();
        renderPlayers(players);
    } catch (error) {
        console.error("Fehler beim Laden der Spieler:", error);
        showToast("Spieler konnten nicht geladen werden.", "error");
    }
}

// Erstellt einen neuen Spieler über die API.
async function createPlayer() {
    const input = document.getElementById("player-name");
    if (!input) return;

    const name = input.value.trim();

    if (name === "") {
        showToast("Bitte einen Spielernamen eingeben.", "error");
        return;
    }

    try {
        const response = await fetch("/api/players", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Fehler beim Erstellen des Spielers.", "error");
            return;
        }

        input.value = "";
        showToast("Spieler erfolgreich erstellt.", "success");
        await loadPlayers();
    } catch (error) {
        console.error("Fehler beim Erstellen des Spielers:", error);
        showToast("Verbindung zum Server fehlgeschlagen.", "error");
    }
}

// Bearbeitet den Namen eines vorhandenen Spielers.
async function handleEditPlayer(playerId, currentName) {
    const newName = prompt("Neuen Namen eingeben:", currentName);

    if (newName === null) return;

    const trimmedName = newName.trim();

    if (trimmedName === "") {
        showToast("Der Name darf nicht leer sein.", "error");
        return;
    }

    try {
        const response = await fetch(`/api/players/${playerId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: trimmedName })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Fehler beim Aktualisieren des Spielers.", "error");
            return;
        }

        showToast("Spieler erfolgreich aktualisiert.", "success");
        await loadPlayers();
    } catch (error) {
        console.error("Fehler beim Bearbeiten des Spielers:", error);
        showToast("Spieler konnte nicht bearbeitet werden.", "error");
    }
}

// Löscht einen Spieler, sofern das Backend dies erlaubt.
async function handleDeletePlayer(playerId, playerName) {
    const confirmed = confirm(`Willst du den Spieler "${playerName}" wirklich löschen?`);
    if (!confirmed) return;

    try {
        const response = await fetch(`/api/players/${playerId}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Fehler beim Löschen des Spielers.", "error");
            return;
        }

        showToast("Spieler erfolgreich gelöscht.", "success");
        await loadPlayers();
    } catch (error) {
        console.error("Fehler beim Löschen des Spielers:", error);
        showToast("Spieler konnte nicht gelöscht werden.", "error");
    }
}

// Rendert die Spielerliste im DOM.
function renderPlayers(players) {
    const playerList = document.getElementById("player-list");
    if (!playerList) return;

    playerList.innerHTML = "";

    if (!players || players.length === 0) {
        playerList.innerHTML = `
            <li class="list-group-item text-muted">
                Noch keine Spieler vorhanden.
            </li>
        `;
        return;
    }

    players.forEach(player => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        li.innerHTML = `
            <div class="d-flex justify-content-between align-items-center gap-3 w-100">
                <div>
                    <span>${player.name}</span>
                </div>

                <div class="d-flex gap-2">
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-dark edit-player-btn"
                        style="width: 48px; height: 48px;"
                        data-player-id="${player.id}"
                        data-player-name="${player.name}"
                    >
                        <i class="bi bi-pencil"></i>
                    </button>

                    <button
                        type="button"
                        class="btn btn-sm btn-outline-danger delete-player-btn"
                        style="width: 48px; height: 48px;"
                        data-player-id="${player.id}"
                        data-player-name="${player.name}"
                    >
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
        playerList.appendChild(li);
    });
}

// Initialisiert den Bereich zum Anlegen neuer Spieler.
function initPlayerSection() {
    const createPlayerBtn = document.getElementById("create-player-btn");
    const playerNameInput = document.getElementById("player-name");

    if (!createPlayerBtn || !playerNameInput) return;

    createPlayerBtn.addEventListener("click", createPlayer);

    playerNameInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            createPlayer();
        }
    });
}

// Verwendet Event Delegation für Bearbeiten-/Löschen-Buttons in der Liste.
function initPlayerActionEvents() {
    const playerList = document.getElementById("player-list");
    if (!playerList) return;

    playerList.addEventListener("click", event => {
        const editButton = event.target.closest(".edit-player-btn");
        const deleteButton = event.target.closest(".delete-player-btn");

        if (editButton) {
            const playerId = Number(editButton.dataset.playerId);
            const playerName = editButton.dataset.playerName;
            handleEditPlayer(playerId, playerName);
            return;
        }

        if (deleteButton) {
            const playerId = Number(deleteButton.dataset.playerId);
            const playerName = deleteButton.dataset.playerName;
            handleDeletePlayer(playerId, playerName);
        }
    });
}

// Initialisiert die komplette Spieler-Seite.
function initPlayersPage() {
    initPlayerSection();
    initPlayerActionEvents();
    loadPlayers();
}

document.addEventListener("DOMContentLoaded", initPlayersPage);