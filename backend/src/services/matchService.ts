import prisma from "../config/prisma";
import { CreateMatchDto } from "../types/match";
import { calculateMatchResult } from "./matchLogicService";

export async function createMatch(data: CreateMatchDto) {
    const { playedAt, teamAPlayerIds, teamBPlayerIds, teamAScore, teamBScore } = data;

    if (teamAPlayerIds.length !== 2 || teamBPlayerIds.length !== 2) {
        throw new Error("Jedes Team muss genau 2 Spieler haben.");
    }

    const allPlayerIds = [...teamAPlayerIds, ...teamBPlayerIds];
    const uniquePlayerIds = new Set(allPlayerIds);

    if (uniquePlayerIds.size !== 4) {
        throw new Error("Ein Spieler darf in einem Match nur einmal vorkommen.");
    }

    const matchResult = calculateMatchResult(teamAScore, teamBScore);

    const match = await prisma.match.create({
        data: {
            playedAt: new Date(playedAt),
            teamAScore,
            teamBScore,
            pointDifference: matchResult.pointDifference,
            matchPlayers: {
                create: [
                    ...teamAPlayerIds.map(playerId => ({ playerId, team: "A" })),
                    ...teamBPlayerIds.map(playerId => ({ playerId, team: "B" }))
                ]
            }
        },
        include: {
            matchPlayers: true
        }
    });

    return {
        match,
        result: matchResult
    }
}