import { createClient } from '@deepgram/sdk';
import config from '../../config/env.js';

// Initialize Deepgram client
const deepgram = createClient(config.DEEPGRAM_API_KEY);

// Transcription with model fallback
export const transcribeAudio = async (audioData, language = 'hi') => {
  try {
    const audioBuffer = Buffer.from(audioData, 'base64');

    // Preferred model first (paid), then fallback (free)
    const transcriptionOptions = {
      language: language === 'hindi' ? 'hi' : 'en-IN',
      model: 'nova-2',       // try premium
      smart_format: true,
      punctuate: true,
      alternatives: 1,
    };

    try {
      const { result } = await deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        transcriptionOptions
      );

      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (!transcript || transcript.trim() === '') {
        throw new Error('No speech detected in audio. Please speak clearly into the microphone.');
      }

      const confidence = result?.results?.channels?.[0]?.alternatives?.[0]?.confidence;
      console.log(`Transcription confidence (nova-2): ${confidence}`);

      return transcript.trim();
    } catch (err) {
      console.warn('Falling back to general model due to error:', err.message);

      // Retry with free model
      const { result } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
        language: language === 'hindi' ? 'hi' : 'en-IN',
        model: 'general',
        punctuate: true,
        smart_format: true,
      });

      const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (!transcript || transcript.trim() === '') {
        throw new Error('No speech detected in audio. Please speak clearly into the microphone.');
      }

      return transcript.trim();
    }
  } catch (error) {
    console.error('Error transcribing audio:', error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
};

export const synthesizeSpeech = async (text, language = 'hi') => {
  try {
    const primaryModel = language === 'hindi' ? 'aura-asteria-hi' : 'aura-asteria-en';
    const fallbackModel = 'aura-luna-en'; 

    try {
      const { result } = await deepgram.speak.request({ text }, {
        model: primaryModel, 
        encoding: "linear16", 
        container: "wav",    
        sample_rate: 24000,
      });

      const audioBuffer = Buffer.from(await result.arrayBuffer());
      return audioBuffer.toString('base64');
    } catch (err) {
      console.warn('Falling back to basic aura voice due to error:', err.message);

      const { result } = await deepgram.speak.request({ text }, {
        model: fallbackModel, // ✅ Fixed: now uses 'aura-luna-en' instead of 'aura'
        encoding: 'linear16',
        container: 'wav',
        sample_rate: 16000,   // ✅ Added sample_rate for consistency
      });

      const audioBuffer = Buffer.from(await result.arrayBuffer());
      return audioBuffer.toString('base64');
    }
  } catch (error) {
    console.error('Error synthesizing speech:', error);
    throw new Error(`Speech synthesis failed: ${error.message}`);
  }
};

// Utility: validate audio
export const validateAudioFormat = (audioData) => {
  try {
    const buffer = Buffer.from(audioData, 'base64');

    if (buffer.length < 1000) throw new Error('Audio data too small');
    if (buffer.length > 10 * 1024 * 1024) throw new Error('Audio data too large');

    return true;
  } catch (error) {
    throw new Error(`Invalid audio format: ${error.message}`);
  }
};

// Supported languages map
export const getSupportedLanguages = () => ({
  transcription: {
    hindi: 'hi',
    english: 'en-IN',
  },
  synthesis: {
    hindi: 'aura-asteria-hi',
    english: 'aura-asteria-en',
  },
});

// API health check
export const checkDeepgramHealth = async () => {
  try {
    const testAudio = Buffer.from('test-audio-data');
    await deepgram.listen.prerecorded.transcribeFile(testAudio, {
      model: 'general',
      language: 'en',
    });
    return { status: 'healthy', message: 'Deepgram API is accessible' };
  } catch (error) {
    if (error.message.includes('authentication') || error.message.includes('Invalid')) {
      return { status: 'healthy', message: 'Deepgram API reachable, check credentials' };
    }
    return { status: 'unhealthy', message: error.message };
  }
};
