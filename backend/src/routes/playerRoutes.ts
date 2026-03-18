import { Router } from "express";
import prisma from "../config/prisma";

const router = Router();

router.get("/", async (_req, res) => {
    try {
        const players = await prisma.player.findMany({
            orderBy: { createdAt: "asc" }
        });

        res.json(players);
    } catch (error) {
        console.error("Fehler beim Laden der Spieler:", error);
        res.status(500).json({ message: "Spieler konnten nicht geladen werden." });
    }
});

router.post("/", async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== "string" || name.trim() === "") {
            return res.status(400).json({ message: "Ungültiger Name." });
        }

        const player = await prisma.player.create({
            data: {
                name: name.trim()
            }
        });

        res.status(201).json(player);
    } catch (error) {
        console.error("Fehler beim Erstellen des Spielers:", error);
        res.status(500).json({ message: "Spieler konnte nicht erstellt werden." });
    }
});

export default router;