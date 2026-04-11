let editPlayerModalInstance;
let deletePlayerModalInstance;
let editTeamModalInstance;
let deleteTeamModalInstance;

let playerIdToEdit = null;
let playerIdToDelete = null;
let teamIdToEdit = null;
let teamIdToDelete = null;

/* =========================
   Daten laden
========================= */

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

// Lädt alle Teams aus der API und rendert sie in die Teamliste.
async function loadTeams() {
    try {
        const response = await fetch("/api/teams");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /api/teams:", response.status, text);
            showToast(`Fehler beim Laden der Teams (${response.status}).`, "error");
            return;
        }

        const teams = await response.json();
        renderTeams(teams);
    } catch (error) {
        console.error("Fehler beim Laden der Teams:", error);
        showToast("Teams konnten nicht geladen werden.", "error");
    }
}

/* =========================
   Spieler-Aktionen
========================= */

// Erstellt einen neuen Spieler über die API.
async function createPlayer() {
    const input = document.getElementById("player-name");

    if (!input) {
        return;
    }

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

    if (!input || !playerIdToEdit) {
        return;
    }

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
        await loadTeams();
    } catch (error) {
        console.error("Fehler beim Bearbeiten des Spielers:", error);
        showToast("Spieler konnte nicht bearbeitet werden.", "error");
    }
}

// Löscht einen Spieler, sofern das Backend dies erlaubt.
async function deletePlayerConfirmed() {
    if (!playerIdToDelete) {
        return;
    }

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
        await loadTeams();
    } catch (error) {
        console.error("Fehler beim Löschen des Spielers:", error);
        showToast("Spieler konnte nicht gelöscht werden.", "error");
    }
}

/* =========================
   Team-Aktionen
========================= */

// Speichert die Bearbeitung eines vorhandenen Teams.
async function saveEditedTeam() {
    const input = document.getElementById("edit-team-name");

    if (!input || !teamIdToEdit) {
        return;
    }

    const trimmedName = input.value.trim();

    if (trimmedName === "") {
        showToast("Der Teamname darf nicht leer sein.", "error");
        return;
    }

    try {
        const response = await fetch(`/api/teams/${teamIdToEdit}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: trimmedName })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Fehler beim Aktualisieren des Teams.", "error");
            return;
        }

        editTeamModalInstance?.hide();
        teamIdToEdit = null;

        showToast("Team erfolgreich aktualisiert.", "success");
        await loadTeams();
    } catch (error) {
        console.error("Fehler beim Bearbeiten des Teams:", error);
        showToast("Team konnte nicht bearbeitet werden.", "error");
    }
}

// Löscht ein Team, sofern das Backend dies erlaubt.
async function deleteTeamConfirmed() {
    if (!teamIdToDelete) {
        return;
    }

    try {
        const response = await fetch(`/api/teams/${teamIdToDelete}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Fehler beim Löschen des Teams.", "error");
            return;
        }

        deleteTeamModalInstance?.hide();
        teamIdToDelete = null;

        showToast("Team erfolgreich gelöscht.", "success");
        await loadTeams();
    } catch (error) {
        console.error("Fehler beim Löschen des Teams:", error);
        showToast("Team konnte nicht gelöscht werden.", "error");
    }
}

/* =========================
   Modals öffnen
========================= */

// Öffnet das Bearbeiten-Modal für Spieler.
function openEditPlayerModal(playerId, currentName) {
    const input = document.getElementById("edit-player-name");
    const modalElement = document.getElementById("editPlayerModal");

    if (!input || !modalElement) {
        return;
    }

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

// Öffnet das Löschen-Modal für Spieler.
function openDeletePlayerModal(playerId, playerName) {
    const nameElement = document.getElementById("delete-player-name");
    const modalElement = document.getElementById("deletePlayerModal");

    if (!nameElement || !modalElement) {
        return;
    }

    playerIdToDelete = playerId;
    nameElement.textContent = `"${playerName}"`;

    if (!deletePlayerModalInstance) {
        deletePlayerModalInstance = new bootstrap.Modal(modalElement);
    }

    deletePlayerModalInstance.show();
}

// Öffnet das Bearbeiten-Modal für Teams.
function openEditTeamModal(teamId, currentName) {
    const input = document.getElementById("edit-team-name");
    const modalElement = document.getElementById("editTeamModal");

    if (!input || !modalElement) {
        return;
    }

    teamIdToEdit = teamId;
    input.value = currentName;

    if (!editTeamModalInstance) {
        editTeamModalInstance = new bootstrap.Modal(modalElement);
    }

    editTeamModalInstance.show();

    setTimeout(() => {
        input.focus();
        input.select();
    }, 150);
}

// Öffnet das Löschen-Modal für Teams.
function openDeleteTeamModal(teamId, teamName) {
    const nameElement = document.getElementById("delete-team-name");
    const modalElement = document.getElementById("deleteTeamModal");

    if (!nameElement || !modalElement) {
        return;
    }

    teamIdToDelete = teamId;
    nameElement.textContent = `"${teamName}"`;

    if (!deleteTeamModalInstance) {
        deleteTeamModalInstance = new bootstrap.Modal(modalElement);
    }

    deleteTeamModalInstance.show();
}

/* =========================
   Rendering
========================= */

// Rendert die Spielerliste im DOM.
function renderPlayers(players) {
    const isAdmin = window.IS_ADMIN === true || window.IS_ADMIN === "true";
    const playerList = document.getElementById("player-list");

    if (!playerList) {
        return;
    }

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

        const deleteButtonHtml = isAdmin
            ? `
                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger delete-player-btn"
                    style="width: 48px; height: 48px;"
                    data-player-id="${player.id}"
                    data-player-name="${player.name}"
                >
                    <i class="bi bi-trash"></i>
                </button>
            `
            : "";

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

                    ${deleteButtonHtml}
                </div>
            </div>
        `;

        playerList.appendChild(li);
    });
}

// Rendert die Teamliste im DOM.
function renderTeams(teams) {
    const isAdmin = window.IS_ADMIN === true || window.IS_ADMIN === "true";
    const teamList = document.getElementById("team-list");

    if (!teamList) {
        return;
    }

    teamList.innerHTML = "";

    if (!teams || teams.length === 0) {
        teamList.innerHTML = `
            <li class="list-group-item text-muted">
                Noch keine Teams vorhanden.
            </li>
        `;
        return;
    }

    teams.forEach(team => {
        const li = document.createElement("li");
        li.className = "list-group-item d-flex justify-content-between align-items-center";

        const editButtonHtml = `
            <button
                type="button"
                class="btn btn-sm btn-outline-dark edit-team-btn"
                style="width: 48px; height: 48px;"
                data-team-id="${team.id}"
                data-team-name="${team.name}"
            >
                <i class="bi bi-pencil"></i>
            </button>
        `;

        const deleteButtonHtml = isAdmin
            ? `
                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger delete-team-btn"
                    style="width: 48px; height: 48px;"
                    data-team-id="${team.id}"
                    data-team-name="${team.name}"
                >
                    <i class="bi bi-trash"></i>
                </button>
            `
            : "";

        li.innerHTML = `
            <div class="d-flex justify-content-between align-items-center gap-3 w-100">
                <div>
                    <div class="fw-semibold">${team.name}</div>
                    <div class="small text-muted">${team.player_names}</div>
                </div>

                <div class="d-flex gap-2">
                    ${editButtonHtml}
                    ${deleteButtonHtml}
                </div>
            </div>
        `;

        teamList.appendChild(li);
    });
}

/* =========================
   Initialisierung
========================= */

// Initialisiert den Bereich zum Anlegen neuer Spieler.
function initPlayerSection() {
    const createPlayerBtn = document.getElementById("create-player-btn");
    const playerNameInput = document.getElementById("player-name");

    if (!createPlayerBtn || !playerNameInput) {
        return;
    }

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
    const saveTeamEditBtn = document.getElementById("save-team-edit-btn");
    const confirmTeamDeleteBtn = document.getElementById("confirm-team-delete-btn");

    const editModalElement = document.getElementById("editPlayerModal");
    const deleteModalElement = document.getElementById("deletePlayerModal");
    const editTeamModalElement = document.getElementById("editTeamModal");
    const deleteTeamModalElement = document.getElementById("deleteTeamModal");

    if (editModalElement) {
        editModalElement.addEventListener("hidden.bs.modal", () => {
            playerIdToEdit = null;
            const input = document.getElementById("edit-player-name");
            if (input) {
                input.value = "";
            }
        });
    }

    if (editTeamModalElement) {
        editTeamModalElement.addEventListener("hidden.bs.modal", () => {
            teamIdToEdit = null;
            const input = document.getElementById("edit-team-name");
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

    if (deleteTeamModalElement) {
        deleteTeamModalElement.addEventListener("hidden.bs.modal", () => {
            teamIdToDelete = null;
            const nameElement = document.getElementById("delete-team-name");
            if (nameElement) {
                nameElement.textContent = "";
            }
        });
    }

    if (saveEditBtn) {
        saveEditBtn.addEventListener("click", saveEditedPlayer);
    }

    if (saveTeamEditBtn) {
        saveTeamEditBtn.addEventListener("click", saveEditedTeam);
    }

    if (editNameInput) {
        editNameInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                saveEditedPlayer();
            }
        });
    }

    const editTeamNameInput = document.getElementById("edit-team-name");
    if (editTeamNameInput) {
        editTeamNameInput.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                saveEditedTeam();
            }
        });
    }

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", deletePlayerConfirmed);
    }

    if (confirmTeamDeleteBtn) {
        confirmTeamDeleteBtn.addEventListener("click", deleteTeamConfirmed);
    }
}

// Verwendet Event Delegation für Bearbeiten-/Löschen-Buttons in den Listen.
function initPlayerActionEvents() {
    const playerList = document.getElementById("player-list");
    const teamList = document.getElementById("team-list");

    if (playerList) {
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

    if (teamList) {
        teamList.addEventListener("click", event => {
            const editButton = event.target.closest(".edit-team-btn");
            const deleteButton = event.target.closest(".delete-team-btn");

            if (editButton) {
                const teamId = Number(editButton.dataset.teamId);
                const teamName = editButton.dataset.teamName;
                openEditTeamModal(teamId, teamName);
                return;
            }

            if (deleteButton) {
                const teamId = Number(deleteButton.dataset.teamId);
                const teamName = deleteButton.dataset.teamName;
                openDeleteTeamModal(teamId, teamName);
            }
        });
    }
}

// Initialisiert die komplette Spieler-Seite.
function initPlayersPage() {
    initPlayerSection();
    initPlayerModals();
    initPlayerActionEvents();
    loadPlayers();
    loadTeams();
}

document.addEventListener("DOMContentLoaded", initPlayersPage);