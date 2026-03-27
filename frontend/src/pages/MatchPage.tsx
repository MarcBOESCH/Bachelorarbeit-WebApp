import {type SyntheticEvent, useEffect, useState} from "react";
import { fetchPlayers, type Player } from "../api/playerApi";
import { createMatch, type RatingChange } from "../api/matchApi";

export default function MatchPage() {
    const [players, setPlayers] = useState<Player[]>([]);
    const [teamAPlayerIds, setTeamAPlayerIds] = useState<number[]>([]);
    const [teamBPlayerIds, setTeamBPlayerIds] = useState<number[]>([]);
    const [teamAScore, setTeamAScore] = useState("");
    const [teamBScore, setTeamBScore] = useState("");
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [ratingChanges, setRatingChanges] = useState<RatingChange[]>([]);

    useEffect(() => {
        async function loadPlayers() {
            try {
                const data = await fetchPlayers();
                setPlayers(data);
            } catch {
                setError("Spieler konnten nicht geladen werden.");
            } finally {
                setLoading(false);
            }
        }

        loadPlayers();
    }, []);

    function togglePlayer(
        playerId: number,
        team: "A" | "B"
    ) {
        setError(null);
        setSuccessMessage(null);

        if (team === "A") {
            if (teamAPlayerIds.includes(playerId)) {
                setTeamAPlayerIds(teamAPlayerIds.filter((id) => id !== playerId));
                return;
            }

            if (teamAPlayerIds.length >= 2 || teamBPlayerIds.includes(playerId)) {
                return;
            }

            setTeamAPlayerIds([...teamAPlayerIds, playerId]);
            return;
        }

        if (teamBPlayerIds.includes(playerId)) {
            setTeamBPlayerIds(teamBPlayerIds.filter((id) => id !== playerId));
            return;
        }

        if (teamBPlayerIds.length >= 2 || teamAPlayerIds.includes(playerId)) {
            return;
        }

        setTeamBPlayerIds([...teamBPlayerIds, playerId]);
    }

    async function handleSubmit(event: SyntheticEvent) {
        event.preventDefault();
        setError(null);
        setSuccessMessage(null);
        setRatingChanges([]);

        if (teamAPlayerIds.length !== 2 || teamBPlayerIds.length !== 2) {
            setError("Bitte genau 2 Spieler pro Team auswählen.");
            return;
        }

        if (teamAScore.trim() === "" || teamBScore.trim() === "") {
            setError("Bitte beide Scores eingeben.");
            return;
        }

        const parsedTeamAScore = Number(teamAScore);
        const parsedTeamBScore = Number(teamBScore);

        if (Number.isNaN(parsedTeamAScore) || Number.isNaN(parsedTeamBScore)) {
            setError("Scores müssen Zahlen sein.");
            return;
        }

        setSubmitting(true);

        try {
            const response = await createMatch({
                playedAt: new Date().toISOString(),
                teamAPlayerIds,
                teamBPlayerIds,
                teamAScore: parsedTeamAScore,
                teamBScore: parsedTeamBScore
            });

            setSuccessMessage(
                `Match gespeichert. Punktedifferenz: ${response.match.pointDifference}`
            );
            setRatingChanges(response.ratingChanges);

            setTeamAPlayerIds([]);
            setTeamBPlayerIds([]);
            setTeamAScore("");
            setTeamBScore("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
        } finally {
            setSubmitting(false);
        }
    }

    function getPlayerName(playerId: number): string {
        return players.find((player) => player.id === playerId)?.name || `#${playerId}`;
    }

    if (loading) {
        return <p>Lade Spieler...</p>;
    }

    return (
        <div>
            <h1>Neues Match erfassen</h1>

            {error && <p>{error}</p>}
            {successMessage && <p>{successMessage}</p>}

            <form onSubmit={handleSubmit}>
                <h2>Team A</h2>
                {players.map((player) => (
                    <label key={`A-${player.id}`} style={{ display: "block" }}>
                        <input
                            type="checkbox"
                            checked={teamAPlayerIds.includes(player.id)}
                            onChange={() => togglePlayer(player.id, "A")}
                        />
                        {player.name}
                    </label>
                ))}

                <h2>Team B</h2>
                {players.map((player) => (
                    <label key={`B-${player.id}`} style={{ display: "block" }}>
                        <input
                            type="checkbox"
                            checked={teamBPlayerIds.includes(player.id)}
                            onChange={() => togglePlayer(player.id, "B")}
                        />
                        {player.name}
                    </label>
                ))}

                <div style={{ marginTop: "16px" }}>
                    <label>
                        Score Team A:
                        <input
                            type="number"
                            value={teamAScore}
                            onChange={(e) => setTeamAScore(e.target.value)}
                        />
                    </label>
                </div>

                <div style={{ marginTop: "8px" }}>
                    <label>
                        Score Team B:
                        <input
                            type="number"
                            value={teamBScore}
                            onChange={(e) => setTeamBScore(e.target.value)}
                        />
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={submitting}
                    style={{ marginTop: "16px" }}
                >
                    {submitting ? "Speichert..." : "Match speichern"}
                </button>
            </form>

            {ratingChanges.length > 0 && (
                <div style={{ marginTop: "24px" }}>
                    <h2>Rating-Änderungen</h2>
                    <table>
                        <thead>
                        <tr>
                            <th>Spieler</th>
                            <th>Alt</th>
                            <th>Neu</th>
                            <th>Delta</th>
                        </tr>
                        </thead>
                        <tbody>
                        {ratingChanges.map((change) => (
                            <tr key={change.playerId}>
                                <td>{getPlayerName(change.playerId)}</td>
                                <td>{change.oldRating.toFixed(2)}</td>
                                <td>{change.newRating.toFixed(2)}</td>
                                <td>{change.delta.toFixed(2)}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}