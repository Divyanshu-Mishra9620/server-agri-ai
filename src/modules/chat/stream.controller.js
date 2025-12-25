import config from "../../config/env.js";
// Removed Gemini - using OpenRouter instead to avoid quota limits
// import { GoogleGenerativeAI } from "@google/generative-ai";
// const genAI = new GoogleGenerativeAI(config.geminiApiKey);

export async function streamSuggestion(req, res, next) {
  try {
    const { query, context } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        message: "Query is required and must be a string",
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

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

    // Use OpenRouter API instead of Gemini (no quota limits with free models)
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openrouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": config.frontendUrl,
          "X-Title": "Krishi Mitra",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free", // Free model
          messages: [{ role: "user", content: enhancedPrompt }],
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText}`
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter((line) => line.trim() !== "");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    console.log(
      `[Stream] Completed suggestion stream for user: ${req.user?.id || "anonymous"}`
    );
  } catch (err) {
    console.error("[Stream] Error:", err);

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
export async function getSuggestion(req, res, next) {
  try {
    const { query, context } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        message: "Query is required and must be a string",
      });
    }

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

    // Use OpenRouter API instead of Gemini
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openrouterApiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": config.frontendUrl,
          "X-Title": "Krishi Mitra",
        },
        body: JSON.stringify({
          model: "google/gemini-2.0-flash-exp:free",
          messages: [{ role: "user", content: enhancedPrompt }],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices[0]?.message?.content || "No response generated";

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
