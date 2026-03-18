import prisma from "../config/prisma";
import { CreateMatchDto } from "../types/match";
import { calculateMatchResult } from "./matchLogicService";
import { calculateNewRatings } from "./ratingService";

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

    // Load players
    const players = await prisma.player.findMany({
        where: {
            id: {
                in: allPlayerIds
            }
        }
    });

    if (players.length !== 4) {
        throw new Error("Es wurden nicht alle Spieler gefunden.");
    }

    const teamAPlayers = players
        .filter((p) => teamAPlayerIds.includes(p.id))
        .map((p) => ({ id: p.id, rating: p.currentRating }));

    const teamBPlayers = players
        .filter((p) => teamAPlayerIds.includes(p.id))
        .map((p) => ({ id: p.id, rating: p.currentRating }));

    // Calculate match result
    const matchResult = calculateMatchResult(teamAScore, teamBScore);

    // Calculate rating
    const ratingChanges = calculateNewRatings(
        teamAPlayers,
        teamBPlayers,
        matchResult.winner,
        matchResult.pointDifference
    );

    // Persist match
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
        }
    });

    // Persist ratings and history
    await prisma.$transaction(
        ratingChanges.map((change) =>
            prisma.player.update({
                where: { id: change.playerId },
                data: {
                    currentRating: change.newRating
                }
            })
        )
    );

    await prisma.$transaction(
        ratingChanges.map((change) =>
            prisma.ratingHistory.create({
                data: {
                    playerId: change.playerId,
                    matchId: match.id,
                    oldRating: change.oldRating,
                    newRating: change.newRating,
                    delta: change.delta
                }
            })
        )
    );

    return {
        match,
        ratingChanges
    };
}