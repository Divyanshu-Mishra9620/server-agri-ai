import { Router } from "express";
import * as userController from "./user.controller.js";
import { authMiddleware } from "../../shared/middlewares/authMiddleware.js";

const router = Router();

router.get("/me", authMiddleware, userController.getProfile);
router.put("/me", authMiddleware, userController.updateProfile);
router.put("/me/change-password", authMiddleware, userController.changePassword);
router.put("/me/change-email", authMiddleware, userController.updateEmail);

export default router;
