/* 6er-Kreuzjass: original player/team selection look, session-only 3v3. */
const sixSelection = { mode: "players", players: [], teams: [], controls: {} };

function sixSelectionInfo(side) {
    const c = sixSelection.controls;
    if (sixSelection.mode === "players") {
        return {
            name: document.getElementById(`team-${side}-custom-name`).value.trim() || `Team ${side.toUpperCase()}`,
            names: [1, 2, 3].map(i => {
                const instance = c[`team-${side}-player-${i}`];
                return instance?.options[instance.getValue()]?.name || "";
            })
        };
    }
    const teamId = c[`team-${side}-select`]?.getValue() || "";
    const selected = sixSelection.teams.find(team => String(team.id) === String(teamId));
    const third = c[`team-${side}-third`];
    const thirdName = third?.options[third.getValue()]?.name || "";
    if (!selected) return { name: `Team ${side.toUpperCase()}`, names: ["", "", thirdName] };
    const playerIds = [selected.player1_id, selected.player2_id];
    const firstTwo = playerIds.map(id =>
        sixSelection.players.find(p => String(p.id) === String(id))?.name || ""
    );
    return { name: selected.name, names: [...firstTwo, thirdName] };
}

function refreshSixSelection() {
    const a = sixSelectionInfo("a");
    const b = sixSelectionInfo("b");
    const all = [...a.names, ...b.names];
    const valid = all.length === 6 && all.every(name => name.trim()) &&
        new Set(all.map(name => name.trim().toLocaleLowerCase())).size === 6;
    const any = all.some(name => name.trim());

    for (const [side, team] of [["a", a], ["b", b]]) {
        document.getElementById(`chosen-team-${side}-name`).value = team.name;
        team.names.forEach((name, index) => {
            document.getElementById(`chosen-player-${side}-${index + 1}`).value = name;
        });
        document.getElementById(`preview-team-${side}-name`).textContent = team.name;
        document.getElementById(`preview-team-${side}-players`).textContent =
            team.names.filter(Boolean).join(" & ") || "–";
        const info = document.getElementById(`team-${side}-players-info`);
        if (info) {
            const existing = sixSelection.teams.find(t =>
                String(t.id) === String(sixSelection.controls[`team-${side}-select`]?.getValue())
            );
            info.classList.toggle("d-none", !existing);
            if (existing) info.querySelector(".player-names").textContent = existing.player_names;
        }
    }

    const preview = document.getElementById("match-preview-card");
    preview.classList.toggle("d-none", !any);
    document.getElementById("start-match-btn").disabled = !valid;
    const message = document.getElementById("six-player-error");
    if (message) {
        message.classList.toggle("d-none", valid || !any);
        message.textContent = valid ? "" : "Bitte sechs unterschiedliche Spieler auswählen.";
    }
}

function initSixSelect(elementId, options, {teams = false} = {}) {
    const config = {
        valueField: "id",
        labelField: "name",
        searchField: teams ? ["name", "player_names"] : ["name"],
        options,
        placeholder: teams ? "Team suchen..." : "Spieler suchen oder eingeben...",
        onChange: refreshSixSelection
    };
    if (teams) {
        config.render = {
            option(data, escape) {
                return `<div><span class="fw-bold">${escape(data.name)}</span><br>
                    <span class="small text-muted">${escape(data.player_names || "")}</span></div>`;
            }
        };
    } else {
        // Guest names are session-only; adding one never writes a Player row.
        config.create = input => {
            const name = String(input).trim().slice(0, 40);
            if (!name) return false;
            return { id: `guest:${name.toLocaleLowerCase()}`, name };
        };
        config.createOnBlur = false;
        config.render = {
            option_create(data, escape) {
                return `<div class="create"><i class="bi bi-person-plus"></i>
                    ${escape(data.input)} (nur für dieses Spiel)</div>`;
            }
        };
    }
    return new TomSelect(`#${elementId}`, config);
}

function switchSixSelectionMode(mode) {
    sixSelection.mode = mode;
    document.getElementById("player-selection-view").classList.toggle("d-none", mode !== "players");
    document.getElementById("team-selection-view").classList.toggle("d-none", mode !== "teams");
    document.getElementById("btn-selection-mode-players").classList.toggle("active", mode === "players");
    document.getElementById("btn-selection-mode-teams").classList.toggle("active", mode === "teams");
    refreshSixSelection();
}

async function initSixPlayerSelection() {
    try {
        const [playerResponse, teamResponse] = await Promise.all([
            fetch("/api/players"),
            fetch("/api/teams")
        ]);
        if (!playerResponse.ok || !teamResponse.ok) throw new Error("API konnte nicht geladen werden");
        sixSelection.players = await playerResponse.json();
        sixSelection.teams = await teamResponse.json();
        const options = sixSelection.players.map(p => ({ id: `player:${p.id}`, name: p.name }));
        for (const side of ["a", "b"]) {
            for (let i = 1; i <= 3; i++) {
                const id = `team-${side}-player-${i}`;
                sixSelection.controls[id] = initSixSelect(id, options);
            }
            const teamId = `team-${side}-select`;
            sixSelection.controls[teamId] = initSixSelect(teamId, sixSelection.teams, {teams: true});
            const thirdId = `team-${side}-third`;
            sixSelection.controls[thirdId] = initSixSelect(thirdId, options);
            document.getElementById(`team-${side}-custom-name`).addEventListener("input", refreshSixSelection);
        }
        document.getElementById("btn-selection-mode-players").addEventListener(
            "click", () => switchSixSelectionMode("players")
        );
        document.getElementById("btn-selection-mode-teams").addEventListener(
            "click", () => switchSixSelectionMode("teams")
        );
        document.getElementById("six-player-selection-form").addEventListener("submit", event => {
            const values = [...sixSelectionInfo("a").names, ...sixSelectionInfo("b").names];
            if (values.length !== 6 || values.some(name => !name.trim()) ||
                new Set(values.map(name => name.toLocaleLowerCase())).size !== 6) {
                event.preventDefault();
                showToast("Bitte sechs unterschiedliche Spieler auswählen.", "error");
            }
        });
        refreshSixSelection();
    } catch (error) {
        console.error(error);
        showToast("Spieler und Teams konnten nicht geladen werden.", "error");
    }
}

document.addEventListener("DOMContentLoaded", initSixPlayerSelection);
