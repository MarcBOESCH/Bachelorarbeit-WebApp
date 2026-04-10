let allTeams = [];
let allPlayers = [];
let tomSelectA, tomSelectB;
let modalTomSelectA, modalTomSelectB;
let currentModalTeam = '';

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
        initPlayerSelectionForm();
    } catch (error) {
        console.error("Fehler beim Laden:", error);
        showSelectionMessage("Daten konnten nicht geladen werden.", "danger");
    }
}

// 2. Tom Select für die Haupt-Dropdowns initialisieren
function initTomSelects() {
    const config = {
        valueField: 'id',
        labelField: 'name',
        searchField: ['name', 'player_names'],
        options: allTeams,
        placeholder: "Bitte Team suchen...",
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
            updateCrossDropdownLocks(); // NEU: Trigger Filterung
        }
    });

    tomSelectB = new TomSelect("#team-b-select", {
        ...config,
        onChange: (val) => {
            updatePlayerInfo('b', val);
            updateCrossDropdownLocks(); // NEU: Trigger Filterung
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
    hideSelectionMessage();
    const infoDiv = document.getElementById(`team-${teamLetter}-players-info`);
    const team = allTeams.find(t => t.id == teamId);

    if (team) {
        infoDiv.querySelector('.player-names').textContent = team.player_names;
        infoDiv.classList.remove('d-none');
    } else {
        infoDiv.classList.add('d-none');
    }
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
        placeholder: "Spieler suchen oder neu tippen...",
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
                    alert(data.error || "Fehler beim Erstellen des Spielers.");
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
                alert("Verbindung zum Server fehlgeschlagen.");
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
}

// Wenn das Modal geöffnet wird, setzen wir alles sauber zurück
window.openNewTeamModal = function(teamLetter) {
    currentModalTeam = teamLetter.toLowerCase();
    document.getElementById('new-team-name').value = '';

    // Beide Dropdowns leeren und alle Spieler wieder als gültige Optionen hinzufügen
    if (modalTomSelectP1) {
        modalTomSelectP1.clear(true); // true = "lautlos" leeren, ohne onChange auszulösen
        modalTomSelectP1.prevSelected = null;
        modalTomSelectP1.addOption(allPlayers);
    }

    if (modalTomSelectP2) {
        modalTomSelectP2.clear(true);
        modalTomSelectP2.prevSelected = null;
        modalTomSelectP2.addOption(allPlayers);
    }

    const modal = new bootstrap.Modal(document.getElementById('newTeamModal'));
    modal.show();
};

async function saveNewTeam() {
    const name = document.getElementById('new-team-name').value.trim();
    // IDs jetzt sauber über die Tom Select Instanzen auslesen
    const p1_id = modalTomSelectP1.getValue();
    const p2_id = modalTomSelectP2.getValue();

    if (!name || !p1_id || !p2_id) {
        alert("Bitte alle Felder ausfüllen.");
        return;
    }

    if (p1_id === p2_id) {
        alert("Ein Team muss aus zwei unterschiedlichen Spielern bestehen.");
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
            alert(data.error || "Fehler beim Erstellen.");
            return;
        }

        // Neues Team lokal zur Liste hinzufügen
        const newTeam = {
            id: data.id,
            name: name,
            player1_id: p1_id,
            player2_id: p2_id,
            player_names: `${allPlayers.find(p=>p.id==p1_id).name} & ${allPlayers.find(p=>p.id==p2_id).name}`
        };

        allTeams.push(newTeam);
        tomSelectA.addOption(newTeam);
        tomSelectB.addOption(newTeam);

        // Direkt im richtigen Haupt-Dropdown (Team A oder B) auswählen
        if (currentModalTeam === 'a') tomSelectA.setValue(newTeam.id);
        if (currentModalTeam === 'b') tomSelectB.setValue(newTeam.id);

        bootstrap.Modal.getInstance(document.getElementById('newTeamModal')).hide();
        showSelectionMessage("Team erfolgreich erstellt!", "success");

    } catch (error) {
        alert("Verbindung zum Server fehlgeschlagen.");
    }
}

// ==========================================
// MATCH START LOGIK
// ==========================================

function showSelectionMessage(message, type = "warning") {
    const box = document.getElementById("player-selection-message");
    if (!box) return;
    box.textContent = message;
    box.className = `alert alert-${type}`;
    box.classList.remove("d-none");
}

function hideSelectionMessage() {
    const box = document.getElementById("player-selection-message");
    if (!box) return;
    box.classList.add("d-none");
}

async function submitPlayerSelection(event) {
    event.preventDefault();
    hideSelectionMessage();

    const teamA_id = tomSelectA.getValue();
    const teamB_id = tomSelectB.getValue();

    if (!teamA_id || !teamB_id) {
        showSelectionMessage("Bitte für beide Seiten ein Team auswählen.", "warning");
        return;
    }

    if (teamA_id === teamB_id) {
        showSelectionMessage("Team A und Team B können nicht dasselbe Team sein.", "danger");
        return;
    }

    // ACHTUNG: Hier prüfen wir, ob Spieler überschneiden (Ein Spieler darf nicht gegen sich selbst spielen)
    const teamA = allTeams.find(t => t.id == teamA_id);
    const teamB = allTeams.find(t => t.id == teamB_id);

    const playersA = [String(teamA.player1_id), String(teamA.player2_id)];
    const playersB = [String(teamB.player1_id), String(teamB.player2_id)];

    const hasOverlap = playersA.some(id => playersB.includes(id));
    if (hasOverlap) {
        showSelectionMessage("Ein Spieler kann nicht gleichzeitig in Team A und Team B spielen.", "danger");
        return;
    }

    try {
        const response = await fetch("/api/match/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                team_a_id: teamA_id,
                team_b_id: teamB_id
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showSelectionMessage(data.error || "Match konnte nicht gestartet werden.", "danger");
            return;
        }

        window.location.href = "/match";
    } catch (error) {
        showSelectionMessage("Verbindung zum Server fehlgeschlagen.", "danger");
    }
}

function initPlayerSelectionForm() {
    const form = document.getElementById("player-selection-form");
    if (form) form.addEventListener("submit", submitPlayerSelection);
}

document.addEventListener("DOMContentLoaded", loadData);