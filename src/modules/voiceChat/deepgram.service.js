import { createClient } from "@deepgram/sdk";
import config from "../../config/env.js";

const getDeepgramClient = () => {
  if (!config.DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY not configured");
  }

  return createClient(config.DEEPGRAM_API_KEY);
};

export const transcribeAudio = async (
  audioData,
  language = "hi",
  mimetype = "audio/webm"
) => {
  try {
    const deepgram = getDeepgramClient();
    const audioBuffer = Buffer.from(audioData, "base64");

    if (audioBuffer.length < 100) {
      throw new Error("Audio too short. Please record for at least 1 second.");
    }

    console.log(
      `[Deepgram] Transcribing audio: ${audioBuffer.length} bytes, language: ${language}, mimetype: ${mimetype}`
    );

    const transcriptionOptions = {
      model: "nova-2",
      smart_format: true,
      punctuate: true,
      detect_language: true,
      filler_words: false,
      utterances: false,
    };

    try {
      const { result } = await deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        transcriptionOptions
      );

      console.log("[Deepgram] Raw result:", JSON.stringify(result, null, 2));

      const transcript =
        result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      const confidence =
        result?.results?.channels?.[0]?.alternatives?.[0]?.confidence;
      const detectedLang = result?.results?.channels?.[0]?.detected_language;

      console.log(
        `[Deepgram] Transcript: "${transcript}", Confidence: ${confidence}, Detected Lang: ${detectedLang}`
      );

      if (!transcript || transcript.trim() === "") {
        console.error("[Deepgram] No transcript found in result");
        throw new Error(
          "No speech detected in audio. Please speak clearly into the microphone."
        );
      }

      return transcript.trim();
    } catch (err) {
      console.warn(
        "[Deepgram] Primary model failed, trying base model:",
        err.message
      );

      const { result } = await deepgram.listen.prerecorded.transcribeFile(
        audioBuffer,
        {
          model: "base",
          smart_format: true,
        }
      );

      console.log(
        "[Deepgram] Base model result:",
        JSON.stringify(result, null, 2)
      );

      const transcript =
        result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
      if (!transcript || transcript.trim() === "") {
        console.error("[Deepgram] Base model also returned empty transcript");
        throw new Error(
          "No speech detected in audio. Please speak clearly and ensure your microphone is working."
        );
      }

      return transcript.trim();
    }
  } catch (error) {
    console.error("[Deepgram] Error transcribing audio:", error);
    throw new Error(`Transcription failed: ${error.message}`);
  }
};

export const synthesizeSpeech = async (text, language = "hi") => {
  try {
    const deepgram = getDeepgramClient();
    const primaryModel =
      language === "hindi" ? "aura-asteria-hi" : "aura-asteria-en";
    const fallbackModel = "aura-luna-en";

    try {
      const { result } = await deepgram.speak.request(
        { text },
        {
          model: primaryModel,
          encoding: "linear16",
          container: "wav",
          sample_rate: 24000,
        }
      );

      const audioBuffer = Buffer.from(await result.arrayBuffer());
      return audioBuffer.toString("base64");
    } catch (err) {
      console.warn(
        "Falling back to basic aura voice due to error:",
        err.message
      );

      const { result } = await deepgram.speak.request(
        { text },
        {
          model: fallbackModel,
          encoding: "linear16",
          container: "wav",
          sample_rate: 16000,
        }
      );

      const audioBuffer = Buffer.from(await result.arrayBuffer());
      return audioBuffer.toString("base64");
    }
  } catch (error) {
    console.error("Error synthesizing speech:", error);
    throw new Error(`Speech synthesis failed: ${error.message}`);
  }
};

export const validateAudioFormat = (audioData) => {
  try {
    const buffer = Buffer.from(audioData, "base64");

    if (buffer.length < 1000) throw new Error("Audio data too small");
    if (buffer.length > 10 * 1024 * 1024)
      throw new Error("Audio data too large");

    return true;
  } catch (error) {
    throw new Error(`Invalid audio format: ${error.message}`);
  }
};

export const getSupportedLanguages = () => ({
  transcription: {
    hindi: "hi",
    english: "en-IN",
  },
  synthesis: {
    hindi: "aura-asteria-hi",
    english: "aura-asteria-en",
  },
});

export const checkDeepgramHealth = async () => {
  try {
    const deepgram = getDeepgramClient();
    const testAudio = Buffer.from("test-audio-data");
    await deepgram.listen.prerecorded.transcribeFile(testAudio, {
      model: "general",
      language: "en",
    });
    return { status: "healthy", message: "Deepgram API is accessible" };
  } catch (error) {
    if (
      error.message.includes("authentication") ||
      error.message.includes("Invalid")
    ) {
      return {
        status: "healthy",
        message: "Deepgram API reachable, check credentials",
      };
    }
    return { status: "unhealthy", message: error.message };
  }
};
