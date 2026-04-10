let currentEvaluationDetailSystem = "elo";

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

function formatNumber(value) {
    if (value === null || value === undefined) {
        return "-";
    }

    const number = Number(value);

    if (Number.isNaN(number)) {
        return "-";
    }

    if (Number.isInteger(number)) {
        return String(number);
    }

    return number.toFixed(2);
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
                <td>${formatNumber(player.rating)}</td>
                <td>${formatNumber(player.matches_played)}</td>
            `;
        } else if (systemName === "glicko2") {
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${player.player_name}</td>
                <td>${formatNumber(player.rating)}</td>
                <td>${formatNumber(player.rating_deviation)}</td>
            `;
        } else if (systemName === "trueskill") {
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${player.player_name}</td>
                <td>${formatNumber(player.mu)}</td>
                <td>${formatNumber(player.sigma)}</td>
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
            showToast(`Fehler beim Laden der ${systemName}-Ratings (${response.status}).`, "error");
            return;
        }

        const data = await response.json();
        renderRatingsForSystem(systemName, data.ratings);
    } catch (error) {
        console.error(`Fehler beim Laden der ${systemName}-Ratings:`, error);
        showToast(`${systemName}-Ratings konnten nicht geladen werden.`, "error");
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
            showToast(data.error || `Fehler bei der ${systemName}-Verarbeitung.`, "error");
            return;
        }

        await loadRatingsForSystem(systemName);
        await loadEvaluationForSystem(systemName);

        if (systemName === currentEvaluationDetailSystem) {
            await loadEvaluationDetails(systemName);
        }

        showToast(
            `${systemName}-Verarbeitung abgeschlossen. Verarbeitete Matches: ${data.processed_matches}`,
            "success"
        );
    } catch (error) {
        console.error(`Fehler bei der ${systemName}-Verarbeitung:`, error);
        showToast(`${systemName}-Ratings konnten nicht verarbeitet werden.`, "error");
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
            logLossId: "evaluation-elo-logloss"
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

    accuracy.textContent = formatNumber(data.accuracy);
    correct.textContent = formatNumber(data.correct_predictions);
    total.textContent = formatNumber(data.total_predictions);
    brier.textContent = formatNumber(data.brier_score);
    logLoss.textContent = formatNumber(data.log_loss);
}

async function loadEvaluationForSystem(systemName) {
    try {
        const response = await fetch(`/evaluation/${systemName}`);

        if (!response.ok) {
            const text = await response.text();
            console.error(`Fehlerhafte Antwort /evaluation/${systemName}:`, response.status, text);
            showToast(`Fehler beim Laden der Evaluation für ${systemName} (${response.status}).`, "error");
            return;
        }

        const data = await response.json();
        renderEvaluation(systemName, data);
    } catch (error) {
        console.error(`Fehler beim Laden der Evaluation für ${systemName}:`, error);
        showToast(`Evaluation für ${systemName} konnte nicht geladen werden.`, "error");
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
            <td>${formatNumber(detail.confidence_a)}</td>
            <td>${formatNumber(detail.confidence_b)}</td>
            <td>${formatNumber(detail.brier_score)}</td>
            <td>${formatNumber(detail.log_loss)}</td>
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
            showToast(`Fehler beim Laden der Evaluationsdetails für ${systemName} (${response.status}).`, "error");
            return;
        }

        const data = await response.json();
        renderEvaluationDetails(data);
    } catch (error) {
        console.error(`Fehler beim Laden der Evaluationsdetails für ${systemName}:`, error);
        showToast(`Evaluationsdetails für ${systemName} konnten nicht geladen werden.`, "error");
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

function initRatingsPage() {
    initRatingsSection();
    initEvaluationDetailsSection();
    loadAllRatings();
    loadAllEvaluations();
    loadEvaluationDetails();
}

document.addEventListener("DOMContentLoaded", initRatingsPage);