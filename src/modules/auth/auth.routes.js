import { Router } from "express";
import * as authController from "./auth.controller.js";
import { authMiddleware, roleMiddleware } from "../../shared/middlewares/authMiddleware.js";

const router = Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authMiddleware, authController.logout);
router.post("/reset-password", authMiddleware, authController.resetPassword);
router.get("/profile", authMiddleware, authController.profile);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password-token", authController.resetPasswordWithToken);


// Example of role-based route
router.get("/admin-only", authMiddleware, roleMiddleware("admin"), (req, res) => {
  res.json({ message: "Welcome, Admin!" });
});

export default router;
