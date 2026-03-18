export type Team = "A" | "B";

export interface CreateMatchDto {
    playedAt: string;
    teamAPlayerIds: number[];
    teamBPlayerIds: number[];
    teamAScore: number;
    teamBScore: number;
}

export interface MatchResult {
    winner: Team;
    pointDifference: number;
}