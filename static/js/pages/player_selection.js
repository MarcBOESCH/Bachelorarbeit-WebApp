let allPlayers = [];

/*
 * Lädt alle Spieler aus dem Backend und initialisiert danach
 * die Auswahlfelder für die Teamzusammenstellung.
 */
async function loadPlayersForSelection() {
    try {
        const response = await fetch("/api/players");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /api/players:", response.status, text);
            showSelectionMessage("Spieler konnten nicht geladen werden.", "danger");
            return;
        }

        allPlayers = await response.json();
        renderAllPlayerSelects();
    } catch (error) {
        console.error("Fehler beim Laden der Spieler:", error);
        showSelectionMessage("Verbindung zum Server fehlgeschlagen.", "danger");
    }
}

/*
 * Zeigt eine Rückmeldung oberhalb des Start-Buttons an.
 * type kann z. B. success, warning oder danger sein.
 */
function showSelectionMessage(message, type = "warning") {
    const messageBox = document.getElementById("player-selection-message");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className = `alert alert-${type}`;
    messageBox.classList.remove("d-none");
}

/*
 * Versteckt die Rückmeldung wieder.
 */
function hideSelectionMessage() {
    const messageBox = document.getElementById("player-selection-message");

    if (!messageBox) return;

    messageBox.textContent = "";
    messageBox.className = "alert d-none";
}

/*
 * Gibt alle aktuell gewählten Spieler-IDs zurück.
 */
function getSelectedPlayerIds() {
    return [
        document.getElementById("team-a-player-1")?.value || "",
        document.getElementById("team-a-player-2")?.value || "",
        document.getElementById("team-b-player-1")?.value || "",
        document.getElementById("team-b-player-2")?.value || ""
    ];
}

/*
 * Befüllt alle vier Spieler-Dropdowns neu.
 * Bereits gewählte Spieler bleiben im eigenen Feld sichtbar,
 * werden aber in den anderen Feldern ausgeblendet.
 */
function renderAllPlayerSelects() {
    const selectIds = [
        "team-a-player-1",
        "team-a-player-2",
        "team-b-player-1",
        "team-b-player-2"
    ];

    const selectedValues = getSelectedPlayerIds();

    selectIds.forEach((selectId, currentIndex) => {
        const select = document.getElementById(selectId);
        if (!select) return;

        const currentValue = select.value;
        select.innerHTML = '<option value="">Bitte Spieler wählen</option>';

        allPlayers.forEach(player => {
            const playerId = String(player.id);

            const isSelectedElsewhere = selectedValues.some((selectedValue, selectedIndex) => {
                return selectedIndex !== currentIndex && selectedValue === playerId;
            });

            if (isSelectedElsewhere && currentValue !== playerId) {
                return;
            }

            const option = document.createElement("option");
            option.value = player.id;
            option.textContent = player.name;
            select.appendChild(option);
        });

        select.value = currentValue;
    });
}

/*
 * Liest alle Setup-Werte aus dem Formular.
 * Leere Teamnamen werden noch nicht ersetzt, sondern roh zurückgegeben.
 */
function getSelectionFormData() {
    return {
        teamNameA: document.getElementById("team-name-a")?.value.trim() || "",
        teamNameB: document.getElementById("team-name-b")?.value.trim() || "",
        teamAPlayer1: document.getElementById("team-a-player-1")?.value || "",
        teamAPlayer2: document.getElementById("team-a-player-2")?.value || "",
        teamBPlayer1: document.getElementById("team-b-player-1")?.value || "",
        teamBPlayer2: document.getElementById("team-b-player-2")?.value || ""
    };
}

/*
 * Prüft, ob genau vier unterschiedliche Spieler gewählt wurden.
 */
function validateSelection(data) {
    const playerIds = [
        data.teamAPlayer1,
        data.teamAPlayer2,
        data.teamBPlayer1,
        data.teamBPlayer2
    ];

    if (playerIds.some(id => !id)) {
        return {
            valid: false,
            error: "Bitte für beide Teams jeweils zwei Spieler auswählen."
        };
    }

    const uniqueIds = new Set(playerIds);

    if (uniqueIds.size !== 4) {
        return {
            valid: false,
            error: "Ein Spieler darf nicht mehrfach im selben Match ausgewählt werden."
        };
    }

    return {
        valid: true,
        error: null
    };
}

/*
 * Erzeugt die finalen Teamnamen.
 * Leere Eingaben werden automatisch durch Standardnamen ersetzt.
 */
function buildFinalTeamNames(data) {
    return {
        teamNameA: data.teamNameA || "Team A",
        teamNameB: data.teamNameB || "Team B"
    };
}

// Liest den angezeigten Namen aus dem Dropdown aus
function getPlayerName(selectId) {
    const select = document.getElementById(selectId);
    if (!select || select.selectedIndex === -1) return "Unbekannt";
    return select.options[select.selectedIndex].text;
}

/*
 * Sendet das Setup an das Backend und startet damit ein neues aktives Match.
 * Danach erfolgt die Weiterleitung auf /match.
 */
async function submitPlayerSelection(event) {
    event.preventDefault();
    hideSelectionMessage();

    const formData = getSelectionFormData();
    const validation = validateSelection(formData);

    if (!validation.valid) {
        showSelectionMessage(validation.error, "warning");
        return;
    }

    const finalTeamNames = buildFinalTeamNames(formData);

    try {
        const response = await fetch("/api/match/start", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                team_name_a: finalTeamNames.teamNameA,
                team_name_b: finalTeamNames.teamNameB,
                players: [
                    {
                        player_id: Number(formData.teamAPlayer1),
                        player_name: getPlayerName("team-a-player-1"),
                        team: "A",
                        team_slot: 1
                    },
                    {
                        player_id: Number(formData.teamAPlayer2),
                        player_name: getPlayerName("team-a-player-2"),
                        team: "A",
                        team_slot: 2
                    },
                    {
                        player_id: Number(formData.teamBPlayer1),
                        player_name: getPlayerName("team-b-player-1"),
                        team: "B",
                        team_slot: 1
                    },
                    {
                        player_id: Number(formData.teamBPlayer2),
                        player_name: getPlayerName("team-b-player-2"),
                        team: "B",
                        team_slot: 2
                    }
                ]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showSelectionMessage(data.error || "Match konnte nicht gestartet werden.", "danger");
            return;
        }

        window.location.href = "/match";
    } catch (error) {
        console.error("Fehler beim Starten des Matches:", error);
        showSelectionMessage("Verbindung zum Server fehlgeschlagen.", "danger");
    }
}

/*
 * Registriert Änderungs-Events für alle Spieler-Dropdowns,
 * damit doppelte Spieler direkt verhindert werden.
 */
function initPlayerSelectEvents() {
    const selectIds = [
        "team-a-player-1",
        "team-a-player-2",
        "team-b-player-1",
        "team-b-player-2"
    ];

    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        select.addEventListener("change", () => {
            hideSelectionMessage();
            renderAllPlayerSelects();
        });
    });
}

/*
 * Registriert das Absenden des Setup-Formulars.
 */
function initPlayerSelectionForm() {
    const form = document.getElementById("player-selection-form");
    if (!form) return;

    form.addEventListener("submit", submitPlayerSelection);
}

/*
 * Initialisiert die komplette Setup-Seite.
 */
function initPlayerSelectionPage() {
    initPlayerSelectEvents();
    initPlayerSelectionForm();
    loadPlayersForSelection();
}

document.addEventListener("DOMContentLoaded", initPlayerSelectionPage);