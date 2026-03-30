let matchFinished = false;

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

function renderPlayers(players) {
    const playerList = document.getElementById("player-list");
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
        li.innerHTML = `
            <span>${player.name}</span>
            <span class="badge text-bg-secondary">ID: ${player.id}</span>
        `;
        playerList.appendChild(li);
    });
}

async function loadPlayers() {
    try {
        const response = await fetch("/players");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /players:", response.status, text);
            alert(`Fehler beim Laden der Spieler (${response.status}).`);
            return;
        }

        const players = await response.json();

        renderPlayers(players);
        renderPlayerSelectOptions(players);
    } catch (error) {
        console.error("Fehler beim Laden der Spieler:", error);
        alert("Spieler konnten nicht geladen werden. Details in der Konsole.");
    }
}

async function createPlayer() {
    const input = document.getElementById("player-name");
    const name = input.value.trim();

    if (name === "") {
        alert("Bitte einen Spielernamen eingeben.");
        return;
    }

    try {
        const response = await fetch("/players", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: name })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Fehler beim Erstellen des Spielers.");
            return;
        }

        input.value = "";
        await loadPlayers();
    } catch (error) {
        console.error("Fehler beim Erstellen des Spielers:", error);
        alert("Verbindung zum Server fehlgeschlagen.");
    }
}

function initPlayerSection() {
    const createPlayerBtn = document.getElementById("create-player-btn");
    const playerNameInput = document.getElementById("player-name");

    if (!createPlayerBtn || !playerNameInput) return;

    createPlayerBtn.addEventListener("click", createPlayer);

    playerNameInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            createPlayer();
        }
    });
}

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
}

function getSelectedPlayers() {
    return {
        teamAPlayer1: document.getElementById("team-a-player-1").value,
        teamAPlayer2: document.getElementById("team-a-player-2").value,
        teamBPlayer1: document.getElementById("team-b-player-1").value,
        teamBPlayer2: document.getElementById("team-b-player-2").value
    };
}

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

    matchFinished = false;
    setMatchInputsDisabled(false);
    clearManualInputs();
    hideMatchStatusMessage();
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

function showMatchStatusMessage(message) {
    const messageBox = document.getElementById("match-status-message");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.classList.remove("d-none");
}

function hideMatchStatusMessage() {
    const messageBox = document.getElementById("match-status-message");

    if (!messageBox) return;

    messageBox.textContent = "";
    messageBox.classList.add("d-none");
}

async function saveFinishedMatch(game) {
    const validation = validateSelectedPlayers();

    if (!validation.valid) {
        alert(validation.error);
        return false;
    }

    const selectedPlayers = getSelectedPlayers();

    try {
        const response = await fetch("/matches", {
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
        await loadMatches();

        return true;
    } catch (error) {
        console.error("Fehler beim Speichern des Matches:", error);
        alert("Das Match konnte nicht gespeichert werden.");
        return false;
    }
}

function setMatchInputsDisabled(disabled) {
    document.querySelectorAll(".score-btn").forEach(button => {
        button.disabled = disabled;
    });

    document.getElementById("undo-btn").disabled = disabled;

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

function formatMatchDate(isoString) {
    const date = new Date(isoString);

    return date.toLocaleString("de-AT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

async function loadMatches() {
    try {
        const response = await fetch("/matches");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /matches:", response.status, text);
            alert(`Fehler beim Laden der Matchhistorie (${response.status}).`);
            return;
        }

        const matches = await response.json();
        renderMatchHistory(matches);
    } catch (error) {
        console.error("Fehler beim Laden der Matchhistorie:", error);
        alert("Matchhistorie konnte nicht geladen werden.");
    }
}

function renderMatchHistory(matches) {
    const emptyState = document.getElementById("match-history-empty");
    const wrapper = document.getElementById("match-history-wrapper");
    const tbody = document.getElementById("match-history-body");

    if (!emptyState || !wrapper || !tbody) return;

    tbody.innerHTML = "";

    if (!matches || matches.length === 0) {
        emptyState.classList.remove("d-none");
        wrapper.classList.add("d-none");
        return;
    }

    emptyState.classList.add("d-none");
    wrapper.classList.remove("d-none");

    matches.forEach(match => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${match.id}</td>
            <td>${formatMatchDate(match.played_at)}</td>
            <td>${match.score_team_a}</td>
            <td>${match.score_team_b}</td>
            <td>${match.point_diff}</td>
            <td>${match.winner_team}</td>
        `;

        tbody.appendChild(row);
    });
}

function init() {
    initScoreButtons();
    initManualButtons();
    initManualEnterKey();
    initUndoButton();
    initResetButton();
    initPlayerSection();
    loadPlayers();
    loadMatches();
}

document.addEventListener("DOMContentLoaded", init);