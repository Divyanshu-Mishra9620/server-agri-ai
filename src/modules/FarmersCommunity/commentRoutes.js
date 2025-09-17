import { Router } from "express";
import {
  deleteComment,
  voteComment,
  getCommentsForPost,
  createComment,
  editComment,
} from "./commentController.js";
import { authMiddleware as auth } from "../../shared/middlewares/authMiddleware.js";

const router = Router();

router.post("/:postId/comments", auth, createComment);
router.delete("/:commentId", auth, deleteComment);
router.post("/:commentId/vote", auth, voteComment);
router.get("/:postId/comments", getCommentsForPost);
router.put("/:commentId", auth, editComment);

export default router;
