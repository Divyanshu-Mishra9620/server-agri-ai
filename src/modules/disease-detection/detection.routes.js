
import { Router } from "express";
import { 
  uploadAndAnalyze, 
  getAnalysisById, 
  listUserAnalyses,
  getStats,
  retryAnalysis,
  deleteAnalysis
} from "./detection.controller.js";
import { uploadSingle } from "../../shared/utils/upload.js";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";

const router = Router();

// Validation schemas
const analysisValidation = {
  body: {
    crop: {
      optional: true,
      isString: true,
      isLength: { options: { min: 1, max: 100 } },
      trim: true
    },
    district: {
      optional: true,
      isString: true,
      isLength: { options: { min: 1, max: 100 } },
      trim: true
    },
    state: {
      optional: true,
      isString: true,
      isLength: { options: { min: 1, max: 100 } },
      trim: true
    },
    provider: {
      optional: true,
      isIn: { 
        options: [['groq', 'gemini', 'huggingface']],
        errorMessage: 'Provider must be one of: groq, gemini, huggingface'
      }
    },
    latitude: {
      optional: true,
      isFloat: { options: { min: -90, max: 90 } }
    },
    longitude: {
      optional: true,
      isFloat: { options: { min: -180, max: 180 } }
    }
  }
};

const listValidation = {
  query: {
    limit: {
      optional: true,
      isInt: { options: { min: 1, max: 100 } },
      toInt: true
    },
    offset: {
      optional: true,
      isInt: { options: { min: 0 } },
      toInt: true
    },
    status: {
      optional: true,
      isIn: { 
        options: [['pending', 'processing', 'completed', 'failed']],
        errorMessage: 'Status must be one of: pending, processing, completed, failed'
      }
    }
  }
};

// Routes

/**
 * POST /api/disease-detection
 * Upload and analyze plant disease image
 */
router.post("/", 
  authMiddleware, 
  uploadSingle, 
  uploadAndAnalyze
);

/**
 * GET /api/disease-detection/:id
 * Get specific analysis by ID
 */
router.get("/:id", 
  authMiddleware, 
  getAnalysisById
);

/**
 * GET /api/disease-detection
 * List user's analyses with pagination
 */
router.get("/", 
  authMiddleware, 
  listUserAnalyses
);

/**
 * GET /api/disease-detection/stats/summary
 * Get user's analysis statistics
 */
router.get("/stats/summary", 
  authMiddleware, 
  getStats
);

/**
 * POST /api/disease-detection/:id/retry
 * Retry a failed analysis
 */
router.post("/:id/retry", 
  authMiddleware, 
  retryAnalysis
);

/**
 * DELETE /api/disease-detection/:id
 * Delete an analysis
 */
router.delete("/:id", 
  authMiddleware, 
  deleteAnalysis
);

export default router;