import config from "../../config/env.js";
import fetch from "node-fetch";

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

    let contextStr = "";
    if (context) {
      const contextParts = [];
      if (context.location) contextParts.push(`Location: ${context.location}`);
      if (context.crop) contextParts.push(`Crop: ${context.crop}`);
      if (context.soilType) contextParts.push(`Soil: ${context.soilType}`);
      if (context.season) contextParts.push(`Season: ${context.season}`);
      if (contextParts.length > 0) {
        contextStr = `\n\nContext: ${contextParts.join(" | ")}`;
      }
    }

    let enhancedPrompt = `You are 'Krishi Mitra' (कृषि मित्र), a helpful agricultural AI assistant for Indian farmers.

Farmer's Question: ${query}${contextStr}

Instructions:
• Give a CONCISE, practical answer (3-5 short paragraphs maximum)
• Use simple language that farmers understand
• Include specific steps or recommendations
• Mention any critical warnings briefly
• If relevant, add local Indian farming practices

Keep it SHORT, CLEAR, and ACTIONABLE. Avoid long explanations.`;

    console.log(
      `[Stream] Starting suggestion stream for user: ${req.user?.id || "anonymous"}`,
    );

    res.write(`data: ${JSON.stringify({ status: "connecting" })}\n\n`);
    if (res.flush) res.flush();

    if (!config.openrouterApiKey) {
      console.error("[Stream] ERROR: OpenRouter API key is not configured!");
      res.write(
        `data: ${JSON.stringify({
          error: true,
          message: "API key not configured",
        })}\n\n`,
      );
      res.end();
      return;
    }

    console.log(
      `[Stream] Using OpenRouter API with model: google/gemini-2.0-flash-exp:free`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
          stream: true,
          max_tokens: 800,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.error("[Stream] Fetch error:", fetchErr);
      res.write(
        `data: ${JSON.stringify({
          error: true,
          message:
            fetchErr.name === "AbortError"
              ? "Request timeout. Please try again."
              : "Connection failed. Please try again.",
        })}\n\n`,
      );
      res.end();
      return;
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Stream] OpenRouter API Error:`, {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(
        `OpenRouter API error: ${response.status} ${response.statusText} - ${errorBody}`,
      );
    }

    console.log(
      `[Stream] Successfully connected to OpenRouter, starting stream...`,
    );

    let buffer = "";
    let chunkCount = 0;

    try {
      for await (const chunk of response.body) {
        chunkCount++;
        buffer += chunk.toString();
        console.log(
          `[Stream] Received chunk #${chunkCount}, size: ${chunk.length} bytes`,
        );

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
                if (res.flush) res.flush();
              }
            } catch (e) {
              console.error("[Stream] Error parsing chunk:", e.message);
            }
          }
        }
      }

      console.log(`[Stream] Stream ended after ${chunkCount} chunks`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      console.log(
        `[Stream] Completed suggestion stream for user: ${req.user?.id || "anonymous"}`,
      );
    } catch (streamErr) {
      console.error("[Stream] Stream iteration error:", {
        message: streamErr.message,
        stack: streamErr.stack,
        name: streamErr.name,
      });
      res.write(
        `data: ${JSON.stringify({
          error: true,
          message: "Stream interrupted. Please try again.",
        })}\n\n`,
      );
      res.end();
    }
  } catch (err) {
    console.error("[Stream] Error Details:", {
      message: err.message,
      stack: err.stack,
      name: err.name,
      cause: err.cause,
    });

    if (!res.headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
    }

    res.write(
      `data: ${JSON.stringify({
        error: true,
        message:
          "An error occurred while generating suggestions. Please try again.",
      })}\n\n`,
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

    let contextStr = "";
    if (context) {
      const contextParts = [];
      if (context.location) contextParts.push(`Location: ${context.location}`);
      if (context.crop) contextParts.push(`Crop: ${context.crop}`);
      if (context.soilType) contextParts.push(`Soil: ${context.soilType}`);
      if (context.season) contextParts.push(`Season: ${context.season}`);
      if (contextParts.length > 0) {
        contextStr = `\n\nContext: ${contextParts.join(" | ")}`;
      }
    }

    let enhancedPrompt = `You are 'Krishi Mitra' (कृषि मित्र), a helpful agricultural AI assistant for Indian farmers.

Farmer's Question: ${query}${contextStr}

Instructions:
• Give a CONCISE, practical answer (3-5 short paragraphs maximum)
• Use simple language that farmers understand
• Include specific steps or recommendations
• Mention any critical warnings briefly
• If relevant, add local Indian farming practices

Keep it SHORT, CLEAR, and ACTIONABLE. Avoid long explanations.`;

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
          max_tokens: 800,
          temperature: 0.7,
        }),
      },
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
