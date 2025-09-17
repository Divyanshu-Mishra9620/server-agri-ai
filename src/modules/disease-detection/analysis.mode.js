import mongoose from "mongoose";

const analysisSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: false 
  },
  imageUrl: { 
    type: String, 
    required: true 
  },
  originalName: { 
    type: String 
  },
  crop: { 
    type: String,
    trim: true
  },
  location: {
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  
  // AI Analysis Results
  detection: {
    disease: { type: String },
    confidence: { type: Number, min: 0, max: 1 },
    severity: { 
      type: String, 
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },
  
  recommendations: {
    treatment: [{
      method: String,
      description: String,
      priority: { type: String, enum: ['high', 'medium', 'low'] }
    }],
    fertilizers: [String],
    homeRemedies: [String],
    preventiveMeasures: [String]
  },
  
  // Processing metadata
  processingSteps: [{
    step: String,
    status: { type: String, enum: ['pending', 'completed', 'failed'] },
    result: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now },
    error: String
  }],
  
  aiProvider: { 
    type: String, 
    enum: ['groq', 'gemini', 'huggingface'],
    default: 'groq'
  },
  
  status: { 
    type: String, 
    enum: ['pending', 'processing', 'completed', 'failed'], 
    default: 'pending' 
  },
  
  error: { 
    type: String, 
    default: null 
  },
  
  // Raw responses for debugging
  rawResponses: {
    imageAnalysis: mongoose.Schema.Types.Mixed,
    diseaseIdentification: mongoose.Schema.Types.Mixed,
    recommendations: mongoose.Schema.Types.Mixed
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
analysisSchema.index({ createdAt: -1 });
analysisSchema.index({ user: 1, createdAt: -1 });
analysisSchema.index({ status: 1 });
analysisSchema.index({ 'detection.disease': 1 });

// Virtual for formatted confidence percentage
analysisSchema.virtual('confidencePercentage').get(function() {
  return this.detection?.confidence ? Math.round(this.detection.confidence * 100) : 0;
});

export default mongoose.model("Analysis", analysisSchema);