import { Router, Request, Response } from "express";
import { env } from "../config/env";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    candidate_id: env.CANDIDATE_ID,
    timestamp: new Date().toISOString(),
  });
});

export default router;
