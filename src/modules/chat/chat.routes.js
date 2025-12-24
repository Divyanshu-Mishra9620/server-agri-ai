import { Router } from "express";
import {
  chatSuggest,
  geocodeAddress,
  getWeather,
  getMarketTrends,
  analyzeSoil,
} from "./chat.controller.js";
import { streamSuggestion, getSuggestion } from "./stream.controller.js";

import { uploadSingle } from "../../shared/utils/upload.js";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";

const router = Router();

router.post("/suggestions/suggest-stream", authMiddleware, streamSuggestion);
router.post("/suggestions/suggest-direct", authMiddleware, getSuggestion);

router.post("/suggest", authMiddleware, chatSuggest);

router.post("/geo/geocode", authMiddleware, geocodeAddress);
router.get("/weather/current", authMiddleware, getWeather);
router.get("/market/trends", authMiddleware, getMarketTrends);
router.post("/soil/analyze", authMiddleware, uploadSingle, analyzeSoil);

export default router;
