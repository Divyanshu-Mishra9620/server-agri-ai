import { Router } from "express";
import { 
  startVoiceSession, 
  processVoiceQuery, 
  endVoiceSession,
  getVoiceChatHistory 
} from "./voiceChat.controller.js";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";

const router = Router();

router.post("/start-session", authMiddleware, startVoiceSession);
router.post("/process-audio", authMiddleware, processVoiceQuery);
router.post("/end-session", authMiddleware, endVoiceSession);
router.get("/history", authMiddleware, getVoiceChatHistory);

export default router;