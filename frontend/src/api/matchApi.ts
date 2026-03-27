export interface CreateMatchDto {
    playedAt: string;
    teamAPlayerIds: number[];
    teamBPlayerIds: number[];
    teamAScore: number;
    teamBScore: number;
}

export interface RatingChange {
    playerId: number;
    oldRating: number;
    newRating: number;
    delta: number;
}

export interface CreateMatchResponse {
    match: {
        id: number;
        playedAt: string;
        teamAScore: number;
        teamBScore: number;
        pointDifference: number;
        createdAt: string;
    };
    ratingChanges: RatingChange[];
}

export async function createMatch(data: CreateMatchDto): Promise<CreateMatchResponse> {
    const response = await fetch("http://localhost:3001/api/matches", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
    });

    const responseData = await response.json();

    if (!response.ok) {
        throw new Error(responseData.message || "Fehler beim Erstellen des Matches");
    }

    return responseData;
}