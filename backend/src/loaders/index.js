import connectDB from "./mongoose.js";
import expressLoader from "./express.js";

export default async function initApp() {
  await connectDB();
  return expressLoader();
}
