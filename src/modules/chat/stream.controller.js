import config from "../../config/env.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(config.geminiApiKey);

/**
 * Stream suggestions from RAG system
 * This endpoint receives agricultural queries and streams AI responses
 */
export async function streamSuggestion(req, res, next) {
  try {
    const { query, context } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        message: "Query is required and must be a string",
      });
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Build enhanced prompt with context
    let enhancedPrompt = `You are 'Krishi Mitra', an expert agricultural AI assistant for Indian farmers.

User Query: ${query}`;

    if (context) {
      enhancedPrompt += `\n\nAdditional Context:`;
      if (context.location)
        enhancedPrompt += `\n- Location: ${context.location}`;
      if (context.crop) enhancedPrompt += `\n- Crop: ${context.crop}`;
      if (context.soilType)
        enhancedPrompt += `\n- Soil Type: ${context.soilType}`;
      if (context.season) enhancedPrompt += `\n- Season: ${context.season}`;
    }

    enhancedPrompt += `\n\nProvide a comprehensive, practical response in simple language. Include:
1. Direct answer to the query
2. Specific recommendations or steps
3. Important warnings or precautions (if applicable)
4. Local practices when relevant

Keep the response well-structured and actionable for farmers.`;

    console.log(
      `[Stream] Starting suggestion stream for user: ${req.user?.id || "anonymous"}`
    );

    // Use Gemini with streaming
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });

    const result = await model.generateContentStream(enhancedPrompt);

    // Stream the response
    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        // Send as SSE format
        res.write(`data: ${JSON.stringify({ content: chunkText })}\n\n`);
      }
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    console.log(
      `[Stream] Completed suggestion stream for user: ${req.user?.id || "anonymous"}`
    );
  } catch (err) {
    console.error("[Stream] Error:", err);

    // Send error through SSE
    res.write(
      `data: ${JSON.stringify({
        error: true,
        message:
          "An error occurred while generating suggestions. Please try again.",
      })}\n\n`
    );
    res.end();
  }
}

/**
 * Get agricultural suggestions (non-streaming fallback)
 */
export async function getSuggestion(req, res, next) {
  try {
    const { query, context } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        message: "Query is required and must be a string",
      });
    }

    // Build enhanced prompt
    let enhancedPrompt = `You are 'Krishi Mitra', an expert agricultural AI assistant for Indian farmers.

User Query: ${query}`;

    if (context) {
      enhancedPrompt += `\n\nAdditional Context:`;
      if (context.location)
        enhancedPrompt += `\n- Location: ${context.location}`;
      if (context.crop) enhancedPrompt += `\n- Crop: ${context.crop}`;
      if (context.soilType)
        enhancedPrompt += `\n- Soil Type: ${context.soilType}`;
      if (context.season) enhancedPrompt += `\n- Season: ${context.season}`;
    }

    enhancedPrompt += `\n\nProvide a comprehensive, practical response in simple language. Include:
1. Direct answer to the query
2. Specific recommendations or steps
3. Important warnings or precautions (if applicable)
4. Local practices when relevant

Keep the response well-structured and actionable for farmers.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
    });

    const result = await model.generateContent(enhancedPrompt);
    const response = await result.response;
    const text = response.text();

    res.json({
      success: true,
      suggestion: text,
      query,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Suggestion error:", err);
    next(err);
  }
}
