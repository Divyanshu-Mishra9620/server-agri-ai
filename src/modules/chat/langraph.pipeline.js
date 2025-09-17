import { StateGraph, END } from "@langchain/langgraph";
import { ChatGroq } from "@langchain/groq";
import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../../config/env.js";

const groq = new ChatGroq({
  apiKey: config.groqApiKey,
  model: "llama-3.1-70b-versatile",
});

const genAI = new GoogleGenerativeAI(config.geminiApiKey);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// FIXED: Correct AgentState definition for LangGraph
// The StateGraph expects each field to have a 'value' function and 'default' function
const AgentState = {
  messages: {
    value: (x, y) => {
      const xArray = Array.isArray(x) ? x : [];
      const yArray = Array.isArray(y) ? y : [];
      return xArray.concat(yArray);
    },
    default: () => [],
  },
  context: {
    value: (x, y) => {
      const xObj = x && typeof x === "object" ? x : {};
      const yObj = y && typeof y === "object" ? y : {};
      return { ...xObj, ...yObj };
    },
    default: () => ({}),
  },
  analysis: {
    value: (x, y) => {
      const xObj = x && typeof x === "object" ? x : {};
      const yObj = y && typeof y === "object" ? y : {};
      return { ...xObj, ...yObj };
    },
    default: () => ({}),
  },
  recommendations: {
    value: (x, y) => {
      const xArray = Array.isArray(x) ? x : [];
      const yArray = Array.isArray(y) ? y : [];
      return xArray.concat(yArray);
    },
    default: () => [],
  },
  currentStep: {
    value: (x, y) => y || x || "analyze_context",
    default: () => "analyze_context",
  },
  finalResponse: {
    value: (x, y) => y || x || "",
    default: () => "",
  },
};

// Safe helper function to extract context information
function safeExtractContext(context) {
  const safeContext = context || {};

  return {
    crop: safeContext.crop || null,
    location: safeContext.location
      ? {
          address: safeContext.location.address || null,
          coordinates: safeContext.location.coordinates || null,
          state: safeContext.location.state || null,
          district: safeContext.location.district || null,
        }
      : null,
    weather: safeContext.weather
      ? {
          temp: safeContext.weather.temp,
          humidity: safeContext.weather.humidity,
          rain: safeContext.weather.rain,
          description: safeContext.weather.description,
        }
      : null,
    soilAnalysis: safeContext.soilAnalysis || null,
    marketData: safeContext.marketData || null,
  };
}

async function analyzeContext(state) {
  console.log("🔍 [DEBUG] analyzeContext started");

  const { context = {}, messages = [] } = state;
  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1]?.content || "" : "";

  console.log("🔍 [DEBUG] Last message:", lastMessage);
  console.log(
    "🔍 [DEBUG] Config check - GROQ key exists:",
    !!config.groqApiKey
  );

  // Extract safe context
  const safeContext = safeExtractContext(context);
  console.log("🔍 [DEBUG] Safe context:", JSON.stringify(safeContext, null, 2));

  const analysisPrompt = `
You are an expert agricultural AI assistant for Indian farmers. Analyze the farmer's query and context:

Query: "${lastMessage}"
Context: ${JSON.stringify(safeContext, null, 2)}

Determine:
1. Type of query (crop selection, pest management, weather advice, market info, soil health, general farming)
2. Urgency level (high/medium/low)
3. Required information sources
4. Specific recommendations needed

Respond in JSON format:
{
  "queryType": "...",
  "urgency": "...",
  "requiredSources": ["weather", "soil", "market", "crop_data"],
  "specificNeeds": ["..."]
}
  `;

  try {
    console.log("🔍 [DEBUG] Making GROQ API call...");
    const result = await groq.invoke([
      { role: "user", content: analysisPrompt },
    ]);
    console.log("🔍 [DEBUG] GROQ response:", result.content);

    let analysis;

    try {
      analysis = JSON.parse(result.content);
      console.log("✅ [DEBUG] Successfully parsed JSON analysis:", analysis);
    } catch (parseError) {
      console.warn("⚠️ [DEBUG] JSON parsing failed:", parseError.message);
      console.log("Raw content:", result.content);

      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          analysis = JSON.parse(jsonMatch[0]);
          console.log(
            "✅ [DEBUG] Successfully extracted and parsed JSON:",
            analysis
          );
        } catch (extractError) {
          console.error(
            "❌ [DEBUG] Even extracted JSON failed to parse:",
            extractError.message
          );
          analysis = getFallbackAnalysis();
        }
      } else {
        console.warn("⚠️ [DEBUG] No JSON found in response, using fallback");
        analysis = getFallbackAnalysis();
      }
    }

    console.log("🔍 [DEBUG] Final analysis:", analysis);
    return {
      ...state,
      analysis,
      currentStep: "generate_recommendations",
    };
  } catch (error) {
    console.error("❌ [DEBUG] Context analysis error:", error.message);
    console.error("❌ [DEBUG] Full error:", error);

    return {
      ...state,
      analysis: getFallbackAnalysis(),
      currentStep: "generate_recommendations",
    };
  }
}

async function generateRecommendations(state) {
  console.log("💡 [DEBUG] generateRecommendations started");

  const { context = {}, messages = [], analysis = {} } = state;
  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1]?.content || "" : "";

  console.log(
    "💡 [DEBUG] Config check - Gemini key exists:",
    !!config.geminiApiKey
  );

  // Extract safe context
  const safeContext = safeExtractContext(context);

  // Format context for display
  const formatContextForPrompt = (ctx) => {
    let contextStr = "";

    if (ctx.crop) {
      contextStr += `- Crop: ${ctx.crop}\n`;
    }

    if (ctx.location) {
      if (ctx.location.address) {
        contextStr += `- Location: ${ctx.location.address}\n`;
      }
      if (ctx.location.coordinates) {
        contextStr += `- Coordinates: ${ctx.location.coordinates.lat}, ${ctx.location.coordinates.lon}\n`;
      }
      if (ctx.location.state) {
        contextStr += `- State: ${ctx.location.state}\n`;
      }
    }

    if (ctx.weather) {
      contextStr += `- Weather: ${ctx.weather.temp ? `${Math.round(ctx.weather.temp)}°C` : "N/A"}, ${ctx.weather.humidity || "N/A"}% humidity`;
      if (ctx.weather.rain) {
        contextStr += `, ${ctx.weather.rain}mm rain`;
      }
      if (ctx.weather.description) {
        contextStr += `, ${ctx.weather.description}`;
      }
      contextStr += "\n";
    }

    if (ctx.soilAnalysis) {
      contextStr += `- Soil Analysis: ${ctx.soilAnalysis.summary || "Analysis available"}\n`;
    }

    if (ctx.marketData) {
      contextStr += `- Market Data: Current price ₹${ctx.marketData.currentPrice || "N/A"}/kg`;
      if (ctx.marketData.trend) {
        contextStr += `, trend: ${ctx.marketData.trend}`;
      }
      contextStr += "\n";
    }

    return contextStr || "No specific context provided";
  };

  const farmingPrompt = `
You are an expert agricultural advisor for Indian farmers. Provide comprehensive, practical advice.

Farmer's Query: "${lastMessage}"

Query Analysis: ${JSON.stringify(analysis)}

Context Information:
${formatContextForPrompt(safeContext)}

Guidelines for your response:
1. Be practical and actionable
2. Consider local Indian farming conditions
3. Provide specific steps the farmer can take
4. Include timing recommendations when relevant
5. Mention cost-effective solutions
6. Address safety concerns if applicable
7. Use simple, clear language
8. Provide alternatives when possible

Focus on:
- Immediate actionable advice
- Season-appropriate recommendations  
- Budget-friendly solutions
- Local resource utilization
- Sustainable farming practices

Respond in a conversational, helpful manner in English. Keep your response comprehensive but easy to understand.
  `;

  try {
    console.log("💡 [DEBUG] Making Gemini API call...");
    const result = await geminiModel.generateContent(farmingPrompt);
    const recommendation = result.response.text();

    console.log("💡 [DEBUG] Gemini response length:", recommendation.length);
    console.log(
      "💡 [DEBUG] Gemini response preview:",
      recommendation.substring(0, 200) + "..."
    );

    return {
      ...state,
      recommendations: [recommendation],
      currentStep: "format_response",
    };
  } catch (error) {
    console.error("❌ [DEBUG] Recommendation generation error:", error.message);
    console.error("❌ [DEBUG] Full error:", error);

    const fallbackResponse = generateFallbackResponse(lastMessage, safeContext);
    return {
      ...state,
      recommendations: [fallbackResponse],
      currentStep: "format_response",
    };
  }
}

async function formatResponse(state) {
  const { recommendations = [], context = {}, analysis = {} } = state;
  const mainRecommendation =
    recommendations.length > 0
      ? recommendations[0]
      : "I'm here to help with your farming questions!";

  // Extract safe context
  const safeContext = safeExtractContext(context);

  // Add contextual tips based on available data
  let additionalTips = [];

  if (safeContext.weather) {
    if (safeContext.weather.temp > 35) {
      additionalTips.push(
        "🌡️ High temperature alert: Consider evening watering and shade protection for sensitive crops."
      );
    }
    if (safeContext.weather.humidity > 80) {
      additionalTips.push(
        "💧 High humidity: Monitor for fungal diseases and ensure good air circulation."
      );
    }
    if (safeContext.weather.rain > 0) {
      additionalTips.push(
        "☔ Rain detected: Adjust irrigation schedule accordingly."
      );
    }
  }

  if (safeContext.crop) {
    additionalTips.push(
      `🌱 For ${safeContext.crop}: Check our crop-specific guides for detailed care instructions.`
    );
  }

  if (safeContext.soilAnalysis) {
    additionalTips.push(
      "🌍 Based on your soil analysis, consider the soil health recommendations provided."
    );
  }

  let finalResponse = mainRecommendation;

  if (additionalTips.length > 0) {
    finalResponse += "\n\n**Additional Tips:**\n" + additionalTips.join("\n");
  }

  finalResponse +=
    "\n\n💡 **Need more help?** Feel free to ask about specific crops, pest problems, soil issues, or market prices!";

  return {
    ...state,
    currentStep: "complete",
    finalResponse,
  };
}

function generateFallbackResponse(query, safeContext) {
  const responses = {
    crop: `For crop selection, I recommend considering your local climate and soil conditions. ${safeContext.location?.address ? `In your area (${safeContext.location.address}), ` : ""}popular options include wheat, rice, and pulses. Consider factors like water availability, market demand, and your farming experience.`,

    pest: "For pest management, start with integrated pest management (IPM): 1) Regular crop monitoring, 2) Use of beneficial insects, 3) Organic pesticides like neem oil, 4) Crop rotation. Always identify the pest correctly before treatment.",

    soil: "For soil health: 1) Regular soil testing, 2) Add organic compost, 3) Practice crop rotation, 4) Use cover crops, 5) Minimize tillage. Healthy soil is the foundation of successful farming.",

    weather: `${safeContext.weather ? `Current conditions: ${Math.round(safeContext.weather.temp)}°C, ${safeContext.weather.humidity}% humidity. ` : ""}Plan your farming activities based on weather forecasts. Use weather-resistant varieties during extreme conditions.`,

    market:
      "For market information, research local wholesale prices, connect with farmer producer organizations (FPOs), consider value addition, and explore direct marketing opportunities.",

    default:
      "I'm here to help with all your farming questions! You can ask about crop selection, pest management, soil health, weather planning, market prices, or any other agricultural topic.",
  };

  const queryLower = query?.toLowerCase();

  if (
    queryLower.includes("crop") ||
    queryLower.includes("plant") ||
    queryLower.includes("grow")
  ) {
    return responses.crop;
  } else if (
    queryLower.includes("pest") ||
    queryLower.includes("insect") ||
    queryLower.includes("disease")
  ) {
    return responses.pest;
  } else if (
    queryLower.includes("soil") ||
    queryLower.includes("fertilizer") ||
    queryLower.includes("manure")
  ) {
    return responses.soil;
  } else if (
    queryLower.includes("weather") ||
    queryLower.includes("rain") ||
    queryLower.includes("temperature")
  ) {
    return responses.weather;
  } else if (
    queryLower.includes("market") ||
    queryLower.includes("price") ||
    queryLower.includes("sell")
  ) {
    return responses.market;
  }

  return responses.default;
}

function getFallbackAnalysis() {
  return {
    queryType: "general_farming",
    urgency: "medium",
    requiredSources: ["general"],
    specificNeeds: ["basic_advice"],
  };
}

function createFarmerAssistantWorkflow() {
  console.log("🏗️ [DEBUG] Creating workflow with AgentState:", AgentState);

  // CRITICAL FIX: Try different approaches for StateGraph initialization
  try {
    // Method 1: Direct state definition (most common in newer versions)
    const workflow = new StateGraph({
      channels: AgentState,
    });

    workflow
      .addNode("analyze_context", analyzeContext)
      .addNode("generate_recommendations", generateRecommendations)
      .addNode("format_response", formatResponse)
      .addEdge("analyze_context", "generate_recommendations")
      .addEdge("generate_recommendations", "format_response")
      .addEdge("format_response", END)
      .setEntryPoint("analyze_context");

    console.log(
      "✅ [DEBUG] Workflow created successfully with channels approach"
    );
    return workflow.compile();
  } catch (error1) {
    console.log(
      "⚠️ [DEBUG] Channels approach failed, trying direct AgentState approach"
    );
    console.log("Error:", error1.message);

    try {
      // Method 2: Direct AgentState (older versions or different configuration)
      const workflow = new StateGraph(AgentState);

      workflow
        .addNode("analyze_context", analyzeContext)
        .addNode("generate_recommendations", generateRecommendations)
        .addNode("format_response", formatResponse)
        .addEdge("analyze_context", "generate_recommendations")
        .addEdge("generate_recommendations", "format_response")
        .addEdge("format_response", END)
        .setEntryPoint("analyze_context");

      console.log(
        "✅ [DEBUG] Workflow created successfully with direct approach"
      );
      return workflow.compile();
    } catch (error2) {
      console.error("❌ [DEBUG] Both workflow creation methods failed!");
      console.error("Error 1:", error1.message);
      console.error("Error 2:", error2.message);
      throw error2;
    }
  }
}

export async function executeFarmerAssistantPipeline(messages, context = {}) {
  console.log("🚀 [DEBUG] Pipeline started");
  console.log("🚀 [DEBUG] Input messages length:", messages?.length);
  console.log("🚀 [DEBUG] Input context keys:", Object.keys(context || {}));

  // Test API keys first
  console.log("🚀 [DEBUG] Environment check:");
  console.log("🚀 [DEBUG] - Config object exists:", !!config);
  console.log("🚀 [DEBUG] - GROQ key exists:", !!config.groqApiKey);
  console.log("🚀 [DEBUG] - Gemini key exists:", !!config.geminiApiKey);

  if (config.groqApiKey) {
    console.log(
      "🚀 [DEBUG] - GROQ key starts with:",
      config.groqApiKey.substring(0, 10) + "..."
    );
  }
  if (config.geminiApiKey) {
    console.log(
      "🚀 [DEBUG] - Gemini key starts with:",
      config.geminiApiKey.substring(0, 10) + "..."
    );
  }

  try {
    const workflow = createFarmerAssistantWorkflow();

    // Ensure safe initial state
    const initialState = {
      messages: Array.isArray(messages) ? messages : [],
      context: context && typeof context === "object" ? context : {},
      analysis: {},
      recommendations: [],
      currentStep: "analyze_context",
      finalResponse: "",
    };

    console.log(
      "🚀 [DEBUG] Initial state created with keys:",
      Object.keys(initialState)
    );

    const result = await workflow.invoke(initialState);

    console.log("✅ [DEBUG] Pipeline completed successfully");
    console.log("✅ [DEBUG] Final result keys:", Object.keys(result));

    return {
      replies: [
        {
          role: "assistant",
          content:
            result.finalResponse ||
            "I'm here to help with your farming questions!",
        },
      ],
      analysis: result.analysis || {},
      context: result.context || {},
    };
  } catch (error) {
    console.error("❌ [DEBUG] LangGraph pipeline error:", error.message);
    console.error("❌ [DEBUG] Full stack:", error.stack);

    // Enhanced fallback response generation
    const lastMessage =
      Array.isArray(messages) && messages.length > 0
        ? messages[messages.length - 1]?.content || ""
        : "";
    const safeContext = safeExtractContext(context);
    const fallbackResponse = generateFallbackResponse(lastMessage, safeContext);

    console.log("❌ [DEBUG] Using fallback response");

    return {
      replies: [
        {
          role: "assistant",
          content: fallbackResponse,
        },
      ],
      error: error.message,
      fallback: true,
    };
  }
}
