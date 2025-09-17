import { 
  createVoiceSession, 
  processAudioData, 
  terminateSession,
  getUserVoiceHistory 
} from "./voiceChat.service.js";

export const startVoiceSession = async (req, res) => {
  try {
    const { userId } = req.user;
    const { language = 'hindi' } = req.body;
    
    const session = await createVoiceSession(userId, language);
    
    res.json({
      success: true,
      message: "Voice session started successfully",
      data: session
    });
  } catch (error) {
    console.error("Error starting voice session:", error);
    res.status(500).json({
      success: false,
      message: "Failed to start voice session",
      error: error.message
    });
  }
};

export const processVoiceQuery = async (req, res) => {
  try {
    const { userId } = req.user;
    const { sessionId, audioData, language = 'hindi' } = req.body;
    
    if (!audioData) {
      return res.status(400).json({
        success: false,
        message: "Audio data is required"
      });
    }
    
    const result = await processAudioData(userId, sessionId, audioData, language);
    
    res.json({
      success: true,
      message: "Voice query processed successfully",
      data: result
    });
  } catch (error) {
    console.error("Error processing voice query:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process voice query",
      error: error.message
    });
  }
};

export const endVoiceSession = async (req, res) => {
  try {
    const { userId } = req.user;
    const { sessionId } = req.body;
    
    await terminateSession(userId, sessionId);
    
    res.json({
      success: true,
      message: "Voice session ended successfully"
    });
  } catch (error) {
    console.error("Error ending voice session:", error);
    res.status(500).json({
      success: false,
      message: "Failed to end voice session",
      error: error.message
    });
  }
};

export const getVoiceChatHistory = async (req, res) => {
  try {
    const { userId } = req.user;
    const { page = 1, limit = 10 } = req.query;
    
    const history = await getUserVoiceHistory(userId, parseInt(page), parseInt(limit));
    
    res.json({
      success: true,
      message: "Voice chat history retrieved successfully",
      data: history
    });
  } catch (error) {
    console.error("Error getting voice chat history:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get voice chat history",
      error: error.message
    });
  }
};