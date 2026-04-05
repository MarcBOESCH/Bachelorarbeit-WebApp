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
            showToast(data.error || "Unbekannter Fehler", "error");
            return null;
        }

        updateUI(data);
        await checkMatchFinishedAndSave(data);
        return data;
    } catch (error) {
        console.error("Fehler bei der Anfrage:", error);
        showToast("Verbindung zum Server fehlgeschlagen.", "error");
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
            showToast(data.error || "Fehler beim Speichern des Matches.", "error");
            return false;
        }

        const winnerName = game.score_a > game.score_b ? "Team A" : "Team B";
        showMatchStatusMessage(`${winnerName} hat gewonnen. Das Match wurde erfolgreich gespeichert.`);

        matchFinished = true;
        setMatchInputsDisabled(true);

        return true;
    } catch (error) {
        console.error("Fehler beim Speichern des Matches:", error);
        showToast("Das Match konnte nicht gespeichert werden.", "error");
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
        "manual-submit-btn",
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
async function handleManualSubmit(team) {
const inputA = document.getElementById("manual-score-a");
    const inputB = document.getElementById("manual-score-b");

    if (!inputA || !inputB) return;

    const valueA = inputA.value.trim();
    const valueB = inputB.value.trim();

    if (valueA === "" && valueB === "") {
        showToast("Bitte einen Punktewert eingeben.", "error");
        return;
    }

    if (valueA !== "" && valueB !== "") {
        showToast("Bitte nur ein Feld ausfüllen.", "error");
        return;
    }

    const roundTotal = 157;

    if (valueA !== "") {
        const pointsA = Number(valueA);

        if (!Number.isInteger(pointsA) || pointsA < 0 || pointsA > roundTotal) {
            showToast("Bitte einen Wert zwischen 0 und 157 eingeben.", "error");
            return;
        }

        const pointsB = roundTotal - pointsA;

        await sendAction({
            action: "manual_input",
            team: "A",
            value: pointsA
        });
    }

    if (valueB !== "") {
        const pointsB = Number(valueB);

        if (!Number.isInteger(pointsB) || pointsB < 0 || pointsB > roundTotal) {
            showToast("Bitte einen Wert zwischen 0 und 157 eingeben.", "error");
            return;
        }

        const pointsA = roundTotal - pointsB;

        await sendAction({
            action: "manual_input",
            team: "B",
            value: pointsB
        });
    }

    inputA.value = "";
    inputB.value = "";
}

// Verknüpft den gemeinsamen Button für manuelle Eingabe.
function initManualButton() {
    const manualSubmitBtn = document.getElementById("manual-submit-btn");

    if (!manualSubmitBtn) return;

    manualSubmitBtn.addEventListener("click", handleManualSubmit);
}

// Enter löst ebenfalls die manuelle Eingabe aus.
function initManualEnterKey() {
    const inputA = document.getElementById("manual-score-a");
    const inputB = document.getElementById("manual-score-b");

    if (inputA) {
        inputA.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                handleManualSubmit();
            }
        });
    }

    if (inputB) {
        inputB.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                handleManualSubmit();
            }
        });
    }
}

// Event-Handler für "Neues Spiel".
async function handleNewGame() {
    const confirmed = confirm("Willst du wirklich ein neues Spiel starten?");
    if (!confirmed) return;

    const result = await sendAction({
        action: "new_game"
    });

    if (result?.redirect_url) {
        window.location.href = result.redirect_url;
    }
}

// Verknüpft alle Punktebuttons mit ihrem Click-Handler.
function initScoreButtons() {
    const scoreButtons = document.querySelectorAll(".score-btn");

    scoreButtons.forEach(button => {
        button.addEventListener("click", handleScoreButtonClick);
    });
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

    resetBtn.addEventListener("click", handleNewGame);
}

// Initialisiert die komplette Match-Seite.
function initMatchPage() {
    initScoreButtons();
    initManualButton();
    initManualEnterKey();
    initUndoButton();
    initResetButton();
}

document.addEventListener("DOMContentLoaded", initMatchPage);