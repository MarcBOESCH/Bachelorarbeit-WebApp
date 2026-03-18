import express from "express";
import cors from "cors";
import playerRoutes from "./routes/playerRoutes";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
    res.json({ message: "Backend läuft." });
});

app.use("/api/players", playerRoutes);

export default app;