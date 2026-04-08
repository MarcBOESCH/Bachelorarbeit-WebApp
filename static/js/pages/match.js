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

    const teamNameA = game.team_name_a ?? "Team A";
    const teamNameB = game.team_name_b ?? "Team B";

    document.getElementById("score-a").textContent = scoreA;
    document.getElementById("score-b").textContent = scoreB;
    document.getElementById("point-diff").textContent = diff;

    const leaderElement = document.getElementById("leader");
    const pointsWinElement = document.getElementById("points-win");

    if (scoreA > scoreB) {
        leaderElement.textContent = teamNameA;
        pointsWinElement.textContent = Math.max(0, 1000 - scoreA);
    } else if (scoreB > scoreA) {
        leaderElement.textContent = teamNameB;
        pointsWinElement.textContent = Math.max(0, 1000 - scoreB);
    } else {
        leaderElement.textContent = "-";
        pointsWinElement.textContent = 1000;
    }

    renderSnakeScores("a", scoreA, game.undo_a);
    renderSnakeScores("b", scoreB, game.undo_b);
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

    // Fokus entfernen (schließt die Handy-Tastatur)
    inputA.blur();
    inputB.blur();
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
    const scoreButtons = document.querySelectorAll(".score-btn, .snake-hotspot-area");
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

// ==========================================
// SCHLANGEN-MODUS & TOGGLE LOGIK
// ==========================================

function initModeToggle() {
    const btnClassic = document.getElementById('btn-mode-classic');
    const btnSnake = document.getElementById('btn-mode-snake');
    const classicControls = document.getElementById('classic-controls');
    const snakeControls = document.getElementById('snake-controls');

    if (!btnClassic || !btnSnake) return;

    // Gespeicherten Modus laden (Standard: Klassisch)
    const savedMode = localStorage.getItem('jassScoreMode') || 'classic';
    setMode(savedMode);

    btnClassic.addEventListener('click', () => setMode('classic'));
    btnSnake.addEventListener('click', () => setMode('snake'));

    function setMode(mode) {
        localStorage.setItem('jassScoreMode', mode);
        if (mode === 'classic') {
            btnClassic.classList.add('active');
            btnSnake.classList.remove('active');
            classicControls.classList.remove('d-none');
            snakeControls.classList.add('d-none');
        } else {
            btnSnake.classList.add('active');
            btnClassic.classList.remove('active');
            snakeControls.classList.remove('d-none');
            classicControls.classList.add('d-none');
        }
    }
}

// Berechnet die Striche exakt anhand der Zug-Historie und zerlegt manuelle Eingaben
function renderSnakeScores(teamLower, currentScore, undoHistory) {
    let tallies = { '100': 0, '50': 0, '20': 0 };
    let rest = 0;

    // Wenn eine Historie vorliegt, werten wir die exakten Züge aus
    if (undoHistory && undoHistory.length > 0) {
        let previousScore = 0;
        let additions = [];

        // Berechne die Differenz zwischen jedem Zug in der Historie
        for (let i = 0; i < undoHistory.length; i++) {
            let diff = undoHistory[i] - previousScore;
            if (diff > 0) additions.push(diff);
            previousScore = undoHistory[i];
        }

        // Berechne den finalen Zug (vom letzten Undo-State zum jetzigen Score)
        let finalDiff = currentScore - previousScore;
        if (finalDiff > 0) additions.push(finalDiff);

        // Zähle die exakten Striche
        additions.forEach(val => {
            if (val === 200) {
                tallies['100'] += 2;
            } else if (val === 150) {
                tallies['100'] += 1;
                tallies['50'] += 1;
            } else if (val === 100) {
                tallies['100']++;
            } else if (val === 50) {
                tallies['50']++;
            } else if (val === 20) {
                tallies['20']++;
            } else {
                let temp = val;
                tallies['100'] += Math.floor(temp / 100);
                temp %= 100;
                tallies['50'] += Math.floor(temp / 50);
                temp %= 50;
                tallies['20'] += Math.floor(temp / 20);
                rest += temp % 20;
            }
        });
    } else {
        let s = currentScore || 0;
        tallies['100'] = Math.floor(s / 100);
        s %= 100;
        tallies['50'] = Math.floor(s / 50);
        s %= 50;
        tallies['20'] = Math.floor(s / 20);
        rest = s % 20;
    }

    // 5x 20er = 1x 100er
    if (tallies['20'] > 10) {
        tallies['100'] += Math.floor(tallies['20'] / 5);
        tallies['20'] = tallies['20'] % 5;
    }

    // 2x 50er = 1x 100er
    if (tallies['50'] > 10) {
        tallies['100'] += Math.floor(tallies['50'] / 2);
        tallies['50'] = tallies['50'] % 2;
    }

    drawTallies(`tally-${teamLower}-100`, tallies['100']);
    drawTallies(`tally-${teamLower}-50`, tallies['50']);
    drawTallies(`tally-${teamLower}-20`, tallies['20']);

    const restEl = document.getElementById(`rest-${teamLower}`);
    if (restEl) {
        restEl.textContent = rest > 0 ? rest : "";
    }
}

// Zeichnet die Striche als HTML-Elemente in den Container
function drawTallies(containerId, count) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const tally = document.createElement("div");
        tally.className = "snake-tally";
        container.appendChild(tally);
    }
}

// Stellt beim ersten Seitenaufbau sicher, dass die Schlange direkt stimmt
function initSnakeScoresOnLoad() {
    // Holt sich den gespeicherten Zustand, den wir in match.html ganz unten injiziert haben
    const game = window.INITIAL_GAME_STATE;
    if (game) {
        renderSnakeScores("a", game.score_a, game.undo_a);
        renderSnakeScores("b", game.score_b, game.undo_b);
    } else {
        // Fallback, falls INITIAL_GAME_STATE nicht existiert
        const scoreA = parseInt(document.getElementById("score-a")?.textContent) || 0;
        const scoreB = parseInt(document.getElementById("score-b")?.textContent) || 0;
        renderSnakeScores("a", scoreA);
        renderSnakeScores("b", scoreB);
    }
}

// Initialisiert die komplette Match-Seite.
function initMatchPage() {
    initScoreButtons();
    initManualButton();
    initManualEnterKey();
    initUndoButton();
    initResetButton();
    initModeToggle();
    initSnakeScoresOnLoad();
}

document.addEventListener("DOMContentLoaded", initMatchPage);