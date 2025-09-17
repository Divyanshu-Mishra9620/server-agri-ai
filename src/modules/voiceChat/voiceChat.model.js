import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  userAudio: {
    type: String, // Base64 encoded audio
    required: true
  },
  userText: {
    type: String,
    required: true
  },
  aiText: {
    type: String,
    required: true
  },
  aiAudio: {
    type: String, // Base64 encoded audio response
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const voiceChatSchema = new mongoose.Schema({
//   userId: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: true
//   },
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  language: {
    type: String,
    enum: ['hindi', 'english'],
    default: 'hindi'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'expired'],
    default: 'active'
  },
  conversations: [conversationSchema],
  lastActivity: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for better query performance
voiceChatSchema.index({ userId: 1, createdAt: -1 });
voiceChatSchema.index({ sessionId: 1 });

export default mongoose.model("VoiceChat", voiceChatSchema);