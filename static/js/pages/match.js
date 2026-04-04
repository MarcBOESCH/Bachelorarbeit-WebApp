let matchFinished = false;

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

// Speichert ein abgeschlossenes Match in der Datenbank.
async function saveFinishedMatch(game) {
    try {
        const response = await fetch("/api/matches", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                score_team_a: game.score_a,
                score_team_b: game.score_b,
                winner_team: game.score_a > game.score_b ? "A" : "B"
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

// Initialisiert die komplette Match-Seite.
function initMatchPage() {
    initScoreButtons();
    initManualButtons();
    initManualEnterKey();
    initUndoButton();
    initResetButton();
}

document.addEventListener("DOMContentLoaded", initMatchPage);