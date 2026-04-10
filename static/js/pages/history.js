 let allLoadedMatches;

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

        // Wer hat gewonnen?
        const aWon = match.winner_team === "A";
        const bWon = match.winner_team === "B";

        // Basis-Styling für Gewinner (Grüne Schrift, grüne Umrandung, abgerundet) und Verlierer (Grau)
        const winnerStyle = 'fw-bold d-inline-block px-2 py-1 rounded-pill border text-nowrap';
        const winnerColor = 'color: var(--color-brand); border-color: var(--color-brand) !important;';
        const loserStyle = 'text-muted';

        // Team-HTML zusammenbauen: Pokal-Icon wird nur beim Gewinner angehängt
        const teamAHtml = aWon
            ? `<span class="${winnerStyle}" style="${winnerColor}">${teamAPlayers} <i class="bi bi-trophy-fill ms-1"></i></span>`
            : `<span class="${loserStyle}">${teamAPlayers}</span>`;

        const teamBHtml = bWon
            ? `<span class="${winnerStyle}" style="${winnerColor}">${teamBPlayers} <i class="bi bi-trophy-fill ms-1"></i></span>`
            : `<span class="${loserStyle}">${teamBPlayers}</span>`;

        // Styling für den Score
        const scoreAStyle = aWon ? 'fw-bold' : 'text-muted';
        const scoreBStyle = bWon ? 'fw-bold' : 'text-muted';
        const scoreHtml = `<span class="${scoreAStyle}">${match.score_team_a}</span> : <span class="${scoreBStyle}">${match.score_team_b}</span>`;

        // Datum und Uhrzeit trennen
        const dateObj = new Date(match.played_at);
        const dateStr = dateObj.toLocaleDateString("de-AT", { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString("de-AT", { hour: '2-digit', minute: '2-digit' });

        row.innerHTML = `
            <td>${teamAHtml}</td>
            <td>${teamBHtml}</td>
            <td style="font-size: 1.05rem;">${scoreHtml}</td>
            <td>
                <span class="badge bg-light text-dark border">+${match.point_diff}</span>
            </td>
            <td>
                <div class="fw-semibold">${dateStr}</div>
                <div class="text-muted small">${timeStr} Uhr</div>
            </td>
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
            showToast(`Fehler beim Laden der Matchhistorie (${response.status}).`, "error");
            return;
        }

        const matches = await response.json();

        allLoadedMatches = matches;

        renderMatchHistory(matches);
    } catch (error) {
        console.error("Fehler beim Laden der Matchhistorie:", error);
        showToast("Matchhistorie konnte nicht geladen werden.", "error");
    }
}

// Initialisiert das Suchfeld für die Echtzeit-Filterung
function initMatchSearch() {
    const searchInput = document.getElementById("match-search-input");
    if (!searchInput) return;

    searchInput.addEventListener("input", (event) => {
        const searchTerm = event.target.value.toLowerCase().trim();

        // Wenn das Feld leer ist, alle Matches anzeigen
        if (searchTerm === "") {
            renderMatchHistory(allLoadedMatches);
            return;
        }

        // Array filtern: Schauen, ob der Suchbegriff in Team A oder Team B vorkommt
        const filteredMatches = allLoadedMatches.filter(match => {
            // Alle Namen beider Teams in einen langen, kleingeschriebenen Text umwandeln
            const teamAString = match.team_a_players.map(p => p.name.toLowerCase()).join(" ");
            const teamBString = match.team_b_players.map(p => p.name.toLowerCase()).join(" ");

            return teamAString.includes(searchTerm) || teamBString.includes(searchTerm);
        });

        // Die Tabelle mit den gefilterten Ergebnissen neu zeichnen
        renderMatchHistory(filteredMatches);
    });
}

// Initialisiert die History-Seite.
function initHistoryPage() {
    initMatchSearch();
    loadMatches();
}

document.addEventListener("DOMContentLoaded", initHistoryPage);