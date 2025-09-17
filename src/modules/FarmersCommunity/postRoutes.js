import { Router } from "express";
import {
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  deletePost,
  votePost,
} from "./postController.js";

import { authMiddleware as auth } from "../../shared/middlewares/authMiddleware.js";
import upload from "../../shared/middlewares/uploadMiddleware.js";

const router = Router();

router.get("/", getAllPosts);
router.post("/", auth, upload.single("image"), createPost);
router.get("/:postId", getPostById);
router.patch("/:postId", auth, updatePost);
router.delete("/:postId", auth, deletePost);
router.post("/:postId/vote", auth, votePost);

export default router;
