import { Router } from "express";
import prisma from "../config/prisma";
import { createMatch } from "../services/matchService";

const router = Router();

router.get("/", async (_req, res) => {
    try {
        const matches = await prisma.match.findMany({
            include: {
                matchPlayers: {
                    include: {
                        player: true
                    }
                }
            },
            orderBy: {
                playedAt: "desc"
            }
        });

        res.json(matches);
    } catch (error) {
        console.error("Fehler beim Laden der Matches:", error);
        res.status(500).json({ message: "Matches konnten nicht geladen werden." });
    }
});

router.post("/", async (req, res) => {
    try {
        const createdMatch = await createMatch(req.body);
        res.status(201).json(createdMatch);
    } catch (error) {
        console.error("Fehler beim Erstellen des Matches:", error);

        const message =
            error instanceof Error ? error.message : "Match konnte nicht erstellt werden.";

        res.status(400).json({ message });
    }
});

export default router;