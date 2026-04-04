let matchFinished = false;

// Lädt alle Spieler aus der API und befüllt die vier Auswahlfelder
// für die Match-Aufstellung.
async function loadPlayersForMatchSelects() {
    try {
        const response = await fetch("/api/players");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /api/players:", response.status, text);
            alert(`Fehler beim Laden der Spieler (${response.status}).`);
            return;
        }

        const players = await response.json();
        renderPlayerSelectOptions(players);
    } catch (error) {
        console.error("Fehler beim Laden der Spieler für Match-Auswahl:", error);
        alert("Spieler konnten nicht geladen werden.");
    }
}

// Sendet eine Spielaktion an das Backend, z. B. Punkte hinzufügen,
// Undo oder neues Spiel.
async function sendAction(payload) {
    try {
        const response = await fetch("/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Unbekannter Fehler");
            return null;
        }

        updateUI(data);
        await checkMatchFinishedAndSave(data);
        return data;
    } catch (error) {
        console.error("Fehler bei der Anfrage:", error);
        alert("Verbindung zum Server fehlgeschlagen.");
        return null;
    }
}

// Speichert ein abgeschlossenes Match inklusive Spielern und Teams
// in der Datenbank.
async function saveFinishedMatch(game) {
    const validation = validateSelectedPlayers();

    if (!validation.valid) {
        alert(validation.error);
        return false;
    }

    const selectedPlayers = getSelectedPlayers();

    try {
        const response = await fetch("/api/matches", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                score_team_a: game.score_a,
                score_team_b: game.score_b,
                winner_team: game.score_a > game.score_b ? "A" : "B",
                players: [
                    {
                        player_id: Number(selectedPlayers.teamAPlayer1),
                        team: "A",
                        team_slot: 1
                    },
                    {
                        player_id: Number(selectedPlayers.teamAPlayer2),
                        team: "A",
                        team_slot: 2
                    },
                    {
                        player_id: Number(selectedPlayers.teamBPlayer1),
                        team: "B",
                        team_slot: 1
                    },
                    {
                        player_id: Number(selectedPlayers.teamBPlayer2),
                        team: "B",
                        team_slot: 2
                    }
                ]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Fehler beim Speichern des Matches.");
            return false;
        }

        const winnerName = game.score_a > game.score_b ? "Team A" : "Team B";
        showMatchStatusMessage(`${winnerName} hat gewonnen. Das Match wurde erfolgreich gespeichert.`);

        matchFinished = true;
        setMatchInputsDisabled(true);

        return true;
    } catch (error) {
        console.error("Fehler beim Speichern des Matches:", error);
        alert("Das Match konnte nicht gespeichert werden.");
        return false;
    }
}

// Aktualisiert die sichtbaren Punkte und die Zusammenfassung im UI.
function updateUI(game) {
    const scoreA = game.score_a ?? 0;
    const scoreB = game.score_b ?? 0;
    const diff = Math.abs(scoreA - scoreB);

    document.getElementById("score-a").textContent = scoreA;
    document.getElementById("score-b").textContent = scoreB;

    document.getElementById("summary-a").textContent = scoreA;
    document.getElementById("summary-b").textContent = scoreB;
    document.getElementById("point-diff").textContent = diff;

    const leaderElement = document.getElementById("leader");

    if (scoreA > scoreB) {
        leaderElement.textContent = "Team A";
    } else if (scoreB > scoreA) {
        leaderElement.textContent = "Team B";
    } else {
        leaderElement.textContent = "-";
    }
}

// Leert die Felder für die manuelle Punkteingabe.
function clearManualInputs() {
    const inputA = document.getElementById("manual-score-a");
    const inputB = document.getElementById("manual-score-b");

    if (inputA) inputA.value = "";
    if (inputB) inputB.value = "";
}

// Blendet die Meldung ein, dass das Match gewonnen und gespeichert wurde.
function showMatchStatusMessage(message) {
    const messageBox = document.getElementById("match-status-message");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.classList.remove("d-none");
}

// Versteckt die Match-Statusmeldung wieder.
function hideMatchStatusMessage() {
    const messageBox = document.getElementById("match-status-message");

    if (!messageBox) return;

    messageBox.textContent = "";
    messageBox.classList.add("d-none");
}

// Aktiviert oder deaktiviert alle Eingabeelemente des Match-Bereichs.
function setMatchInputsDisabled(disabled) {
    document.querySelectorAll(".score-btn").forEach(button => {
        button.disabled = disabled;
    });

    const undoBtn = document.getElementById("undo-btn");
    if (undoBtn) {
        undoBtn.disabled = disabled;
    }

    const manualInputIds = [
        "manual-score-a",
        "manual-score-b",
        "manual-btn-a",
        "manual-btn-b"
    ];

    manualInputIds.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = disabled;
        }
    });
}

// Befüllt die vier Auswahlfelder für Team A und Team B mit allen Spielern.
function renderPlayerSelectOptions(players) {
    const selectIds = [
        "team-a-player-1",
        "team-a-player-2",
        "team-b-player-1",
        "team-b-player-2"
    ];

    selectIds.forEach(selectId => {
        const select = document.getElementById(selectId);

        if (!select) return;

        const currentValue = select.value;

        select.innerHTML = '<option value="">Bitte Spieler wählen</option>';

        players.forEach(player => {
            const option = document.createElement("option");
            option.value = player.id;
            option.textContent = player.name;
            select.appendChild(option);
        });

        select.value = currentValue;
    });

    updateAvailablePlayerOptions();
}

// Verhindert doppelte Spielerauswahl über alle vier Dropdowns hinweg.
function updateAvailablePlayerOptions() {
    const selectIds = [
        "team-a-player-1",
        "team-a-player-2",
        "team-b-player-1",
        "team-b-player-2"
    ];

    const selects = selectIds
        .map(id => document.getElementById(id))
        .filter(Boolean);

    const allPlayers = [];

    // Alle aktuell vorhandenen Optionen einsammeln
    selects.forEach(select => {
        Array.from(select.options).forEach(option => {
            if (!option.value) return;

            const alreadyExists = allPlayers.some(player => String(player.id) === option.value);
            if (!alreadyExists) {
                allPlayers.push({
                    id: option.value,
                    name: option.textContent
                });
            }
        });
    });

    const selectedValues = selects.map(select => select.value);

    selects.forEach((select, currentIndex) => {
        const currentValue = select.value;

        select.innerHTML = '<option value="">Bitte Spieler wählen</option>';

        allPlayers.forEach(player => {
            const isSelectedElsewhere = selectedValues.some((value, index) => {
                return index !== currentIndex && value === String(player.id);
            });

            // Aktuell gewählter Spieler im eigenen Feld soll erhalten bleiben
            if (isSelectedElsewhere && String(player.id) !== currentValue) {
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

// Liest die aktuell ausgewählten Spieler aus den vier Dropdowns aus.
function getSelectedPlayers() {
    return {
        teamAPlayer1: document.getElementById("team-a-player-1")?.value,
        teamAPlayer2: document.getElementById("team-a-player-2")?.value,
        teamBPlayer1: document.getElementById("team-b-player-1")?.value,
        teamBPlayer2: document.getElementById("team-b-player-2")?.value
    };
}

// Prüft, ob genau vier unterschiedliche Spieler ausgewählt wurden.
function validateSelectedPlayers() {
    const selected = getSelectedPlayers();

    const playerIds = [
        selected.teamAPlayer1,
        selected.teamAPlayer2,
        selected.teamBPlayer1,
        selected.teamBPlayer2
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

// Prüft nach jeder Punktänderung, ob das Match beendet ist.
// Wenn ja, wird es automatisch gespeichert.
async function checkMatchFinishedAndSave(game) {
    if (!game || matchFinished) return;

    const scoreA = game.score_a ?? 0;
    const scoreB = game.score_b ?? 0;
    const maxPoints = game.max_points ?? 1000;

    const hasWinner =
        (scoreA >= maxPoints && scoreA > scoreB) ||
        (scoreB >= maxPoints && scoreB > scoreA);

    if (!hasWinner) return;

    await saveFinishedMatch(game);
}

// Event-Handler für die Punktebuttons (+20, +50, ...).
async function handleScoreButtonClick(event) {
    const button = event.currentTarget;
    const team = button.dataset.team;
    const points = button.dataset.points;

    const action = `score_${points}`;

    await sendAction({
        action,
        team
    });
}

// Event-Handler für die manuelle Punkteingabe.
async function handleManualInput(team) {
    const input = document.getElementById(`manual-score-${team.toLowerCase()}`);
    if (!input) return;

    const value = input.value.trim();

    if (value === "") {
        alert("Bitte einen Punktewert eingeben.");
        return;
    }

    await sendAction({
        action: "manual_input",
        team,
        value: Number(value)
    });

    input.value = "";
}

// Event-Handler für "Neues Spiel".
async function handleReset() {
    const confirmed = confirm("Willst du wirklich alle Punkte zurücksetzen?");
    if (!confirmed) return;

    await sendAction({
        action: "new_game"
    });

    matchFinished = false;
    setMatchInputsDisabled(false);
    clearManualInputs();
    hideMatchStatusMessage();
}

// Verknüpft alle Punktebuttons mit ihrem Click-Handler.
function initScoreButtons() {
    const scoreButtons = document.querySelectorAll(".score-btn");

    scoreButtons.forEach(button => {
        button.addEventListener("click", handleScoreButtonClick);
    });
}

// Verknüpft die Buttons für manuelle Eingabe mit ihrem Handler.
function initManualButtons() {
    const manualBtnA = document.getElementById("manual-btn-a");
    const manualBtnB = document.getElementById("manual-btn-b");

    if (manualBtnA) {
        manualBtnA.addEventListener("click", () => handleManualInput("A"));
    }

    if (manualBtnB) {
        manualBtnB.addEventListener("click", () => handleManualInput("B"));
    }
}

// Erlaubt das Abschicken der manuellen Punkte per Enter-Taste.
function initManualEnterKey() {
    const inputA = document.getElementById("manual-score-a");
    const inputB = document.getElementById("manual-score-b");

    if (inputA) {
        inputA.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                handleManualInput("A");
            }
        });
    }

    if (inputB) {
        inputB.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                handleManualInput("B");
            }
        });
    }
}

// Verknüpft den Undo-Button mit der Undo-Aktion.
function initUndoButton() {
    const undoBtn = document.getElementById("undo-btn");

    if (!undoBtn) return;

    undoBtn.addEventListener("click", async () => {
        await sendAction({
            action: "undo"
        });
    });
}

// Verknüpft den Reset-Button mit dem Reset-Handler.
function initResetButton() {
    const resetBtn = document.getElementById("reset-btn");

    if (!resetBtn) return;

    resetBtn.addEventListener("click", handleReset);
}

// Reagiert auf Änderungen in den Spieler-Dropdowns und aktualisiert die Auswahl.
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
            updateAvailablePlayerOptions();
        });
    });
}

// Initialisiert die komplette Match-Seite.
function initMatchPage() {
    initScoreButtons();
    initManualButtons();
    initManualEnterKey();
    initUndoButton();
    initResetButton();
    initPlayerSelectEvents();
    loadPlayersForMatchSelects();
}

document.addEventListener("DOMContentLoaded", initMatchPage);