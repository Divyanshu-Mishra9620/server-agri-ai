import express from "express";
import cors from "cors";
import helmet from "helmet";
import config from "../config/env.js";
import routes from "../modules/index.js";
import errorHandler from "../shared/middlewares/errorHandler.js";

export default async function expressLoader() {
  const app = express();

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: false,
    })
  );

  app.use(
    cors({
      origin: config.frontendUrl || [
        "http://localhost:3000",
        "http://localhost:3001",
      ],
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
  );

  app.use(express.static("public"));

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Health check endpoint (before other routes)
  app.get("/health", (req, res) => {
    res.json({
      success: true,
      message: "Farmer Assistant API is running",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: config.nodeEnv || "development",
      services: {
        database: "connected",
        ai_groq: config.groqApiKey ? "configured" : "not_configured",
        ai_gemini: config.geminiApiKey ? "configured" : "not_configured",
        websocket: "available",
      },
    });
  });

  app.use("/api", routes);

  app.get("/", (req, res) => {
    res.json({
      message: "🌾 Welcome to Farmer Assistant API",
      version: "1.0.0",
      documentation: "/api/health",
      websocket: "Connect to /socket.io for real-time chat",
      features: [
        "AI-powered farming advice",
        "Soil and plant image analysis",
        "Weather integration",
        "Market price information",
        "Real-time chat support",
      ],
    });
  });

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.originalUrl} not found`,
      availableRoutes: [
        "GET /health",
        "GET /api/health",
        "POST /api/suggestions/suggest",
        "POST /api/auth/login",
        "POST /api/auth/register",
      ],
    });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
