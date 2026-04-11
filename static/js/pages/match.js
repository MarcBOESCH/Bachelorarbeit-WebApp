let matchFinished = false;
let newGameModalInstance;

/* =========================
   API / Match-Aktionen
========================= */

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
        showMatchStatusMessage(`${winnerName} hat gewonnen 🏆`);
        showToast("Das Match wurde gespeichert.", "success");

        triggerConfetti();

        matchFinished = true;
        setMatchInputsDisabled(true);

        return true;
    } catch (error) {
        console.error("Fehler beim Speichern des Matches:", error);
        showToast("Das Match konnte nicht gespeichert werden.", "error");
        return false;
    }
}

/* =========================
   UI-Updates
========================= */

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

    if (!messageBox) {
        return;
    }

    messageBox.textContent = message;
    messageBox.classList.remove("d-none");
}

// Versteckt die Match-Statusmeldung wieder.
function hideMatchStatusMessage() {
    const messageBox = document.getElementById("match-status-message");

    if (!messageBox) {
        return;
    }

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

    ["manual-score-a", "manual-score-b", "manual-submit-btn"].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = disabled;
        }
    });
}

/* =========================
   Match-Ende
========================= */

// Prüft nach jeder Punktänderung, ob das Match beendet ist.
// Wenn ja, wird es automatisch gespeichert.
async function checkMatchFinishedAndSave(game) {
    if (!game || matchFinished) {
        return;
    }

    const scoreA = game.score_a ?? 0;
    const scoreB = game.score_b ?? 0;
    const maxPoints = game.max_points ?? 1000;

    const hasWinner =
        (scoreA >= maxPoints && scoreA > scoreB) ||
        (scoreB >= maxPoints && scoreB > scoreA);

    if (!hasWinner) {
        return;
    }

    await saveFinishedMatch(game);
}

/* =========================
   Punkteingabe
========================= */

// Event-Handler für die Punktebuttons (+20, +50, ...).
async function handleScoreButtonClick(event) {
    const button = event.currentTarget;
    const team = button.dataset.team;
    const points = button.dataset.points;

    await sendAction({
        action: `score_${points}`,
        team
    });
}

// Prüft, ob ein manueller Punktewert gültig ist.
function isValidManualScore(score) {
    return Number.isInteger(score) && score >= 0 && (score <= 157 || score === 257);
}

// Event-Handler für die manuelle Punkteingabe.
async function handleManualSubmit() {
    const inputA = document.getElementById("manual-score-a");
    const inputB = document.getElementById("manual-score-b");

    if (!inputA || !inputB) {
        return;
    }

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

    if (valueA !== "") {
        const pointsA = Number(valueA);

        if (!isValidManualScore(pointsA)) {
            showToast(
                "Bitte einen Wert zwischen 0 und 157 eingeben. 0 bedeutet Matsch für das andere Team, 257 Matsch für das gewählte Team.",
                "error"
            );
            return;
        }

        await sendAction({
            action: "manual_input",
            team: "A",
            value: pointsA
        });
    }

    if (valueB !== "") {
        const pointsB = Number(valueB);

        if (!isValidManualScore(pointsB)) {
            showToast(
                "Bitte einen Wert zwischen 0 und 157 eingeben. 0 bedeutet Matsch für das andere Team, 257 Matsch für das gewählte Team.",
                "error"
            );
            return;
        }

        await sendAction({
            action: "manual_input",
            team: "B",
            value: pointsB
        });
    }

    inputA.value = "";
    inputB.value = "";

    inputA.blur();
    inputB.blur();
}

/* =========================
   Buttons / Events
========================= */

// Verknüpft den gemeinsamen Button für manuelle Eingabe.
function initManualButton() {
    const manualSubmitBtn = document.getElementById("manual-submit-btn");

    if (!manualSubmitBtn) {
        return;
    }

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

    if (!undoBtn) {
        return;
    }

    undoBtn.addEventListener("click", async () => {
        await sendAction({ action: "undo" });
    });
}

// Verknüpft den Reset-Button mit dem Modal.
function initNewGameButton() {
    const resetBtn = document.getElementById("reset-btn");
    const confirmBtn = document.getElementById("confirm-new-game-btn");
    const modalElement = document.getElementById("confirmNewGameModal");

    if (!resetBtn || !modalElement || !confirmBtn) {
        return;
    }

    newGameModalInstance = new bootstrap.Modal(modalElement);

    resetBtn.addEventListener("click", async () => {
        if (matchFinished) {
            const result = await sendAction({ action: "new_game" });

            if (result?.redirect_url) {
                window.location.href = result.redirect_url;
            }

            return;
        }

        newGameModalInstance.show();
    });

    confirmBtn.addEventListener("click", async () => {
        newGameModalInstance.hide();

        const result = await sendAction({ action: "new_game" });

        if (result?.redirect_url) {
            window.location.href = result.redirect_url;
        }
    });
}

/* =========================
   Modus-Umschaltung
========================= */

function initModeToggle() {
    const btnClassic = document.getElementById("btn-mode-classic");
    const btnSnake = document.getElementById("btn-mode-snake");
    const classicControls = document.getElementById("classic-controls");
    const snakeControls = document.getElementById("snake-controls");

    if (!btnClassic || !btnSnake || !classicControls || !snakeControls) {
        return;
    }

    const savedMode = localStorage.getItem("jassScoreMode") || "classic";
    setMode(savedMode);

    btnClassic.addEventListener("click", () => setMode("classic"));
    btnSnake.addEventListener("click", () => setMode("snake"));

    function setMode(mode) {
        localStorage.setItem("jassScoreMode", mode);

        const isClassic = mode === "classic";

        btnClassic.classList.toggle("active", isClassic);
        btnSnake.classList.toggle("active", !isClassic);

        classicControls.classList.toggle("d-none", !isClassic);
        snakeControls.classList.toggle("d-none", isClassic);
    }
}

/* =========================
   Schlange / Tallies
========================= */

// Zeichnet die Striche als HTML-Elemente in den Container.
function drawTallies(containerId, count) {
    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    container.innerHTML = "";

    for (let i = 0; i < count; i += 1) {
        const tally = document.createElement("div");
        tally.className = "snake-tally";
        container.appendChild(tally);
    }
}

// Berechnet die Striche exakt anhand der Zug-Historie und zerlegt manuelle Eingaben.
function renderSnakeScores(teamLower, currentScore, undoHistory) {
    const tallies = { 100: 0, 50: 0, 20: 0 };
    let rest = 0;

    if (undoHistory && undoHistory.length > 0) {
        let previousScore = 0;
        const additions = [];

        for (let i = 0; i < undoHistory.length; i += 1) {
            const diff = undoHistory[i] - previousScore;

            if (diff > 0) {
                additions.push(diff);
            }

            previousScore = undoHistory[i];
        }

        const finalDiff = currentScore - previousScore;
        if (finalDiff > 0) {
            additions.push(finalDiff);
        }

        additions.forEach(value => {
            if (value === 200) {
                tallies[100] += 2;
            } else if (value === 150) {
                tallies[100] += 1;
                tallies[50] += 1;
            } else if (value === 100) {
                tallies[100] += 1;
            } else if (value === 50) {
                tallies[50] += 1;
            } else if (value === 20) {
                tallies[20] += 1;
            } else {
                let remaining = value;

                tallies[100] += Math.floor(remaining / 100);
                remaining %= 100;

                tallies[50] += Math.floor(remaining / 50);
                remaining %= 50;

                tallies[20] += Math.floor(remaining / 20);
                rest += remaining % 20;
            }
        });
    } else {
        let remaining = currentScore || 0;

        tallies[100] = Math.floor(remaining / 100);
        remaining %= 100;

        tallies[50] = Math.floor(remaining / 50);
        remaining %= 50;

        tallies[20] = Math.floor(remaining / 20);
        rest = remaining % 20;
    }

    if (tallies[20] > 10) {
        tallies[100] += Math.floor(tallies[20] / 5);
        tallies[20] %= 5;
    }

    if (tallies[50] > 10) {
        tallies[100] += Math.floor(tallies[50] / 2);
        tallies[50] %= 2;
    }

    drawTallies(`tally-${teamLower}-100`, tallies[100]);
    drawTallies(`tally-${teamLower}-50`, tallies[50]);
    drawTallies(`tally-${teamLower}-20`, tallies[20]);

    const restElement = document.getElementById(`rest-${teamLower}`);
    if (restElement) {
        restElement.textContent = rest > 0 ? rest : "";
    }
}

// Stellt beim ersten Seitenaufbau sicher, dass die Schlange direkt stimmt.
function initSnakeScoresOnLoad() {
    const game = window.INITIAL_GAME_STATE;

    if (game) {
        renderSnakeScores("a", game.score_a, game.undo_a);
        renderSnakeScores("b", game.score_b, game.undo_b);
        return;
    }

    const scoreA = parseInt(document.getElementById("score-a")?.textContent, 10) || 0;
    const scoreB = parseInt(document.getElementById("score-b")?.textContent, 10) || 0;

    renderSnakeScores("a", scoreA);
    renderSnakeScores("b", scoreB);
}

/* =========================
   Effekte
========================= */

// Feuert eine Konfetti-Animation in den App-Farben ab, zentriert auf den Content-Bereich.
function triggerConfetti() {
    if (typeof confetti !== "function") {
        return;
    }

    let originX = 0.5;

    if (window.innerWidth >= 768) {
        const sidebarWidth = 300;
        const contentWidth = window.innerWidth - sidebarWidth;
        const centerPixelX = sidebarWidth + (contentWidth / 2);
        originX = centerPixelX / window.innerWidth;
    }

    confetti({
        particleCount: 150,
        spread: 80,
        origin: { x: originX, y: 0.6 },
        colors: ["#0f5132", "#f3b63f", "#ffffff", "#0b3d26"],
        disableForReducedMotion: true
    });
}

/* =========================
   Initialisierung
========================= */

// Initialisiert die komplette Match-Seite.
function initMatchPage() {
    hideMatchStatusMessage();
    initScoreButtons();
    initManualButton();
    initManualEnterKey();
    initUndoButton();
    initNewGameButton();
    initModeToggle();
    initSnakeScoresOnLoad();
}

document.addEventListener("DOMContentLoaded", initMatchPage);