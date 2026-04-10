let allStatsData = [];
let currentSortColumn = "elo";
let currentSortAsc = false;
let currentSearchTerm = "";

let allTeamStatsData = [];
let currentTeamSortColumn = "elo";
let currentTeamSortAsc = false;
let currentTeamSearchTerm = "";

function formatNumber(value) {
    const number = Number(value ?? 0);

    if (Number.isInteger(number)) {
        return String(number);
    }

    return number.toFixed(2);
}

function getTopPlayer(stats, compareFn) {
    if (!stats || stats.length === 0) {
        return null;
    }

    return [...stats].sort(compareFn)[0];
}

function renderStatsSummary(stats) {
    const totalPlayersElement = document.getElementById("stats-total-players");
    const mostMatchesNameElement = document.getElementById("stats-most-matches-name");
    const mostMatchesValueElement = document.getElementById("stats-most-matches-value");
    const bestWinRateNameElement = document.getElementById("stats-best-win-rate-name");
    const bestWinRateValueElement = document.getElementById("stats-best-win-rate-value");
    const bestDiffNameElement = document.getElementById("stats-best-diff-name");
    const bestDiffValueElement = document.getElementById("stats-best-diff-value");

    if (
        !totalPlayersElement ||
        !mostMatchesNameElement ||
        !mostMatchesValueElement ||
        !bestWinRateNameElement ||
        !bestWinRateValueElement ||
        !bestDiffNameElement ||
        !bestDiffValueElement
    ) {
        return;
    }

    const topMatchesPlayer = getTopPlayer(stats, (a, b) => (b.matches_played ?? 0) - (a.matches_played ?? 0));

    const topWinRatePlayer = getTopPlayer(stats, (a, b) => {
        const winRateDiff = (b.win_rate ?? 0) - (a.win_rate ?? 0);

        if (winRateDiff !== 0) {
            return winRateDiff;
        }

        return (b.matches_played ?? 0) - (a.matches_played ?? 0);
    });

    const topDiffPlayer = getTopPlayer(stats, (a, b) => (b.avg_point_diff ?? 0) - (a.avg_point_diff ?? 0));

    totalPlayersElement.textContent = stats.length;
    mostMatchesNameElement.textContent = topMatchesPlayer?.name ?? "-";
    mostMatchesValueElement.textContent = formatNumber(topMatchesPlayer?.matches_played ?? 0);
    bestWinRateNameElement.textContent = topWinRatePlayer?.name ?? "-";
    bestWinRateValueElement.textContent = `${formatNumber(topWinRatePlayer?.win_rate ?? 0)} %`;
    bestDiffNameElement.textContent = topDiffPlayer?.name ?? "-";
    bestDiffValueElement.textContent = formatNumber(topDiffPlayer?.avg_point_diff ?? 0);
}

function initTableControls() {
    const searchInput = document.getElementById("stats-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentSearchTerm = e.target.value.toLowerCase().trim();
            processAndRenderTable();
        });
    }

    const headers = document.querySelectorAll(".sortable-header");
    headers.forEach(header => {
        header.addEventListener("click", () => {
            const column = header.getAttribute("data-sort");

            if (currentSortColumn === column) {
                currentSortAsc = !currentSortAsc;
            } else {
                currentSortColumn = column;
                currentSortAsc = false;
            }

            processAndRenderTable();
        });
    });
}

function initTeamTableControls() {
    const searchInput = document.getElementById("team-stats-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentTeamSearchTerm = e.target.value.toLowerCase().trim();
            processAndRenderTeamTable();
        });
    }

    const headers = document.querySelectorAll(".team-sortable-header");
    headers.forEach(header => {
        header.addEventListener("click", () => {
            const column = header.getAttribute("data-sort");

            if (currentTeamSortColumn === column) {
                currentTeamSortAsc = !currentTeamSortAsc;
            } else {
                currentTeamSortColumn = column;
                currentTeamSortAsc = false;
            }

            processAndRenderTeamTable();
        });
    });
}

function updatePodium(sortedData) {
    const podiumCard = document.getElementById("podium-card");
    if (!podiumCard) return;

    if (currentSearchTerm !== "" || currentSortAsc || currentSortColumn === "name" || sortedData.length < 3) {
        podiumCard.style.display = "none";
        return;
    }

    podiumCard.style.display = "block";

    const columnTitles = {
        matches_played: "Matches",
        wins: "Siegen",
        losses: "Niederlagen",
        win_rate: "Siegquote",
        avg_point_diff: "Ø Punktedifferenz",
        elo: "Elo-Rating"
    };

    document.getElementById("podium-subtitle").textContent = `nach ${columnTitles[currentSortColumn]}`;

    const fillPodiumStep = (rank, player) => {
        const stepElement = document.getElementById(`podium-${rank}`);
        if (!player) {
            stepElement.style.visibility = "hidden";
            return;
        }

        stepElement.style.visibility = "visible";
        document.getElementById(`podium-${rank}-name`).textContent = player.name;

        let val = player[currentSortColumn];
        let displayVal = formatNumber(val);

        if (currentSortColumn === "win_rate") displayVal += " %";
        if (currentSortColumn === "avg_point_diff" && val > 0) displayVal = "+" + displayVal;

        document.getElementById(`podium-${rank}-stat`).textContent = displayVal;
    };

    fillPodiumStep(1, sortedData[0]);
    fillPodiumStep(2, sortedData[1]);
    fillPodiumStep(3, sortedData[2]);
}

function processAndRenderTable() {
    const tbody = document.getElementById("player-stats-body");
    if (!tbody) return;

    let processedData = allStatsData.filter(player =>
        player.name.toLowerCase().includes(currentSearchTerm)
    );

    processedData.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];

        if (valA === null || valA === undefined) valA = typeof a[currentSortColumn] === "string" ? "" : 0;
        if (valB === null || valB === undefined) valB = typeof b[currentSortColumn] === "string" ? "" : 0;

        if (valA !== valB) {
            if (typeof valA === "string") {
                return currentSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }

            return currentSortAsc ? (valA - valB) : (valB - valA);
        }

        if (currentSortColumn !== "avg_point_diff") {
            const diffA = a.avg_point_diff ?? 0;
            const diffB = b.avg_point_diff ?? 0;
            if (diffA !== diffB) {
                return diffB - diffA;
            }
        }

        if (currentSortColumn !== "matches_played") {
            const matchesA = a.matches_played ?? 0;
            const matchesB = b.matches_played ?? 0;
            if (matchesA !== matchesB) {
                return matchesB - matchesA;
            }
        }

        return 0;
    });

    updatePodium(processedData);
    tbody.innerHTML = "";

    if (processedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Keine Spieler gefunden.</td></tr>`;
        return;
    }

    processedData.forEach((player) => {
        const row = document.createElement("tr");
        const diffValue = player.avg_point_diff > 0
            ? `+${formatNumber(player.avg_point_diff)}`
            : formatNumber(player.avg_point_diff);

        row.innerHTML = `
            <td class="fw-semibold">${player.name}</td>
            <td class="text-end">${formatNumber(player.matches_played)}</td>
            <td class="text-end">${formatNumber(player.wins)}</td>
            <td class="text-end">${formatNumber(player.losses)}</td>
            <td class="text-end fw-bold" style="color: var(--color-brand);">${formatNumber(player.win_rate)} %</td>
            <td class="text-end"><span class="badge bg-light text-dark border">${diffValue}</span></td>
            <td class="text-end fw-bold fs-6">${player.elo}</td>
        `;

        tbody.appendChild(row);
    });
}

function processAndRenderTeamTable() {
    const tbody = document.getElementById("team-stats-body");
    if (!tbody) return;

    let processedData = allTeamStatsData.filter(team =>
        team.name.toLowerCase().includes(currentTeamSearchTerm) ||
        team.player_names.toLowerCase().includes(currentTeamSearchTerm)
    );

    processedData.sort((a, b) => {
        let valA = a[currentTeamSortColumn];
        let valB = b[currentTeamSortColumn];

        if (valA === null || valA === undefined) valA = typeof a[currentTeamSortColumn] === "string" ? "" : 0;
        if (valB === null || valB === undefined) valB = typeof b[currentTeamSortColumn] === "string" ? "" : 0;

        if (valA !== valB) {
            if (typeof valA === "string") {
                return currentTeamSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }

            return currentTeamSortAsc ? (valA - valB) : (valB - valA);
        }

        if (currentTeamSortColumn !== "avg_point_diff") {
            const diffA = a.avg_point_diff ?? 0;
            const diffB = b.avg_point_diff ?? 0;
            if (diffA !== diffB) {
                return diffB - diffA;
            }
        }

        if (currentTeamSortColumn !== "matches_played") {
            const matchesA = a.matches_played ?? 0;
            const matchesB = b.matches_played ?? 0;
            if (matchesA !== matchesB) {
                return matchesB - matchesA;
            }
        }

        return 0;
    });

    tbody.innerHTML = "";

    if (processedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Keine Teams gefunden.</td></tr>`;
        return;
    }

    processedData.forEach((team) => {
        const row = document.createElement("tr");
        const diffValue = team.avg_point_diff > 0
            ? `+${formatNumber(team.avg_point_diff)}`
            : formatNumber(team.avg_point_diff);

        row.innerHTML = `
            <td class="fw-semibold">${team.name}</td>
            <td class="text-muted">${team.player_names}</td>
            <td class="text-end">${formatNumber(team.matches_played)}</td>
            <td class="text-end">${formatNumber(team.wins)}</td>
            <td class="text-end">${formatNumber(team.losses)}</td>
            <td class="text-end fw-bold" style="color: var(--color-brand);">${formatNumber(team.win_rate)} %</td>
            <td class="text-end"><span class="badge bg-light text-dark border">${diffValue}</span></td>
            <td class="text-end fw-bold fs-6">${team.elo}</td>
        `;

        tbody.appendChild(row);
    });
}

function renderPlayerStats(stats) {
    const emptyState = document.getElementById("player-stats-empty");
    const content = document.getElementById("player-stats-content");

    if (!emptyState || !content) return;

    if (!stats || stats.length === 0) {
        emptyState.classList.remove("d-none");
        content.classList.add("d-none");
        return;
    }

    emptyState.classList.add("d-none");
    content.classList.remove("d-none");

    renderStatsSummary(stats);
    allStatsData = stats;
    processAndRenderTable();
}

function renderTeamStats(stats) {
    const emptyState = document.getElementById("team-stats-empty");
    const wrapper = document.getElementById("team-stats-wrapper");

    if (!emptyState || !wrapper) return;

    allTeamStatsData = stats ?? [];

    if (!stats || stats.length === 0) {
        emptyState.classList.remove("d-none");
        wrapper.classList.add("d-none");
        return;
    }

    emptyState.classList.add("d-none");
    wrapper.classList.remove("d-none");

    processAndRenderTeamTable();
}

async function loadPlayerStats() {
    try {
        const response = await fetch("/api/player-stats");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /api/player-stats:", response.status, text);
            showToast(`Fehler beim Laden der Spielerstatistiken (${response.status}).`, "error");
            return;
        }

        const stats = await response.json();
        renderPlayerStats(stats);
    } catch (error) {
        console.error("Fehler beim Laden der Spielerstatistiken:", error);
        showToast("Spielerstatistiken konnten nicht geladen werden.", "error");
    }
}

async function loadTeamStats() {
    try {
        const response = await fetch("/api/team-stats");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /api/team-stats:", response.status, text);
            showToast(`Fehler beim Laden der Teamstatistiken (${response.status}).`, "error");
            return;
        }

        const stats = await response.json();
        renderTeamStats(stats);
    } catch (error) {
        console.error("Fehler beim Laden der Teamstatistiken:", error);
        showToast("Teamstatistiken konnten nicht geladen werden.", "error");
    }
}

function initStatisticsPage() {
    loadPlayerStats();
    loadTeamStats();
    initTableControls();
    initTeamTableControls();
}

document.addEventListener("DOMContentLoaded", initStatisticsPage);