// Formatiert Zahlen für die Anzeige.
// Ganze Zahlen werden ohne Nachkommastellen dargestellt,
// Fließkommazahlen mit maximal zwei Nachkommastellen.
function formatNumber(value) {
    const number = Number(value ?? 0);

    if (Number.isInteger(number)) {
        return String(number);
    }

    return number.toFixed(2);
}

// Liefert den Spieler mit dem höchsten Wert laut Vergleichsfunktion.
// Gibt null zurück, wenn keine Daten vorhanden sind.
function getTopPlayer(stats, compareFn) {
    if (!stats || stats.length === 0) {
        return null;
    }

    return [...stats].sort(compareFn)[0];
}

// Rendert die Kennzahlen oberhalb der Tabelle.
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

    const topMatchesPlayer = getTopPlayer(stats, (a, b) => {
        return (b.matches_played ?? 0) - (a.matches_played ?? 0);
    });

    const topWinRatePlayer = getTopPlayer(stats, (a, b) => {
        const winRateDiff = (b.win_rate ?? 0) - (a.win_rate ?? 0);

        if (winRateDiff !== 0) {
            return winRateDiff;
        }

        return (b.matches_played ?? 0) - (a.matches_played ?? 0);
    });

    const topDiffPlayer = getTopPlayer(stats, (a, b) => {
        return (b.avg_point_diff ?? 0) - (a.avg_point_diff ?? 0);
    });

    totalPlayersElement.textContent = stats.length;

    mostMatchesNameElement.textContent = topMatchesPlayer?.name ?? "-";
    mostMatchesValueElement.textContent = formatNumber(topMatchesPlayer?.matches_played ?? 0);

    bestWinRateNameElement.textContent = topWinRatePlayer?.name ?? "-";
    bestWinRateValueElement.textContent = `${formatNumber(topWinRatePlayer?.win_rate ?? 0)} %`;

    bestDiffNameElement.textContent = topDiffPlayer?.name ?? "-";
    bestDiffValueElement.textContent = formatNumber(topDiffPlayer?.avg_point_diff ?? 0);
}

// Rendert die Spielerstatistiken in die Tabelle.
function renderPlayerStatsTable(stats) {
    const tbody = document.getElementById("player-stats-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    const sortedStats = [...stats].sort((a, b) => {
        const winRateDiff = (b.win_rate ?? 0) - (a.win_rate ?? 0);

        if (winRateDiff !== 0) {
            return winRateDiff;
        }

        const matchesDiff = (b.matches_played ?? 0) - (a.matches_played ?? 0);

        if (matchesDiff !== 0) {
            return matchesDiff;
        }

        return (b.avg_point_diff ?? 0) - (a.avg_point_diff ?? 0);
    });

    sortedStats.forEach(player => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${player.name}</td>
            <td>${formatNumber(player.matches_played)}</td>
            <td>${formatNumber(player.wins)}</td>
            <td>${formatNumber(player.losses)}</td>
            <td>${formatNumber(player.win_rate)} %</td>
            <td>${formatNumber(player.avg_point_diff)}</td>
        `;

        tbody.appendChild(row);
    });
}

// Steuert Empty State und sichtbaren Inhalt.
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
    renderPlayerStatsTable(stats);
}

// Lädt die Spielerstatistiken aus der API.
async function loadPlayerStats() {
    try {
        const response = await fetch("/api/player-stats");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /api/player-stats:", response.status, text);
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

// Initialisiert die Statistik-Seite.
function initStatisticsPage() {
    loadPlayerStats();
}

document.addEventListener("DOMContentLoaded", initStatisticsPage);