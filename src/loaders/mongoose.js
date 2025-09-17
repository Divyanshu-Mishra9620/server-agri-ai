import mongoose from "mongoose";
import config from "../config/env.js";

export default async function connectDB() {
  try {
    await mongoose.connect(config.mongoUri);
    console.log(" MongoDB connected");
  } catch (error) {
    console.error(" DB connection error:", error);
    process.exit(1);
  }
}
