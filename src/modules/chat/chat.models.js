// modules/chat/chat.models.js - Updated Analytics schema with missing enum values
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  messages: [{
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }],
  context: {
    crop: String,
    location: {
      address: String,
      coordinates: {
        lat: Number,
        lon: Number
      },
      state: String,
      district: String
    },
    weather: {
      type: mongoose.Schema.Types.Mixed
    },
    soilAnalysis: {
      type: mongoose.Schema.Types.Mixed
    },
    marketData: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
conversationSchema.index({ userId: 1, lastActivity: -1 });
conversationSchema.index({ sessionId: 1 });

// Auto-update lastActivity on message addition
conversationSchema.pre('save', function(next) {
  if (this.isModified('messages')) {
    this.lastActivity = new Date();
  }
  next();
});

const feedbackSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true
  },
  messageIndex: {
    type: Number,
    required: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  feedback: {
    type: String,
    maxlength: 500
  },
  category: {
    type: String,
    enum: ['helpful', 'accurate', 'relevant', 'clear', 'actionable', 'other']
  }
}, {
  timestamps: true
});

// FIXED Analytics schema - Added missing enum values that socket.js is trying to use
const analyticsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    enum: [
      'chat_message', 
      'soil_analysis', 
      'weather_query', 
      'market_query', 
      'geocoding',
      'socket_connection',    // <-- ADD THIS
      'socket_disconnect',    // <-- ADD THIS
      'socket_error'          // <-- ADD THIS
    ],
    required: true
  },
  eventData: {
    type: mongoose.Schema.Types.Mixed
  },
  sessionId: String,
  userAgent: String,
  ipAddress: String,
  responseTime: Number, // in milliseconds
  success: {
    type: Boolean,
    default: true
  },
  errorMessage: String
}, {
  timestamps: true
});

// Index for analytics queries
analyticsSchema.index({ userId: 1, createdAt: -1 });
analyticsSchema.index({ eventType: 1, createdAt: -1 });

// User preferences schema (extend the existing user model or create separate)
const userPreferencesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  language: {
    type: String,
    default: 'en',
    enum: ['en', 'hi', 'bn', 'te', 'ta', 'mr', 'gu', 'kn', 'ml', 'or']
  },
  farmingType: {
    type: String,
    enum: ['traditional', 'organic', 'modern', 'mixed'],
    default: 'mixed'
  },
  primaryCrops: [String],
  location: {
    state: String,
    district: String,
    village: String,
    coordinates: {
      lat: Number,
      lon: Number
    }
  },
  farmSize: {
    value: Number,
    unit: {
      type: String,
      enum: ['acres', 'hectares', 'bigha', 'square_feet'],
      default: 'acres'
    }
  },
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'experienced', 'expert'],
    default: 'intermediate'
  },
  notificationPreferences: {
    weather: { type: Boolean, default: true },
    market: { type: Boolean, default: true },
    farming_tips: { type: Boolean, default: true },
    pest_alerts: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

export const Conversation = mongoose.model('Conversation', conversationSchema);
export const Feedback = mongoose.model('Feedback', feedbackSchema);
export const Analytics = mongoose.model('Analytics', analyticsSchema);
export const UserPreferences = mongoose.model('UserPreferences', userPreferencesSchema);