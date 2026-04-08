let allStatsData = [];
let currentSortColumn = 'elo'; // Standard-Sortierung
let currentSortAsc = false;         // Standardmäßig absteigend
let currentSearchTerm = '';

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

// Initialisiert die Suchen- und Sortieren-Events
function initTableControls() {
    // 1. Suchfeld Event
    const searchInput = document.getElementById("stats-search-input");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentSearchTerm = e.target.value.toLowerCase().trim();
            processAndRenderTable();
        });
    }

    // 2. Tabellenköpfe Events
    const headers = document.querySelectorAll(".sortable-header");
    headers.forEach(header => {
        header.addEventListener("click", () => {
            const column = header.getAttribute("data-sort");

            // Wenn gleiche Spalte geklickt wird -> Richtung umkehren
            if (currentSortColumn === column) {
                currentSortAsc = !currentSortAsc;
            } else {
                currentSortColumn = column;
                currentSortAsc = false; // Bei neuer Spalte immer höchste Werte zuerst
            }
            processAndRenderTable();
        });
    });
}

// Aktualisiert das Siegerpodest basierend auf den aktuellen Daten und der Sortierung
function updatePodium(sortedData) {
    const podiumCard = document.getElementById("podium-card");
    if (!podiumCard) return;

    // Podest nur anzeigen, wenn nicht gesucht wird und absteigend sortiert ist (Beste zuerst)
    // Und nicht nach Name sortiert ist (Alphabet macht auf dem Podest keinen Sinn)
    if (currentSearchTerm !== '' || currentSortAsc || currentSortColumn === 'name' || sortedData.length < 3) {
        podiumCard.style.display = 'none';
        return;
    }

    podiumCard.style.display = 'block';

    // Titel anpassen
    const columnTitles = {
        'matches_played': 'Matches',
        'wins': 'Siegen',
        'losses': 'Niederlagen',
        'win_rate': 'Siegquote',
        'avg_point_diff': 'Ø Punktedifferenz',
        'elo': 'Elo-Rating'
    };
    document.getElementById("podium-subtitle").textContent = `nach ${columnTitles[currentSortColumn]}`;

    // Helper zum Befüllen einer Podest-Stufe
    const fillPodiumStep = (rank, player) => {
        const stepElement = document.getElementById(`podium-${rank}`);
        if (!player) {
            stepElement.style.visibility = 'hidden';
            return;
        }

        stepElement.style.visibility = 'visible';

        // Den ersten Buchstaben des Namens als Avatar
        document.getElementById(`podium-${rank}-name`).textContent = player.name;

        // Wert formatieren (mit % bei win_rate, mit + bei Diff)
        let val = player[currentSortColumn];
        let displayVal = formatNumber(val);
        if (currentSortColumn === 'win_rate') displayVal += " %";
        if (currentSortColumn === 'avg_point_diff' && val > 0) displayVal = "+" + displayVal;

        document.getElementById(`podium-${rank}-stat`).textContent = displayVal;
    };

    // Platz 1, 2 und 3 befüllen
    fillPodiumStep(1, sortedData[0]);
    fillPodiumStep(2, sortedData[1]);
    fillPodiumStep(3, sortedData[2]);
}

// Filtert, sortiert und rendert die Tabelle
function processAndRenderTable() {
    const tbody = document.getElementById("player-stats-body");
    if (!tbody) return;

    // 1. Filtern (Suche)
    let processedData = allStatsData.filter(player =>
        player.name.toLowerCase().includes(currentSearchTerm)
    );

    // 2. Sortieren
    processedData.sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];

        // Fallback für undefinierte Werte
        if (valA === null || valA === undefined) valA = typeof a[currentSortColumn] === 'string' ? '' : 0;
        if (valB === null || valB === undefined) valB = typeof b[currentSortColumn] === 'string' ? '' : 0;

        // Wenn die Werte unterschiedlich sind, ganz normal sortieren
        if (valA !== valB) {
            // Namen (Strings) alphabetisch sortieren
            if (typeof valA === 'string') {
                return currentSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            // Zahlen sortieren
            return currentSortAsc ? (valA - valB) : (valB - valA);
        }

        // --- NEU: Sekundäre Sortierung bei exaktem Gleichstand (Tie-Breaker) ---

        // 1. Tie-Breaker: Höhere durchschnittliche Punktedifferenz
        if (currentSortColumn !== 'avg_point_diff') {
            const diffA = a.avg_point_diff ?? 0;
            const diffB = b.avg_point_diff ?? 0;
            if (diffA !== diffB) {
                // Bei der Punktedifferenz als Tie-Breaker wollen wir immer den höheren Wert zuerst (absteigend)
                return diffB - diffA;
            }
        }

        // 2. Tie-Breaker (falls Punktedifferenz auch exakt gleich ist): Mehr gespielte Matches
        if (currentSortColumn !== 'matches_played') {
            const matchesA = a.matches_played ?? 0;
            const matchesB = b.matches_played ?? 0;
            if (matchesA !== matchesB) {
                return matchesB - matchesA;
            }
        }

        return 0; // Absoluter Gleichstand
    });

    updatePodium(processedData)

    // 3. Rendern
    tbody.innerHTML = "";

    if (processedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">Keine Spieler gefunden.</td></tr>`;
        return;
    }

    processedData.forEach((player) => {
        const row = document.createElement("tr");

        const diffValue = player.avg_point_diff > 0 ? `+${formatNumber(player.avg_point_diff)}` : formatNumber(player.avg_point_diff);

        // HIER WURDE DER ALTE MEDAILLEN-BLOCK ENTFERNT
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
    allStatsData = stats;
    processAndRenderTable();
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
    initTableControls();
}

document.addEventListener("DOMContentLoaded", initStatisticsPage);