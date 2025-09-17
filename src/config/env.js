import dotenv from 'dotenv';
dotenv.config();

const config = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || "your_jwt_secret_here",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "your_jwt_refresh_secret_here" ,  
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:3000" ,

  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
 
  groqApiKey: process.env.GROQ_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  langgraphApiKey: process.env.LANGGRAPH_API_KEY,
  DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
  maxUploadSize: parseInt(process.env.MAX_UPLOAD_SIZE || "5242880", 10), // 5MB default
};

export default config;