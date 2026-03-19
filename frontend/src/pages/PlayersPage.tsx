import { useEffect, useState } from "react";
import { fetchPlayers, type Player } from "../api/playerApi";

export default function PlayersPage() {
    const [players, setPlayers] = useState<Player[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadPlayers() {
            try {
                const data = await fetchPlayers();
                setPlayers(data);
            } catch (err) {
                setError("Fehler beim Laden der Spieler");
            } finally {
                setLoading(false);
            }
        }

        loadPlayers();
    }, []);

    if (loading) return <p>Lade Spieler...</p>;
    if (error) return <p>{error}</p>;

    return (
        <div>
            <h1>Spieler & Ratings</h1>

            <table>
                <thead>
                <tr>
                    <th>Name</th>
                    <th>Rating</th>
                </tr>
                </thead>
                <tbody>
                {players.map((player) => (
                    <tr key={player.id}>
                        <td>{player.name}</td>
                        <td>{player.currentRating.toFixed(0)}</td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}