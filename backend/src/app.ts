import express from "express";
import cors from "cors";
import playerRoutes from "./routes/playerRoutes";
import matchRoutes from "./routes/matchRoutes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({ message: "Backend läuft." });
});

app.use("/api/players", playerRoutes);
app.use("/api/matches", matchRoutes);

export default app;