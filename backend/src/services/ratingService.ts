export interface TeamRatings {
    teamA: number[];
    teamB: number[];
}

export interface RatingChange {
    playerId: number;
    oldRating: number;
    newRating: number;
    delta: number;
}

const K = 20;

function calculateExpectedScore(ratingA: number, ratingB: number): number {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

function calculateMarginFactor(pointDifference: number): number {
    return Math.log(pointDifference + 1);
}

export function calculateNewRatings(
    teamAPlayers: { id: number; rating: number }[],
    teamBPlayers: { id: number; rating: number }[],
    winner: "A" | "B",
    pointDifference: number
): RatingChange[] {
    const avgRatingA =
        teamAPlayers.reduce((sum, p) => sum + p.rating, 0) / teamAPlayers.length;

    const avgRatingB =
        teamBPlayers.reduce((sum, p) => sum + p.rating, 0) / teamBPlayers.length;

    const expectedA = calculateExpectedScore(avgRatingA, avgRatingB);
    const expectedB = calculateExpectedScore(avgRatingB, avgRatingA);

    const resultA = winner === "A" ? 1 : 0;
    const resultB = winner === "B" ? 1 : 0;

    const marginFactor = calculateMarginFactor(pointDifference);

    const deltaA = K * (resultA - expectedA) * marginFactor;
    const deltaB = K * (resultB - expectedB) * marginFactor;

    const changes: RatingChange[] = [];

    for (const player of teamAPlayers) {
        const newRating = player.rating + deltaA;
        changes.push({
            playerId: player.id,
            oldRating: player.rating,
            newRating,
            delta: newRating - player.rating
        });
    }

    for (const player of teamBPlayers) {
        const newRating = player.rating + deltaB;
        changes.push({
            playerId: player.id,
            oldRating: player.rating,
            newRating,
            delta: newRating - player.rating
        });
    }

    return changes;
}