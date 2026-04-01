// Formatiert den Zeitstempel eines Matches für die Anzeige.
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

// Formatiert die Spielernamen eines Teams in der richtigen Reihenfolge.
function formatPlayerNames(players) {
    if (!players || players.length === 0) {
        return "-";
    }

    return [...players]
        .sort((a, b) => a.team_slot - b.team_slot)
        .map(player => player.name)
        .join(", ");
}

// Rendert die Matchhistorie in die Tabelle.
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

// Lädt die gespeicherte Matchhistorie aus der API.
async function loadMatches() {
    try {
        const response = await fetch("/api/matches");

        if (!response.ok) {
            const text = await response.text();
            console.error("Fehlerhafte Antwort /api/matches:", response.status, text);
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

// Initialisiert die History-Seite.
function initHistoryPage() {
    loadMatches();
}

document.addEventListener("DOMContentLoaded", initHistoryPage);