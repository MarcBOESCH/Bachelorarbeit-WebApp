export interface Player {
    id: number;
    name: string;
    currentRating: number;
}

export async function fetchPlayers(): Promise<Player[]> {
    const response = await fetch("http://localhost:3001/api/players");

    if (!response.ok) {
        throw new Error("Fehler beim Laden der Spieler");
    }

    return response.json();
}