
let currentEvaluationDetailSystem = "elo";


























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
        await loadEvaluationForSystem(systemName);

        if (systemName === currentEvaluationDetailSystem) {
            await loadEvaluationDetails(systemName);
        }

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

function getEvaluationConfig(systemName) {
    const config = {
        elo: {
            emptyId: "evaluation-elo-empty",
            contentId: "evaluation-elo-content",
            accuracyId: "evaluation-elo-accuracy",
            correctId: "evaluation-elo-correct",
            totalId: "evaluation-elo-total",
            brierId: "evaluation-elo-brier",
            logLossId: "evaluation-elo-logloss",
        },
        glicko2: {
            emptyId: "evaluation-glicko2-empty",
            contentId: "evaluation-glicko2-content",
            accuracyId: "evaluation-glicko2-accuracy",
            correctId: "evaluation-glicko2-correct",
            totalId: "evaluation-glicko2-total",
            brierId: "evaluation-glicko2-brier",
            logLossId: "evaluation-glicko2-logloss"
        },
        trueskill: {
            emptyId: "evaluation-trueskill-empty",
            contentId: "evaluation-trueskill-content",
            accuracyId: "evaluation-trueskill-accuracy",
            correctId: "evaluation-trueskill-correct",
            totalId: "evaluation-trueskill-total",
            brierId: "evaluation-trueskill-brier",
            logLossId: "evaluation-trueskill-logloss"
        }
    };

    return config[systemName] || null;
}

function renderEvaluation(systemName, data) {
    const config = getEvaluationConfig(systemName);

    if (!config) return;

    const emptyState = document.getElementById(config.emptyId);
    const content = document.getElementById(config.contentId);
    const accuracy = document.getElementById(config.accuracyId);
    const correct = document.getElementById(config.correctId);
    const total = document.getElementById(config.totalId);
    const brier = document.getElementById(config.brierId);
    const logLoss = document.getElementById(config.logLossId);

    if (!emptyState || !content || !accuracy || !correct || !total || !brier || !logLoss) return;

    if (!data || !data.total_predictions || data.total_predictions === 0) {
        emptyState.classList.remove("d-none");
        content.classList.add("d-none");
        return;
    }

    emptyState.classList.add("d-none");
    content.classList.remove("d-none");

    accuracy.textContent = data.accuracy;
    correct.textContent = data.correct_predictions;
    total.textContent = data.total_predictions;
    brier.textContent = data.brier_score;
    logLoss.textContent = data.log_loss
}

async function loadEvaluationForSystem(systemName) {
    try {
        const response = await fetch(`/evaluation/${systemName}`);

        if (!response.ok) {
            const text = await response.text();
            console.error(`Fehlerhafte Antwort /evaluation/${systemName}:`, response.status, text);
            alert(`Fehler beim Laden der Evaluation für ${systemName} (${response.status}).`);
            return;
        }

        const data = await response.json();
        renderEvaluation(systemName, data);
    } catch (error) {
        console.error(`Fehler beim Laden der Evaluation für ${systemName}:`, error);
        alert(`Evaluation für ${systemName} konnte nicht geladen werden.`);
    }
}

async function loadAllEvaluations() {
    await loadEvaluationForSystem("elo");
    await loadEvaluationForSystem("glicko2");
    await loadEvaluationForSystem("trueskill");
}

function renderEvaluationDetails(data) {
    const emptyState = document.getElementById("evaluation-details-empty");
    const wrapper = document.getElementById("evaluation-details-wrapper");
    const tbody = document.getElementById("evaluation-details-body");

    if (!emptyState || !wrapper || !tbody) return;

    tbody.innerHTML = "";

    if (!data || !data.details || data.details.length === 0) {
        emptyState.classList.remove("d-none");
        wrapper.classList.add("d-none");
        return;
    }

    emptyState.classList.add("d-none");
    wrapper.classList.remove("d-none");

    data.details.forEach(detail => {
        const row = document.createElement("tr");

        const predictedWinner = detail.predicted_winner === "A" ? "Team A" : "Team B";
        const actualWinner = detail.actual_winner === "A" ? "Team A" : "Team B";
        const resultText = detail.correct ? "Korrekt" : "Falsch";

        row.innerHTML = `
            <td>${detail.match_id}</td>
            <td>${predictedWinner}</td>
            <td>${actualWinner}</td>
            <td>${detail.confidence_a}</td>
            <td>${detail.confidence_b}</td>
            <td>${detail.brier_score}</td>
            <td>${detail.log_loss}</td>
            <td>${resultText}</td>
        `;

        tbody.appendChild(row);
    });
}

async function loadEvaluationDetails(systemName = currentEvaluationDetailSystem) {
    try {
        const response = await fetch(`/evaluation/${systemName}`);

        if (!response.ok) {
            const text = await response.text();
            console.error(`Fehlerhafte Antwort /evaluation/${systemName}:`, response.status, text);
            alert(`Fehler beim Laden der Evaluationsdetails für ${systemName} (${response.status}).`);
            return;
        }

        const data = await response.json();
        renderEvaluationDetails(data);
    } catch (error) {
        console.error(`Fehler beim Laden der Evaluationsdetails für ${systemName}:`, error);
        alert(`Evaluationsdetails für ${systemName} konnten nicht geladen werden.`);
    }
}

function initEvaluationDetailsSection() {
    const select = document.getElementById("evaluation-detail-system-select");

    if (!select) return;

    currentEvaluationDetailSystem = select.value;

    select.addEventListener("change", async event => {
        currentEvaluationDetailSystem = event.target.value;
        await loadEvaluationDetails(currentEvaluationDetailSystem);
    });
}

function init() {
    initScoreButtons();
    initManualButtons();
    initManualEnterKey();
    initUndoButton();
    initResetButton();
    initRatingsSection();
    initEvaluationDetailsSection();
    loadMatches();
    loadPlayerStats();
    loadAllRatings();
    loadAllEvaluations();
    loadEvaluationDetails();
}

init();
