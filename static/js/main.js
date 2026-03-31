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
            <div class="d-flex justify-content-between align-items-center gap-3 w-100">
                <div>
                    <span>${player.name}</span>
                    <span class="badge text-bg-secondary ms-2">ID: ${player.id}</span>
                </div>
        
                <div class="d-flex gap-2">
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-primary edit-player-btn"
                        data-player-id="${player.id}"
                        data-player-name="${player.name}"
                    >
                        Bearbeiten
                    </button>
        
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-danger delete-player-btn"
                        data-player-id="${player.id}"
                        data-player-name="${player.name}"
                    >
                        Löschen
                    </button>
                </div>
            </div>
        `;
        playerList.appendChild(li);
    });
}

function initPlayerActionEvents() {
    const playerList = document.getElementById("player-list");

    if (!playerList) return;

    playerList.addEventListener("click", event => {
        const editButton = event.target.closest(".edit-player-btn");
        const deleteButton = event.target.closest(".delete-player-btn");

        if (editButton) {
            const playerId = Number(editButton.dataset.playerId);
            const playerName = editButton.dataset.playerName;
            handleEditPlayer(playerId, playerName);
            return;
        }

        if (deleteButton) {
            const playerId = Number(deleteButton.dataset.playerId);
            const playerName = deleteButton.dataset.playerName;
            handleDeletePlayer(playerId, playerName);
        }
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

async function handleEditPlayer(playerId, currentName) {
    const newName = prompt("Neuen Namen eingeben:", currentName);

    if (newName === null) return;

    const trimmedName = newName.trim();

    if (trimmedName === "") {
        alert("Der Name darf nicht leer sein.");
        return;
    }

    try {
        const response = await fetch(`/players/${playerId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name: trimmedName })
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Fehler beim Aktualisieren des Spielers.");
            return;
        }

        await loadPlayers();
        await loadPlayerStats();
        await loadMatches();
    } catch (error) {
        console.error("Fehler beim Bearbeiten des Spielers:", error);
        alert("Spieler konnte nicht bearbeitet werden.");
    }
}


async function handleDeletePlayer(playerId, playerName) {
    const confirmed = confirm(`Willst du den Spieler "${playerName}" wirklich löschen?`);

    if (!confirmed) return;

    try {
        const response = await fetch(`/players/${playerId}`, {
            method: "DELETE"
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || "Fehler beim Löschen des Spielers.");
            return;
        }

        await loadPlayers();
        await loadPlayerStats();
    } catch (error) {
        console.error("Fehler beim Löschen des Spielers:", error);
        alert("Spieler konnte nicht gelöscht werden.");
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
        await loadPlayerStats();

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

function formatPlayerNames(players) {
    if (!players || players.length === 0) {
        return "-";
    }

    return players
        .sort((a, b) => a.team_slot - b.team_slot)
        .map(player => player.name)
        .join(", ");
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

        const teamAPlayers = formatPlayerNames(match.team_a_players);
        const teamBPlayers = formatPlayerNames(match.team_b_players);
        const scoreText = `${match.score_team_a} : ${match.score_team_b}`;
        const winnerText = match.winner_team === "A" ? "Team A" : "Team B";

        row.innerHTML = `
        <td>${match.id}</td>
        <td>${formatMatchDate(match.played_at)}</td>
        <td>${teamAPlayers}</td>
        <td>${teamBPlayers}</td>
        <td>${scoreText}</td>
        <td>${match.point_diff}</td>
        <td>${winnerText}</td>
    `;

        tbody.appendChild(row);
    });
}

function renderPlayerStats(stats) {
    const emptyState = document.getElementById("player-stats-empty");
    const wrapper = document.getElementById("player-stats-wrapper");
    const tbody = document.getElementById("player-stats-body");

    if (!emptyState || !wrapper || !tbody) return;

    tbody.innerHTML = "";

    if (!stats || stats.length === 0) {
        emptyState.classList.remove("d-none");
        wrapper.classList.add("d-none");
        return;
    }

    emptyState.classList.add("d-none");
    wrapper.classList.remove("d-none");

    stats.forEach(player => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${player.name}</td>
            <td>${player.matches_played}</td>
            <td>${player.wins}</td>
            <td>${player.losses}</td>
            <td>${player.win_rate} %</td>
            <td>${player.avg_point_diff}</td>
        `;

        tbody.appendChild(row);
    });
}

async function loadPlayerStats() {
    try {
        const response = await fetch("/player-stats");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /player-stats:", response.status, text);
            alert(`Fehler beim Laden der Spielerstatistiken (${response.status}).`);
            return;
        }

        const stats = await response.json();
        renderPlayerStats(stats);
    } catch (error) {
        console.error("Fehler beim Laden der Spielerstatistiken:", error);
        alert("Spielerstatistiken konnten nicht geladen werden.");
    }
}

function getRatingConfig(systemName) {
    const config = {
        elo: {
            emptyId: "elo-ratings-empty",
            wrapperId: "elo-ratings-wrapper",
            bodyId: "elo-ratings-body"
        },
        glicko2: {
            emptyId: "glicko2-ratings-empty",
            wrapperId: "glicko2-ratings-wrapper",
            bodyId: "glicko2-ratings-body"
        },
        trueskill: {
            emptyId: "trueskill-ratings-empty",
            wrapperId: "trueskill-ratings-wrapper",
            bodyId: "trueskill-ratings-body"
        }
    };

    return config[systemName] || null;
}

function getSortableRatingValue(player, systemName) {
    if (systemName === "elo" || systemName === "glicko2") {
        return player.rating ?? -999999;
    }

    if (systemName === "trueskill") {
        return player.mu ?? -999999;
    }

    return -999999;
}

function renderRatingsForSystem(systemName, ratings) {
    const config = getRatingConfig(systemName);

    if (!config) return;

    const emptyState = document.getElementById(config.emptyId);
    const wrapper = document.getElementById(config.wrapperId);
    const tbody = document.getElementById(config.bodyId);

    if (!emptyState || !wrapper || !tbody) return;

    tbody.innerHTML = "";

    if (!ratings || ratings.length === 0) {
        emptyState.classList.remove("d-none");
        wrapper.classList.add("d-none");
        return;
    }

    emptyState.classList.add("d-none");
    wrapper.classList.remove("d-none");

    const sortedRatings = [...ratings].sort((a, b) => {
        return getSortableRatingValue(b, systemName) - getSortableRatingValue(a, systemName);
    });

    sortedRatings.forEach((player, index) => {
        const row = document.createElement("tr");

        if (systemName === "elo") {
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${player.player_name}</td>
                <td>${player.rating ?? "-"}</td>
                <td>${player.matches_played}</td>
            `;
        } else if (systemName === "glicko2") {
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${player.player_name}</td>
                <td>${player.rating ?? "-"}</td>
                <td>${player.rating_deviation ?? "-"}</td>
            `;
        } else if (systemName === "trueskill") {
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${player.player_name}</td>
                <td>${player.mu ?? "-"}</td>
                <td>${player.sigma ?? "-"}</td>
            `;
        }

        tbody.appendChild(row);
    });
}

async function loadRatingsForSystem(systemName) {
    try {
        const response = await fetch(`/ratings/${systemName}`);

        if (!response.ok) {
            const text = await response.text();
            console.error(`Fehlerhafte Antwort /ratings/${systemName}:`, response.status, text);
            alert(`Fehler beim Laden der ${systemName}-Ratings (${response.status}).`);
            return;
        }

        const data = await response.json();
        renderRatingsForSystem(systemName, data.ratings);
    } catch (error) {
        console.error(`Fehler beim Laden der ${systemName}-Ratings:`, error);
        alert(`${systemName}-Ratings konnten nicht geladen werden.`);
    }
}

async function loadAllRatings() {
    await loadRatingsForSystem("elo");
    await loadRatingsForSystem("glicko2");
    await loadRatingsForSystem("trueskill");
}

async function processRatingsForSystem(systemName) {
    try {
        const response = await fetch(`/ratings/process/${systemName}`, {
            method: "POST"
        });

        const data = await response.json();

        if (!response.ok) {
            alert(data.error || `Fehler bei der ${systemName}-Verarbeitung.`);
            return;
        }

        await loadRatingsForSystem(systemName);
        alert(`${systemName}-Verarbeitung abgeschlossen. Verarbeitete Matches: ${data.processed_matches}`);
    } catch (error) {
        console.error(`Fehler bei der ${systemName}-Verarbeitung:`, error);
        alert(`${systemName}-Ratings konnten nicht verarbeitet werden.`);
    }
}

function initRatingsSection() {
    const processEloBtn = document.getElementById("process-elo-btn");
    const processGlicko2Btn = document.getElementById("process-glicko2-btn");
    const processTrueSkillBtn = document.getElementById("process-trueskill-btn");

    if (processEloBtn) {
        processEloBtn.addEventListener("click", () => processRatingsForSystem("elo"));
    }

    if (processGlicko2Btn) {
        processGlicko2Btn.addEventListener("click", () => processRatingsForSystem("glicko2"));
    }

    if (processTrueSkillBtn) {
        processTrueSkillBtn.addEventListener("click", () => processRatingsForSystem("trueskill"));
    }
}

function init() {
    initScoreButtons();
    initManualButtons();
    initManualEnterKey();
    initUndoButton();
    initResetButton();
    initPlayerSection();
    initPlayerActionEvents();
    initRatingsSection();
    loadPlayers();
    loadMatches();
    loadPlayerStats();
    loadAllRatings();
}

init();
