let editPlayerModalInstance;
let deletePlayerModalInstance;

let playerIdToEdit = null;
let playerIdToDelete = null;

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

// Speichert die Bearbeitung eines vorhandenen Spielers.
async function saveEditedPlayer() {
    const input = document.getElementById("edit-player-name");

    if (!input || !playerIdToEdit) return;

    const trimmedName = input.value.trim();

    if (trimmedName === "") {
        showToast("Der Name darf nicht leer sein.", "error");
        return;
    }

    try {
        const response = await fetch(`/api/players/${playerIdToEdit}`, {
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

        editPlayerModalInstance?.hide();
        playerIdToEdit = null;

        showToast("Spieler erfolgreich aktualisiert.", "success");
        await loadPlayers();
    } catch (error) {
        console.error("Fehler beim Bearbeiten des Spielers:", error);
        showToast("Spieler konnte nicht bearbeitet werden.", "error");
    }
}

// Löscht einen Spieler, sofern das Backend dies erlaubt.
async function deletePlayerConfirmed() {
    if (!playerIdToDelete) return;

    try {
        const response = await fetch(`/api/players/${playerIdToDelete}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Fehler beim Löschen des Spielers.", "error");
            return;
        }

        deletePlayerModalInstance?.hide();
        playerIdToDelete = null;

        showToast("Spieler erfolgreich gelöscht.", "success");
        await loadPlayers();
    } catch (error) {
        console.error("Fehler beim Löschen des Spielers:", error);
        showToast("Spieler konnte nicht gelöscht werden.", "error");
    }
}

// Öffnet das Bearbeiten-Modal.
function openEditPlayerModal(playerId, currentName) {
    const input = document.getElementById("edit-player-name");
    const modalElement = document.getElementById("editPlayerModal");

    if (!input || !modalElement) return;

    playerIdToEdit = playerId;
    input.value = currentName;

    if (!editPlayerModalInstance) {
        editPlayerModalInstance = new bootstrap.Modal(modalElement);
    }

    editPlayerModalInstance.show();

    setTimeout(() => {
        input.focus();
        input.select();
    }, 150);
}

// Öffnet das Löschen-Modal.
function openDeletePlayerModal(playerId, playerName) {
    const nameElement = document.getElementById("delete-player-name");
    const modalElement = document.getElementById("deletePlayerModal");

    if (!nameElement || !modalElement) return;

    playerIdToDelete = playerId;
    nameElement.textContent = `"${playerName}"`;

    if (!deletePlayerModalInstance) {
        deletePlayerModalInstance = new bootstrap.Modal(modalElement);
    }

    deletePlayerModalInstance.show();
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

// Initialisiert die Modals.
function initPlayerModals() {
    const saveEditBtn = document.getElementById("save-player-edit-btn");
    const editNameInput = document.getElementById("edit-player-name");
    const confirmDeleteBtn = document.getElementById("confirm-player-delete-btn");
    const editModalElement = document.getElementById("editPlayerModal");
    const deleteModalElement = document.getElementById("deletePlayerModal");

    if (editModalElement) {
        editModalElement.addEventListener("hidden.bs.modal", () => {
            playerIdToEdit = null;
            const input = document.getElementById("edit-player-name");
            if (input) {
                input.value = "";
            }
        });
    }

    if (deleteModalElement) {
        deleteModalElement.addEventListener("hidden.bs.modal", () => {
            playerIdToDelete = null;
            const nameElement = document.getElementById("delete-player-name");
            if (nameElement) {
                nameElement.textContent = "";
            }
        });
    }

    if (saveEditBtn) {
        saveEditBtn.addEventListener("click", saveEditedPlayer);
    }

    if (editNameInput) {
        editNameInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                saveEditedPlayer();
            }
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", deletePlayerConfirmed);
    }
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
            openEditPlayerModal(playerId, playerName);
            return;
        }

        if (deleteButton) {
            const playerId = Number(deleteButton.dataset.playerId);
            const playerName = deleteButton.dataset.playerName;
            openDeletePlayerModal(playerId, playerName);
        }
    });
}

// Initialisiert die komplette Spieler-Seite.
function initPlayersPage() {
    initPlayerSection();
    initPlayerModals();
    initPlayerActionEvents();
    loadPlayers();
}

document.addEventListener("DOMContentLoaded", initPlayersPage);