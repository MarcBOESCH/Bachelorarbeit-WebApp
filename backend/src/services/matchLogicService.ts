import { MatchResult} from "../types/match";

export function calculateMatchResult (teamAScore: number, teamBScore: number): MatchResult {
    if (teamAScore === teamBScore) {
        throw new Error("Eine Partie darf nicht unentschieden enden.")
    }

    const winner = teamAScore > teamBScore ? "A" : "B";
    const pointDifference = Math.abs(teamAScore - teamBScore);

    return { winner, pointDifference };
}