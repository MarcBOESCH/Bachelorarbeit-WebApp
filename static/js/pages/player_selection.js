let allTeams = [];
let allPlayers = [];
let tomSelectA, tomSelectB;
let modalTomSelectP1, modalTomSelectP2;
let currentModalTeam = '';
let selectionMode = "players";
let createTeamFromPlayersTarget = "";

// 1. Initiales Laden der Daten
async function loadData() {
    try {
        const [teamsRes, playersRes] = await Promise.all([
            fetch("/api/teams"),
            fetch("/api/players")
        ]);

        if (!teamsRes.ok || !playersRes.ok) throw new Error("Netzwerkfehler");

        allTeams = await teamsRes.json();
        allPlayers = await playersRes.json();

        initTomSelects();
        initModalSelects();
        initPlayerModeSelects();
        initSelectionModeToggle();
        initPlayerSelectionForm();
        refreshPlayerModeDropdownLocks();
        updateExistingTeamInfo();
        updateStartMatchButtonState();
        updateMatchPreview();

    } catch (error) {
        console.error("Fehler beim Laden:", error);
        showToast("Daten konnten nicht geladen werden.", "error");
    }
}

// 2. Tom Select für die Haupt-Dropdowns initialisieren
function initTomSelects() {
    const config = {
        valueField: 'id',
        labelField: 'name',
        searchField: ['name', 'player_names'],
        options: allTeams,
        placeholder: "Team suchen...",
        render: {
            option: function(data, escape) {
                return `<div>
                            <span class="fw-bold">${escape(data.name)}</span><br>
                            <span class="small text-muted">${escape(data.player_names)}</span>
                        </div>`;
            },
            item: function(data, escape) {
                return `<div data-players="${escape(data.player_names)}">${escape(data.name)}</div>`;
            }
        }
    };

    tomSelectA = new TomSelect("#team-a-select", {
        ...config,
        onChange: (val) => {
            updatePlayerInfo('a', val);
            updateCrossDropdownLocks();
            updateStartMatchButtonState();
            updateMatchPreview();
        }
    });

    tomSelectB = new TomSelect("#team-b-select", {
        ...config,
        onChange: (val) => {
            updatePlayerInfo('b', val);
            updateCrossDropdownLocks();
            updateStartMatchButtonState();
            updateMatchPreview();
        }
    });
}

// 2.5 NEU: Entfernt Teams komplett aus der Auswahl, wenn Spieler sich überschneiden
function updateCrossDropdownLocks() {
    if (!tomSelectA || !tomSelectB) return;

    const teamA_id = tomSelectA.getValue();
    const teamB_id = tomSelectB.getValue();

    // Finde die aktuell gewählten Teams heraus
    const selectedTeamA = allTeams.find(t => t.id == teamA_id);
    const selectedTeamB = allTeams.find(t => t.id == teamB_id);

    // Extrahiere die Spieler-IDs (oder leeres Array, falls nichts gewählt)
    const playersA = selectedTeamA ? [selectedTeamA.player1_id, selectedTeamA.player2_id] : [];
    const playersB = selectedTeamB ? [selectedTeamB.player1_id, selectedTeamB.player2_id] : [];

    // Hilfsfunktion zum dynamischen Hinzufügen/Entfernen der Optionen
    const filterDropdown = (selectInstance, opposingPlayers, currentSelectionId) => {
        allTeams.forEach(team => {
            const hasConflict = opposingPlayers.includes(team.player1_id) || opposingPlayers.includes(team.player2_id);

            // Wenn es einen Konflikt gibt UND das Team nicht gerade selbst ausgewählt ist
            if (hasConflict && team.id != currentSelectionId) {
                // Team komplett aus dem Dropdown entfernen
                selectInstance.removeOption(team.id);
            } else {
                // Team wieder hinzufügen (falls es vorher entfernt wurde)
                selectInstance.addOption(team);
            }
        });
    };

    // Teams in Dropdown A filtern (basierend auf den Spielern von Team B)
    filterDropdown(tomSelectA, playersB, teamA_id);

    // Teams in Dropdown B filtern (basierend auf den Spielern von Team A)
    filterDropdown(tomSelectB, playersA, teamB_id);
}

// 3. UI Update, wenn ein Team gewählt wird
function updatePlayerInfo(teamLetter, teamId) {
    const infoDiv = document.getElementById(`team-${teamLetter}-players-info`);
    const team = allTeams.find(t => t.id == teamId);

    if (team) {
        infoDiv.querySelector('.player-names').textContent = team.player_names;
        infoDiv.classList.remove('d-none');
    } else {
        infoDiv.classList.add('d-none');
    }
}

function findExistingTeamByPlayers(player1Id, player2Id) {
    if (!player1Id || !player2Id) return null;

    return allTeams.find(team =>
        (String(team.player1_id) === String(player1Id) && String(team.player2_id) === String(player2Id)) ||
        (String(team.player1_id) === String(player2Id) && String(team.player2_id) === String(player1Id))
    );
}

async function createPlayerFromInput(input) {
    try {
        const response = await fetch("/api/players", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: input })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Fehler beim Erstellen des Spielers.", "error");
            return null;
        }

        const newPlayer = {
            id: data.player.id,
            name: data.player.name
        };

        allPlayers.push(newPlayer);

        [
            modalTomSelectP1,
            modalTomSelectP2,
            playerSelectTeamA1,
            playerSelectTeamA2,
            playerSelectTeamB1,
            playerSelectTeamB2
        ].forEach(selectInstance => {
            if (selectInstance) {
                selectInstance.addOption(newPlayer);
            }
        });

        refreshPlayerModeDropdownLocks();
        showToast("Spieler erfolgreich erstellt!", "success");

        return newPlayer;
    } catch (error) {
        showToast("Verbindung zum Server fehlgeschlagen.", "error");
        return null;
    }
}

function getSelectedPlayersForSide(teamLetter) {
    if (teamLetter === "A") {
        return {
            player1Id: playerSelectTeamA1?.getValue() || "",
            player2Id: playerSelectTeamA2?.getValue() || ""
        };
    }

    return {
        player1Id: playerSelectTeamB1?.getValue() || "",
        player2Id: playerSelectTeamB2?.getValue() || ""
    };
}

function refreshPlayerModeDropdownLocks() {
    const selects = [
        playerSelectTeamA1,
        playerSelectTeamA2,
        playerSelectTeamB1,
        playerSelectTeamB2
    ].filter(Boolean);

    if (selects.length === 0) return;

    const selectedValues = {
        a1: playerSelectTeamA1?.getValue() || "",
        a2: playerSelectTeamA2?.getValue() || "",
        b1: playerSelectTeamB1?.getValue() || "",
        b2: playerSelectTeamB2?.getValue() || ""
    };

    const currentValues = [
        selectedValues.a1,
        selectedValues.a2,
        selectedValues.b1,
        selectedValues.b2
    ].filter(Boolean);

    const syncOptionsForSelect = (selectInstance, ownValue) => {
        if (!selectInstance) return;

        selectInstance.clearOptions();

        allPlayers.forEach(player => {
            const playerId = String(player.id);
            const isUsedElsewhere = currentValues.includes(playerId) && playerId !== String(ownValue);

            if (!isUsedElsewhere) {
                selectInstance.addOption(player);
            }
        });

        selectInstance.refreshOptions(false);

        if (ownValue) {
            selectInstance.setValue(ownValue, true);
        }
    };

    syncOptionsForSelect(playerSelectTeamA1, selectedValues.a1);
    syncOptionsForSelect(playerSelectTeamA2, selectedValues.a2);
    syncOptionsForSelect(playerSelectTeamB1, selectedValues.b1);
    syncOptionsForSelect(playerSelectTeamB2, selectedValues.b2);
}

function initSelectionModeToggle() {
    const btnPlayers = document.getElementById("btn-selection-mode-players");
    const btnTeams = document.getElementById("btn-selection-mode-teams");
    const playerSelectionView = document.getElementById("player-selection-view");
    const teamSelectionView = document.getElementById("team-selection-view");

    if (!btnPlayers || !btnTeams || !playerSelectionView || !teamSelectionView) return;

    function setSelectionMode(mode) {
        selectionMode = mode;

        const isPlayersMode = mode === "players";

        btnPlayers.classList.toggle("active", isPlayersMode);
        btnTeams.classList.toggle("active", !isPlayersMode);

        playerSelectionView.classList.toggle("d-none", !isPlayersMode);
        teamSelectionView.classList.toggle("d-none", isPlayersMode);

        updateExistingTeamInfo();
        updateMatchPreview();
        updateStartMatchButtonState();
    }

    btnPlayers.addEventListener("click", () => setSelectionMode("players"));
    btnTeams.addEventListener("click", () => setSelectionMode("teams"));

    setSelectionMode("players");
}

function initPlayerModeSelects() {
    const playerConfig = {
        valueField: "id",
        labelField: "name",
        searchField: "name",
        options: allPlayers,
        placeholder: "Spieler suchen oder neu tippen...",
        render: {
            option_create: function(data, escape) {
                return `<div class="create text-success fw-bold">
                            <i class="bi bi-person-plus-fill"></i> Spieler "${escape(data.input)}" anlegen...
                        </div>`;
            }
        },
        create: async function(input, callback) {
            const newPlayer = await createPlayerFromInput(input);

            if (!newPlayer) {
                callback(false);
                return;
            }

            callback(newPlayer);
        }
    };

    playerSelectTeamA1 = new TomSelect("#team-a-player-1", playerConfig);
    playerSelectTeamA2 = new TomSelect("#team-a-player-2", playerConfig);
    playerSelectTeamB1 = new TomSelect("#team-b-player-1", playerConfig);
    playerSelectTeamB2 = new TomSelect("#team-b-player-2", playerConfig);

    [
        playerSelectTeamA1,
        playerSelectTeamA2,
        playerSelectTeamB1,
        playerSelectTeamB2
    ].forEach(selectInstance => {
        selectInstance.on("change", () => {
            refreshPlayerModeDropdownLocks();
            updateExistingTeamInfo();
            updateMatchPreview();
            updateStartMatchButtonState();
        });
    });
}

function updateExistingTeamInfo() {
    const teamAInfo = document.getElementById("team-a-existing-team-info");
    const teamBInfo = document.getElementById("team-b-existing-team-info");

    const teamAName = teamAInfo?.querySelector(".existing-team-name");
    const teamBName = teamBInfo?.querySelector(".existing-team-name");

    const teamAMissingInfo = document.getElementById("team-a-missing-team-info");
    const teamBMissingInfo = document.getElementById("team-b-missing-team-info");

    const teamACreateAction = document.getElementById("team-a-create-team-action");
    const teamBCreateAction = document.getElementById("team-b-create-team-action");

    if (
        !teamAInfo || !teamBInfo || !teamAName || !teamBName ||
        !teamAMissingInfo || !teamBMissingInfo ||
        !teamACreateAction || !teamBCreateAction
    ) {
        return;
    }

    const teamAPlayers = getSelectedPlayersForSide("A");
    const teamBPlayers = getSelectedPlayersForSide("B");

    const teamAComplete = teamAPlayers.player1Id && teamAPlayers.player2Id;
    const teamBComplete = teamBPlayers.player1Id && teamBPlayers.player2Id;

    const teamA = findExistingTeamByPlayers(teamAPlayers.player1Id, teamAPlayers.player2Id);
    const teamB = findExistingTeamByPlayers(teamBPlayers.player1Id, teamBPlayers.player2Id);

    if (teamA) {
        teamAName.textContent = teamA.name;
        teamAInfo.classList.remove("d-none");
        teamAMissingInfo.classList.add("d-none");
        teamACreateAction.classList.add("d-none");
    } else {
        teamAName.textContent = "";
        teamAInfo.classList.add("d-none");

        const samePlayerInTeamA = teamAPlayers.player1Id && teamAPlayers.player1Id === teamAPlayers.player2Id;
        if (teamAComplete && !samePlayerInTeamA) {
            teamAMissingInfo.classList.remove("d-none");
            teamACreateAction.classList.remove("d-none");
        } else {
            teamAMissingInfo.classList.add("d-none");
            teamACreateAction.classList.add("d-none");
        }
    }

    if (teamB) {
        teamBName.textContent = teamB.name;
        teamBInfo.classList.remove("d-none");
        teamBMissingInfo.classList.add("d-none");
        teamBCreateAction.classList.add("d-none");
    } else {
        teamBName.textContent = "";
        teamBInfo.classList.add("d-none");

        const samePlayerInTeamB = teamBPlayers.player1Id && teamBPlayers.player1Id === teamBPlayers.player2Id;
        if (teamBComplete && !samePlayerInTeamB) {
            teamBMissingInfo.classList.remove("d-none");
            teamBCreateAction.classList.remove("d-none");
        } else {
            teamBMissingInfo.classList.add("d-none");
            teamBCreateAction.classList.add("d-none");
        }
    }
}

function updateMatchPreview() {
    const previewCard = document.getElementById("match-preview-card");
    const previewContainer = document.querySelector(".match-preview");
    const previewTeamAName = document.getElementById("preview-team-a-name");
    const previewTeamAPlayers = document.getElementById("preview-team-a-players");
    const previewTeamBName = document.getElementById("preview-team-b-name");
    const previewTeamBPlayers = document.getElementById("preview-team-b-players");

    if (!previewCard || !previewContainer) return;

    let teamA = null;
    let teamB = null;

    if (selectionMode === "teams") {
        const teamAId = tomSelectA?.getValue();
        const teamBId = tomSelectB?.getValue();

        teamA = allTeams.find(t => t.id == teamAId);
        teamB = allTeams.find(t => t.id == teamBId);
    } else {
        teamA = findExistingTeamByPlayers(
            playerSelectTeamA1?.getValue(),
            playerSelectTeamA2?.getValue()
        );

        teamB = findExistingTeamByPlayers(
            playerSelectTeamB1?.getValue(),
            playerSelectTeamB2?.getValue()
        );
    }

    if (!teamA && !teamB) {
        previewCard.classList.add("d-none");
        previewContainer.classList.remove("ready");
        return;
    }

    previewCard.classList.remove("d-none");

    previewTeamAName.textContent = teamA ? teamA.name : "-";
    previewTeamAPlayers.textContent = teamA ? teamA.player_names : "-";

    previewTeamBName.textContent = teamB ? teamB.name : "-";
    previewTeamBPlayers.textContent = teamB ? teamB.player_names : "-";

    previewContainer.classList.toggle("ready", Boolean(teamA && teamB));
}

// ==========================================
// MODAL LOGIK (Neues Team erstellen)
// ==========================================

function initModalSelects() {
    const select1 = document.getElementById('new-team-p1');
    const select2 = document.getElementById('new-team-p2');

    if(!select1 || !select2) return;

    // Basis-Konfiguration für beide Dropdowns (inkl. Live-Erstellung)
    const baseConfig = {
        valueField: 'id',
        labelField: 'name',
        searchField: 'name',
        options: allPlayers,
        placeholder: "Spieler suchen oder erstellen...",
        render: {
            option_create: function(data, escape) {
                return `<div class="create text-success fw-bold">
                            <i class="bi bi-person-plus-fill"></i> Spieler "${escape(data.input)}" anlegen...
                        </div>`;
            }
        },
        create: async function(input, callback) {
            try {
                // API Aufruf, um den Spieler live im Backend zu speichern
                const response = await fetch("/api/players", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: input })
                });

                const data = await response.json();

                if (!response.ok) {
                    showToast(data.error || "Fehler beim Erstellen des Spielers.", "error");
                    callback(false);
                    return;
                }

                // Neuen Spieler lokal in unsere Liste speichern
                const newPlayer = { id: data.player.id, name: data.player.name };
                allPlayers.push(newPlayer);

                // Dem jeweils ANDEREN Dropdown auch sofort hinzufügen
                if (modalTomSelectP1) modalTomSelectP1.addOption(newPlayer);
                if (modalTomSelectP2) modalTomSelectP2.addOption(newPlayer);

                callback(newPlayer);
            } catch (error) {
                showToast("Verbindung zum Server fehlgeschlagen.", "error");
                callback(false);
            }
        }
    };

    // Spieler 1 Dropdown initialisieren
    modalTomSelectP1 = new TomSelect('#new-team-p1', {
        ...baseConfig,
        onChange: function(value) {
            if (!modalTomSelectP2) return;

            // 1. Den vorher ausgewählten Spieler im ZWEITEN Dropdown wieder hinzufügen
            if (this.prevSelected) {
                const oldPlayer = allPlayers.find(p => p.id == this.prevSelected);
                if (oldPlayer) modalTomSelectP2.addOption(oldPlayer);
            }

            // 2. Den neu ausgewählten Spieler im ZWEITEN Dropdown komplett entfernen
            if (value) {
                modalTomSelectP2.removeOption(value);
            }

            this.prevSelected = value;
        }
    });

    // Spieler 2 Dropdown initialisieren (Exakt gleiche Logik, nur umgekehrt!)
    modalTomSelectP2 = new TomSelect('#new-team-p2', {
        ...baseConfig,
        onChange: function(value) {
            if (!modalTomSelectP1) return;

            // 1. Den vorher ausgewählten Spieler im ERSTEN Dropdown wieder hinzufügen
            if (this.prevSelected) {
                const oldPlayer = allPlayers.find(p => p.id == this.prevSelected);
                if (oldPlayer) modalTomSelectP1.addOption(oldPlayer);
            }

            // 2. Den neu ausgewählten Spieler im ERSTEN Dropdown komplett entfernen
            if (value) {
                modalTomSelectP1.removeOption(value);
            }

            this.prevSelected = value;
        }
    });

    document.getElementById('save-new-team-btn').addEventListener('click', saveNewTeam);

    document.getElementById('new-team-name').addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveNewTeam();
        }
    });
}

window.openCreateTeamFromPlayersModal = function(teamLetter) {
    createTeamFromPlayersTarget = teamLetter;

    const selectedPlayers = getSelectedPlayersForSide(teamLetter);

    if (!selectedPlayers.player1Id || !selectedPlayers.player2Id) {
        showToast("Bitte zuerst zwei Spieler auswählen.", "error");
        return;
    }

    if (selectedPlayers.player1Id === selectedPlayers.player2Id) {
        showToast("Ein Team muss aus zwei unterschiedlichen Spielern bestehen.", "error");
        return;
    }

    openNewTeamModal(teamLetter);

    const modalNameInput = document.getElementById("new-team-name");
    if (modalNameInput) {
        modalNameInput.focus();
    }

    if (modalTomSelectP1) {
        modalTomSelectP1.setValue(selectedPlayers.player1Id, true);
    }

    if (modalTomSelectP2) {
        modalTomSelectP2.setValue(selectedPlayers.player2Id, true);
    }
};

// Wenn das Modal geöffnet wird, setzen wir alles sauber zurück
window.openNewTeamModal = function(teamLetter) {
    currentModalTeam = teamLetter.toLowerCase();
    document.getElementById('new-team-name').value = '';

    // Beide Dropdowns leeren und alle Spieler wieder als gültige Optionen hinzufügen
    if (modalTomSelectP1) {
        modalTomSelectP1.clear(true); // true = "lautlos" leeren, ohne onChange auszulösen
        modalTomSelectP1.prevSelected = null;
        modalTomSelectP1.clearOptions();
        modalTomSelectP1.addOption(allPlayers);
    }

    if (modalTomSelectP2) {
        modalTomSelectP2.clear(true);
        modalTomSelectP2.prevSelected = null;
        modalTomSelectP2.clearOptions();
        modalTomSelectP2.addOption(allPlayers);
    }

    updateStartMatchButtonState();
    const modal = new bootstrap.Modal(document.getElementById('newTeamModal'));
    modal.show();
};

async function saveNewTeam() {
    const name = document.getElementById('new-team-name').value.trim();
    const p1_id = modalTomSelectP1.getValue();
    const p2_id = modalTomSelectP2.getValue();

    if (!name || !p1_id || !p2_id) {
        showToast("Bitte alle Felder ausfüllen.", "error");
        return;
    }

    if (p1_id === p2_id) {
        showToast("Ein Team muss aus zwei unterschiedlichen Spielern bestehen.", "error");
        return;
    }

    try {
        const response = await fetch("/api/teams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: name, player1_id: p1_id, player2_id: p2_id })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Fehler beim Erstellen.", "error");
            return;
        }

        const newTeam = {
            id: data.id,
            name: name,
            player1_id: p1_id,
            player2_id: p2_id,
            player_names: `${allPlayers.find(p => p.id == p1_id).name} & ${allPlayers.find(p => p.id == p2_id).name}`
        };

        allTeams.push(newTeam);
        tomSelectA.addOption(newTeam);
        tomSelectB.addOption(newTeam);

        if (currentModalTeam === 'a') tomSelectA.setValue(newTeam.id);
        if (currentModalTeam === 'b') tomSelectB.setValue(newTeam.id);

        updatePlayerInfo('a', tomSelectA.getValue());
        updatePlayerInfo('b', tomSelectB.getValue());
        updateCrossDropdownLocks();
        updateMatchPreview();
        updateExistingTeamInfo();
        updateStartMatchButtonState();
        createTeamFromPlayersTarget = "";

        bootstrap.Modal.getInstance(document.getElementById('newTeamModal')).hide();
        showToast("Team erfolgreich erstellt!", "success");
        updateStartMatchButtonState();

    } catch (error) {
        showToast("Verbindung zum Server fehlgeschlagen.", "error");
    }
}

// ==========================================
// MATCH START LOGIK
// ==========================================

function updateStartMatchButtonState() {
    const startButton = document.getElementById("start-match-btn");
    if (!startButton) return;

    let isValid = false;

    if (selectionMode === "teams") {
        const teamA_id = tomSelectA?.getValue();
        const teamB_id = tomSelectB?.getValue();

        if (teamA_id && teamB_id && teamA_id !== teamB_id) {
            const teamA = allTeams.find(t => t.id == teamA_id);
            const teamB = allTeams.find(t => t.id == teamB_id);

            if (teamA && teamB) {
                const playersA = [String(teamA.player1_id), String(teamA.player2_id)];
                const playersB = [String(teamB.player1_id), String(teamB.player2_id)];
                const hasOverlap = playersA.some(id => playersB.includes(id));
                isValid = !hasOverlap;
            }
        }
    } else {
        const teamA = findExistingTeamByPlayers(
            playerSelectTeamA1?.getValue(),
            playerSelectTeamA2?.getValue()
        );

        const teamB = findExistingTeamByPlayers(
            playerSelectTeamB1?.getValue(),
            playerSelectTeamB2?.getValue()
        );

        if (teamA && teamB && teamA.id !== teamB.id) {
            const playersA = [String(teamA.player1_id), String(teamA.player2_id)];
            const playersB = [String(teamB.player1_id), String(teamB.player2_id)];
            const hasOverlap = playersA.some(id => playersB.includes(id));
            isValid = !hasOverlap;
        }
    }

    startButton.disabled = !isValid;
}


async function submitPlayerSelection(event) {
    event.preventDefault();

    let teamA = null;
    let teamB = null;

    if (selectionMode === "teams") {
        const teamA_id = tomSelectA?.getValue();
        const teamB_id = tomSelectB?.getValue();

        if (!teamA_id || !teamB_id) {
            showToast("Bitte für beide Seiten ein Team auswählen.", "error");
            return;
        }

        if (teamA_id === teamB_id) {
            showToast("Team A und Team B können nicht dasselbe Team sein.", "error");
            return;
        }

        teamA = allTeams.find(t => t.id == teamA_id);
        teamB = allTeams.find(t => t.id == teamB_id);
    } else {
        const teamAPlayer1 = playerSelectTeamA1?.getValue();
        const teamAPlayer2 = playerSelectTeamA2?.getValue();
        const teamBPlayer1 = playerSelectTeamB1?.getValue();
        const teamBPlayer2 = playerSelectTeamB2?.getValue();

        if (!teamAPlayer1 || !teamAPlayer2 || !teamBPlayer1 || !teamBPlayer2) {
            showToast("Bitte für beide Teams jeweils zwei Spieler auswählen.", "error");
            return;
        }

        if (teamAPlayer1 === teamAPlayer2) {
            showToast("Team A muss aus zwei unterschiedlichen Spielern bestehen.", "error");
            return;
        }

        if (teamBPlayer1 === teamBPlayer2) {
            showToast("Team B muss aus zwei unterschiedlichen Spielern bestehen.", "error");
            return;
        }

        teamA = findExistingTeamByPlayers(teamAPlayer1, teamAPlayer2);
        teamB = findExistingTeamByPlayers(teamBPlayer1, teamBPlayer2);

        if (!teamA || !teamB) {
            showToast("Für mindestens eine Spieler-Kombination existiert noch kein Team.", "error");
            return;
        }

        if (teamA.id === teamB.id) {
            showToast("Team A und Team B können nicht dasselbe Team sein.", "error");
            return;
        }
    }

    if (!teamA || !teamB) {
        showToast("Die Teamdaten konnten nicht aufgelöst werden.", "error");
        return;
    }

    const playersA = [String(teamA.player1_id), String(teamA.player2_id)];
    const playersB = [String(teamB.player1_id), String(teamB.player2_id)];

    const hasOverlap = playersA.some(id => playersB.includes(id));
    if (hasOverlap) {
        showToast("Ein Spieler kann nicht gleichzeitig in Team A und Team B spielen.", "error");
        return;
    }

    try {
        const response = await fetch("/api/match/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                team_a_id: teamA.id,
                team_b_id: teamB.id
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Match konnte nicht gestartet werden.", "error");
            return;
        }

        window.location.href = "/match";
    } catch (error) {
        showToast("Verbindung zum Server fehlgeschlagen.", "error");
    }
}

function initPlayerSelectionForm() {
    const form = document.getElementById("player-selection-form");
    if (form) form.addEventListener("submit", submitPlayerSelection);
}

document.addEventListener("DOMContentLoaded", loadData);