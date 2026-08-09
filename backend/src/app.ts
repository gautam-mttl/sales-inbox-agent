import express from "express";
import cors from "cors";
import { env } from "./config/env";
import healthRouter from "./routes/health";
import tasksRouter from "./routes/tasks";
import usersRouter from "./routes/users";
import ingestRouter from "./routes/ingest";
import apiRouter from "./routes/api";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.FRONTEND_URL,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/", healthRouter);
app.use("/tasks", tasksRouter);
app.use("/users", usersRouter);
app.use("/ingest", ingestRouter);
app.use("/api", apiRouter);

// ── 404 / error handlers (must be last) ──────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
