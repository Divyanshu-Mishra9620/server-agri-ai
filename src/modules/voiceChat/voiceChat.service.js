import VoiceChat from "./voiceChat.model.js";
import { generateFarmerResponse } from "./ai-assistant.js";
import { transcribeAudio, synthesizeSpeech } from "./deepgram.service.js";
import { v4 as uuidv4 } from 'uuid';

export const createVoiceSession = async (userId, language) => {
  const sessionId = uuidv4();
  
  const voiceChat = new VoiceChat({
    userId,
    sessionId,
    language,
    status: 'active',
    conversations: []
  });
  
  await voiceChat.save();
  
  return {
    sessionId,
    language,
    status: 'active'
  };
};

export const processAudioData = async (userId, sessionId, audioData, language) => {
  try {
    // Find the voice chat session
    let voiceChat = await VoiceChat.findOne({ userId, sessionId, status: 'active' });
    
    if (!voiceChat) {
      throw new Error("Voice session not found or expired");
    }
    
    // Step 1: Transcribe audio using Deepgram
    const transcription = await transcribeAudio(audioData, language);
    
    if (!transcription || transcription.trim() === '') {
      throw new Error("Could not understand the audio. Please speak clearly.");
    }
    
    // Step 2: Generate AI response for farmer queries
    const aiResponse = await generateFarmerResponse(transcription, language, userId);
    
    // Step 3: Convert AI response to speech
    const audioResponse = await synthesizeSpeech(aiResponse, language);
    
    // Step 4: Save conversation to database
    const conversation = {
      userAudio: audioData,
      userText: transcription,
      aiText: aiResponse,
      aiAudio: audioResponse,
      timestamp: new Date()
    };
    
    voiceChat.conversations.push(conversation);
    voiceChat.lastActivity = new Date();
    await voiceChat.save();
    
    return {
      userText: transcription,
      aiText: aiResponse,
      aiAudio: audioResponse,
      conversationId: conversation._id
    };
    
  } catch (error) {
    console.error("Error processing audio data:", error);
    throw error;
  }
};

export const terminateSession = async (userId, sessionId) => {
  const voiceChat = await VoiceChat.findOne({ userId, sessionId });
  
  if (voiceChat) {
    voiceChat.status = 'completed';
    voiceChat.endTime = new Date();
    await voiceChat.save();
  }
};

export const getUserVoiceHistory = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  
  const voiceChats = await VoiceChat.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('sessionId language status conversations.userText conversations.aiText conversations.timestamp createdAt');
  
  const total = await VoiceChat.countDocuments({ userId });
  
  return {
    voiceChats,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};
