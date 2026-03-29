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
        return data;
    } catch (error) {
        console.error("Fehler bei der Anfrage:", error);
        alert("Verbindung zum Server fehlgeschlagen.");
        return null;
    }
}

function updateUI(game) {
    const scoreA = game.score_a ?? 0;
    const scoreB = game.score_b ?? 0;
    const diff = scoreA - scoreB;

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

function clearManualInputs() {
    document.getElementById("manual-score-a").value = "";
    document.getElementById("manual-score-b").value = "";
}

async function handleScoreButtonClick(event) {
    const button = event.currentTarget;
    const team = button.dataset.team;
    const points = button.dataset.points;

    const action = `score_${points}`;

    await sendAction({
        action: action,
        team: team
    });
}

async function handleManualInput(team) {
    const input = document.getElementById(`manual-score-${team.toLowerCase()}`);
    const value = input.value.trim();

    if (value === "") {
        alert("Bitte einen Punktewert eingeben.");
        return;
    }

    await sendAction({
        action: "manual_input",
        team: team,
        value: Number(value)
    });

    input.value = "";
}

async function handleReset() {
    const confirmed = confirm("Willst du wirklich alle Punkte zurücksetzen?");
    if (!confirmed) return;

    await sendAction({
        action: "new_game"
    });

    clearManualInputs();
}

function initScoreButtons() {
    const scoreButtons = document.querySelectorAll(".score-btn");

    scoreButtons.forEach(button => {
        button.addEventListener("click", handleScoreButtonClick);
    });
}

function initManualButtons() {
    const manualBtnA = document.getElementById("manual-btn-a");
    const manualBtnB = document.getElementById("manual-btn-b");

    manualBtnA.addEventListener("click", () => handleManualInput("A"));
    manualBtnB.addEventListener("click", () => handleManualInput("B"));
}

function initManualEnterKey() {
    const inputA = document.getElementById("manual-score-a");
    const inputB = document.getElementById("manual-score-b");

    inputA.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            handleManualInput("A");
        }
    });

    inputB.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            handleManualInput("B");
        }
    });
}

function initUndoButton() {
    const undoBtn = document.getElementById("undo-btn");

    if (!undoBtn) return;

    undoBtn.addEventListener("click", async () => {
        await sendAction({
            action: "undo"
        });
    });
}

function initResetButton() {
    const resetBtn = document.getElementById("reset-btn");
    resetBtn.addEventListener("click", handleReset);
}

function init() {
    initScoreButtons();
    initManualButtons();
    initManualEnterKey();
    initUndoButton();
    initResetButton();
}

document.addEventListener("DOMContentLoaded", init);