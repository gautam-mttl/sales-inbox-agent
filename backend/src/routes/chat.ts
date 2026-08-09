import { Router } from "express";
import { ChatRequestSchema } from "../validation/chatSchemas";
import { processChat } from "../services/chatService";

const router = Router();

router.post("/", async (req, res) => {
  const result = ChatRequestSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: "Validation failed",
      details: result.error.errors,
    });
  }

  try {
    const response = await processChat(result.data);
    return res.json(response);
  } catch (err: any) {
    console.error("[chat] Unhandled error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
