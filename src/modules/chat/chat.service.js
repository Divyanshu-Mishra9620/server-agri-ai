import config from "../../config/env.js";
import { executeFarmerAssistantPipeline } from "./langraph.pipeline.js";
import { Conversation, Analytics, UserPreferences } from "./chat.models.js";
import mongoose from 'mongoose';
import {
  CommunityChannel,
  CommunityMessage,
  ChannelMember
} from "../communityChat/communityChat.models.js";

/**
 * Enhanced conversational service with database persistence and user context
 */
export async function converseWithAssistant({ messages, context = {}, userId = null, conversationId = null }) {
  const startTime = Date.now();

  try {
    // Validate inputs
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages array is required and cannot be empty");
    }

    // Load user preferences if userId provided
    let userPreferences = null;
    if (userId) {
      try {
        userPreferences = await UserPreferences.findOne({ userId });
      } catch (prefError) {
        console.error("Error loading user preferences:", prefError);
        // Continue without preferences instead of failing
      }
    }

    // Enrich context with user preferences and historical data
    const enrichedContext = await enrichContextWithUserData(context, userId, conversationId);

    // Check if we have API keys
    if (!config.groqApiKey && !config.geminiApiKey) {
      console.warn("No AI API keys configured, using fallback response");
      return generateFallbackResponse(messages, enrichedContext, userPreferences);
    }

    // Execute the LangGraph pipeline
    const result = await executeFarmerAssistantPipeline(messages, enrichedContext);

    // Personalize response based on user preferences
    if (userPreferences) {
      result.replies = personalizeResponses(result.replies, userPreferences);
    }

    const responseTime = Date.now() - startTime;

    // Track analytics
    if (userId) {
      await trackConversationAnalytics(userId, messages, enrichedContext, result, responseTime, true);
    }

    console.log("Pipeline executed successfully:", {
      userId,
      messageCount: messages.length,
      hasContext: Object.keys(enrichedContext).length > 0,
      responseTime,
      responseLength: result.replies?.[0]?.content?.length || 0
    });

    return {
      ...result,
      responseTime,
      userId,
      conversationId,
      userPreferences: userPreferences ? userPreferences.toObject() : null // <-- ADD THIS LINE
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error("LangGraph pipeline failed:", error);

    // Track error analytics
    if (userId) {
      await trackConversationAnalytics(userId, messages, context, null, responseTime, false, error.message);
    }

    // Fallback to simple response
    return generateFallbackResponse(messages, context, null, error);
  }
}

/**
 * Enrich context with user historical data and preferences
 */
async function enrichContextWithUserData(context, userId, conversationId) {
  const enrichedContext = { ...context };

  if (!userId) return enrichedContext;

  try {
    // Get user preferences
    const userPrefs = await UserPreferences.findOne({ userId });
    if (userPrefs) {
      enrichedContext.userProfile = {
        farmingType: userPrefs.farmingType,
        primaryCrops: userPrefs.primaryCrops,
        location: userPrefs.location,
        experienceLevel: userPrefs.experienceLevel,
        farmSize: userPrefs.farmSize,
        language: userPrefs.language
      };
    }

    // Get recent conversation history for context
    const recentConversations = await Conversation.find({ userId })
      .sort({ lastActivity: -1 })
      .limit(3)
      .select('context messages');

    if (recentConversations.length > 0) {
      // Extract common topics and context from recent conversations
      const recentTopics = extractTopicsFromConversations(recentConversations);
      const commonContext = mergeCommonContext(recentConversations);

      enrichedContext.conversationHistory = {
        recentTopics,
        commonContext,
        conversationCount: recentConversations.length
      };
    }

    // Get user's seasonal context (what crops they typically grow in current season)
    const currentMonth = new Date().getMonth() + 1;
    const seasonalContext = getSeasonalContext(currentMonth, enrichedContext.userProfile?.location?.state);
    if (seasonalContext) {
      enrichedContext.seasonal = seasonalContext;
    }

  } catch (error) {
    console.error("Error enriching context:", error);
    // Continue without enrichment if there's an error
  }

  return enrichedContext;
}

/**
 * Personalize responses based on user preferences
 */
function personalizeResponses(replies, userPreferences) {
  if (!replies || !userPreferences) return replies;

  return replies.map(reply => {
    let content = reply.content;

    // Adjust language complexity based on experience level
    if (userPreferences.experienceLevel === 'beginner') {
      content = simplifyLanguageForBeginners(content);
    }

    // Add farm size specific advice
    if (userPreferences.farmSize) {
      content = adjustForFarmSize(content, userPreferences.farmSize);
    }

    // Add location specific context
    if (userPreferences.location?.state) {
      content = addLocationSpecificAdvice(content, userPreferences.location);
    }

    return {
      ...reply,
      content
    };
  });
}

/**
 * Generate contextual fallback response
 */
function generateFallbackResponse(messages, context, userPreferences = null, error = null) {
  const lastMessage = messages[messages.length - 1];
  const query = lastMessage?.content?.toLowerCase() || "";

  let response = "🌾 I'm your farming assistant! ";

  // Add user-specific greeting if we have preferences
  if (userPreferences) {
    if (userPreferences.primaryCrops?.length > 0) {
      response += `I see you grow ${userPreferences.primaryCrops.join(', ')}. `;
    }

    if (userPreferences.location?.state) {
      response += `For farming in ${userPreferences.location.state}, `;
    }
  }

  // Add context information if available
  if (context.crop) {
    response += `I see you're working with ${context.crop}. `;
  }

  if (context.coords) {
    response += `For your location in ${context.coords.formatted}, `;
  }

  if (context.weather) {
    const temp = Math.round(context.weather.temp);
    response += `with current temperature ${temp}°C and ${context.weather.humidity}% humidity, `;
  }

  // Seasonal advice
  const currentMonth = new Date().getMonth() + 1;
  const seasonalAdvice = getSeasonalAdvice(currentMonth, context.userProfile?.location?.state);
  if (seasonalAdvice) {
    response += seasonalAdvice + " ";
  }

  // Query-specific responses with user context
  if (query.includes('pest') || query.includes('insect') || query.includes('bug')) {
    response += "for pest management, I recommend integrated pest management (IPM): ";
    response += "1) Regular crop inspection 2) Use neem oil spray 3) Introduce beneficial insects 4) Maintain crop rotation. ";

    if (userPreferences?.farmingType === 'organic') {
      response += "Since you prefer organic farming, focus on neem-based solutions and companion planting.";
    }
  } else if (query.includes('market') || query.includes('price')) {
    response += "for current market information: ";
    response += "1) Check local mandi prices 2) Consider direct selling 3) Join farmer producer organizations 4) Time your harvest strategically.";

    if (context.market) {
      response += ` Current top crops in your area: ${context.market.top?.join(', ') || 'wheat, rice, pulses'}.`;
    }
  } else {
    response += "I can help with crop selection, pest management, disease control, fertilization, irrigation, and marketing. ";
    response += "What specific farming challenge are you facing?";
  }

  // Add weather-based advice if available
  if (context.weather) {
    const weatherAdvice = getWeatherBasedAdvice(context.weather);
    if (weatherAdvice) {
      response += "\n\n" + weatherAdvice;
    }
  }

  response += "\n\n💡 Feel free to ask more specific questions about your farming needs!";

  // Add error context if there was a system error
  if (error && process.env.NODE_ENV === 'development') {
    response += `\n\n🔧 (System note: ${error.message})`;
  }

  return {
    replies: [{
      role: "assistant",
      content: response
    }],
    fallback: true,
    userPreferences: userPreferences ? userPreferences.toObject() : null
  };
}

/**
 * Track conversation analytics
 */
async function trackConversationAnalytics(userId, messages, context, result, responseTime, success, error = null) {
  try {
    const analytics = new Analytics({
      userId,
      eventType: 'chat_message',
      eventData: {
        messageCount: messages.length,
        hasContext: Object.keys(context).length > 0,
        contextTypes: Object.keys(context),
        responseTime,
        success,
        error,
        hasUserProfile: !!context.userProfile,
        hasConversationHistory: !!context.conversationHistory
      },
      responseTime,
      success,
      errorMessage: error
    });

    await analytics.save();
  } catch (error) {
    console.error("Failed to track conversation analytics:", error);
  }
}

// Helper functions
function extractTopicsFromConversations(conversations) {
  const topics = new Set();

  conversations.forEach(conv => {
    conv.messages.forEach(msg => {
      if (msg.role === 'user') {
        const content = msg?.content?.toLowerCase();
        if (content.includes('pest')) topics.add('pest_management');
        if (content.includes('crop')) topics.add('crop_selection');
        if (content.includes('soil')) topics.add('soil_health');
        if (content.includes('weather')) topics.add('weather');
        if (content.includes('market')) topics.add('market_prices');
      }
    });
  });

  return Array.from(topics);
}

function mergeCommonContext(conversations) {
  const commonContext = {};

  conversations.forEach(conv => {
    if (conv.context) {
      Object.keys(conv.context).forEach(key => {
        if (!commonContext[key] && conv.context[key]) {
          commonContext[key] = conv.context[key];
        }
      });
    }
  });

  return commonContext;
}

function getSeasonalContext(month, state) {
  const seasons = {
    kharif: [6, 7, 8, 9], // June-September
    rabi: [10, 11, 12, 1, 2, 3], // October-March
    summer: [4, 5] // April-May
  };

  let currentSeason = 'summer';
  if (seasons.kharif.includes(month)) currentSeason = 'kharif';
  if (seasons.rabi.includes(month)) currentSeason = 'rabi';

  return {
    season: currentSeason,
    month,
    recommendedCrops: getSeasonalCrops(currentSeason, state)
  };
}

function getSeasonalCrops(season, state) {
  const crops = {
    kharif: ['Rice', 'Cotton', 'Sugarcane', 'Maize', 'Sorghum'],
    rabi: ['Wheat', 'Barley', 'Peas', 'Gram', 'Mustard'],
    summer: ['Fodder crops', 'Vegetables', 'Fruits']
  };

  return crops[season] || [];
}

function getSeasonalAdvice(month, state) {
  const currentSeason = getSeasonalContext(month, state);

  const advice = {
    kharif: "it's kharif season - good time for rice, cotton, and maize cultivation",
    rabi: "it's rabi season - ideal for wheat, gram, and mustard crops",
    summer: "it's summer season - focus on irrigation management and heat-resistant varieties"
  };

  return advice[currentSeason.season];
}

function getWeatherBasedAdvice(weather) {
  let advice = [];

  if (weather.temp > 35) {
    advice.push("🌡️ High temperature alert: Increase watering frequency and provide shade protection");
  }

  if (weather.humidity > 80) {
    advice.push("💧 High humidity: Watch for fungal diseases and ensure good ventilation");
  }

  if (weather.rain > 10) {
    advice.push("☔ Heavy rain expected: Ensure proper drainage and avoid field operations");
  }

  return advice.length > 0 ? advice.join(". ") : null;
}

function simplifyLanguageForBeginners(content) {
  // Replace technical terms with simpler explanations
  return content
    .replace(/integrated pest management \(IPM\)/gi, 'natural pest control methods')
    .replace(/vermicompost/gi, 'worm compost')
    .replace(/foliar application/gi, 'spraying on leaves')
    .replace(/nitrogen deficiency/gi, 'lack of nutrients for green growth')
    .replace(/soil pH/gi, 'soil acidity level')
    .replace(/crop rotation/gi, 'changing crops each season');
}

function adjustForFarmSize(content, farmSize) {
  if (farmSize.value < 2 && farmSize.unit === 'acres') {
    // Small farm advice
    content += "\n\n🏡 For small farms like yours, focus on high-value crops and intensive farming methods.";
  } else if (farmSize.value > 10) {
    // Large farm advice  
    content += "\n\n🚜 For larger farms, consider mechanization and bulk purchasing of inputs for cost efficiency.";
  }

  return content;
}

function addLocationSpecificAdvice(content, location) {
  const stateAdvice = {
    'Punjab': 'Consider water-efficient crops due to declining groundwater levels.',
    'Maharashtra': 'Dryland farming techniques are beneficial in many regions.',
    'Tamil Nadu': 'Rice cultivation and water management are key focus areas.',
    'Karnataka': 'Mixed farming with millets is gaining popularity.',
    'Uttar Pradesh': 'Wheat-rice rotation is common, but diversification is recommended.',
    'Rajasthan': 'Desert farming and water conservation techniques are essential.',
    'West Bengal': 'Rice cultivation and fish farming integration works well.',
    'Gujarat': 'Cotton and groundnut are major crops, consider soil health management.'
  };

  if (stateAdvice[location.state]) {
    content += `\n\n📍 Specific to ${location.state}: ${stateAdvice[location.state]}`;
  }

  return content;
}

/**
 * Get conversation history for a user
 */
export async function getConversationHistory(userId, limit = 10) {
  try {
    const conversations = await Conversation.find({ userId })
      .sort({ lastActivity: -1 })
      .limit(limit)
      .select('sessionId context messages createdAt lastActivity')
      .lean();

    return conversations;
  } catch (error) {
    console.error("Error fetching conversation history:", error);
    return [];
  }
}

/**
 * Save or update conversation
 */
export async function saveConversation(userId, sessionId, messages, context = {}) {
  try {
    let conversation = await Conversation.findOne({ userId, sessionId });

    if (!conversation) {
      conversation = new Conversation({
        userId,
        sessionId,
        messages: [],
        context
      });
    }

    // Add new messages
    const existingMessageCount = conversation.messages.length;
    const newMessages = messages.slice(existingMessageCount);

    if (newMessages.length > 0) {
      conversation.messages.push(...newMessages);
      conversation.context = { ...conversation.context, ...context };
      conversation.lastActivity = new Date();

      await conversation.save();
    }

    return conversation;
  } catch (error) {
    console.error("Error saving conversation:", error);
    throw error;
  }
}

/**
 * Delete old conversations (cleanup utility)
 */
export async function cleanupOldConversations(daysOld = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await Conversation.deleteMany({
      lastActivity: { $lt: cutoffDate }
    });

    console.log(`Cleaned up ${result.deletedCount} old conversations`);
    return result.deletedCount;
  } catch (error) {
    console.error("Error cleaning up conversations:", error);
    throw error;
  }
}

/**
 * Get user analytics
 */
export async function getUserAnalytics(userId, days = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await Analytics.aggregate([
      {
        $match: {
          userId: new mongoose.Types.ObjectId(userId),
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$eventType',
          count: { $sum: 1 },
          avgResponseTime: { $avg: '$responseTime' },
          successRate: {
            $avg: { $cond: ['$success', 1, 0] }
          }
        }
      }
    ]);

    return analytics;
  } catch (error) {
    console.error("Error fetching user analytics:", error);
    return [];
  }
}


// Community Channel


export const isChannelMember = async (channelId, userId) => {
  const membership = await ChannelMember.findOne({
    channelId,
    userId,
    isActive: true
  });
  return !!membership;
};

export const sendCommunityMessage = async (messageData) => {
  const message = new CommunityMessage(messageData);
  await message.save();

  // Update channel stats
  await Promise.all([
    CommunityChannel.findByIdAndUpdate(
      messageData.channelId,
      {
        $inc: { messageCount: 1 },
        lastActivity: new Date()
      }
    ),
    ChannelMember.findOneAndUpdate(
      { channelId: messageData.channelId, userId: messageData.userId },
      {
        $inc: { messageCount: 1 },
        lastSeen: new Date()
      }
    )
  ]);

  return message;
};

export const toggleMessageReaction = async (messageId, userId, emoji) => {
  const message = await CommunityMessage.findById(messageId);
  if (!message) {
    throw new Error('Message not found');
  }

  // Check if user already reacted with this emoji
  const existingReaction = message.reactions.find(
    r => r.userId.toString() === userId.toString() && r.emoji === emoji
  );

  let action;
  if (existingReaction) {
    // Remove reaction
    message.reactions = message.reactions.filter(
      r => !(r.userId.toString() === userId.toString() && r.emoji === emoji)
    );
    action = 'remove';
  } else {
    // Add reaction
    message.reactions.push({ userId, emoji });
    action = 'add';
  }

  await message.save();

  // Calculate reaction counts
  const reactionCounts = {};
  message.reactions.forEach(reaction => {
    reactionCounts[reaction.emoji] = (reactionCounts[reaction.emoji] || 0) + 1;
  });

  return {
    channelId: message.channelId,
    action,
    reactionCounts
  };
};

export const deleteCommunityMessage = async (messageId, userId) => {
  const message = await CommunityMessage.findById(messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  // Check if user is author or moderator
  const isAuthor = message.userId.toString() === userId.toString();
  if (!isAuthor) {
    // Check if user can moderate (implement based on your needs)
    const canModerate = await canModerateChannel(message.channelId, userId);
    if (!canModerate) {
      throw new Error('Unauthorized');
    }
  }

  // Soft delete
  message.isDeleted = true;
  await message.save();

  return { channelId: message.channelId };
};

export const editCommunityMessage = async (messageId, userId, newContent) => {
  const message = await CommunityMessage.findById(messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  // Check if user is author
  if (message.userId.toString() !== userId.toString()) {
    throw new Error('Unauthorized');
  }

  // Check if message is not too old (e.g., 15 minutes)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  if (message.createdAt < fifteenMinutesAgo) {
    throw new Error('Message too old to edit');
  }

  message.content = newContent.trim();
  message.isEdited = true;
  message.editedAt = new Date();
  await message.save();

  return message;
};

// const canModerateChannel = async (channelId, userId) => {
//   const membership = await ChannelMember.findOne({
//     channelId,
//     userId,
//     isActive: true,
//     role: { $in: ['moderator', 'admin'] }
//   });

//   const channel = await CommunityChannel.findById(channelId);
//   const isCreator = channel && channel.createdBy.toString() === userId.toString();

//   return !!membership || isCreator;
// };

export const getChannels = async (options) => {
    const {
        page = 1,
        limit = 20,
        category,
        search,
        sortBy = 'lastActivity',
        order = 'desc',
        userId
    } = options;

    const skip = (page - 1) * limit;
    const sortOrder = order === 'desc' ? -1 : 1;

    // Build filter object
    const filter = { isActive: true };

    if (category) {
        filter.category = category;
    }

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
        ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder;

    const [channels, total] = await Promise.all([
        CommunityChannel.aggregate([
            { $match: filter },
            {
                $lookup: {
                    from: 'channelmembers',
                    let: { channelId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$channelId', '$$channelId'] },
                                        { $eq: ['$userId', userId] },
                                        { $eq: ['$isActive', true] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'userMembership'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'createdBy',
                    foreignField: '_id',
                    select: 'name email',
                    as: 'creator'
                }
            },
            {
                $addFields: {
                    isMember: { $gt: [{ $size: '$userMembership' }, 0] },
                    creator: { $arrayElemAt: ['$creator', 0] }
                }
            },
            {
                $project: {
                    userMembership: 0
                }
            },
            { $sort: sort },
            { $skip: skip },
            { $limit: limit }
        ]),
        CommunityChannel.countDocuments(filter)
    ]);

    return {
        channels,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1
        }
    };
};

// Get channel by ID with member status
export const getChannelById = async (channelId, userId) => {
    const channel = await CommunityChannel.aggregate([
        {
            $match: {
                _id: mongoose.Types.ObjectId(channelId),
                isActive: true
            }
        },
        {
            $lookup: {
                from: 'channelmembers',
                let: { channelId: '$_id' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ['$channelId', '$$channelId'] },
                                    { $eq: ['$userId', userId] },
                                    { $eq: ['$isActive', true] }
                                ]
                            }
                        }
                    }
                ],
                as: 'userMembership'
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'createdBy',
                foreignField: '_id',
                select: 'name email',
                as: 'creator'
            }
        },
        {
            $addFields: {
                isMember: { $gt: [{ $size: '$userMembership' }, 0] },
                userRole: {
                    $ifNull: [
                        { $arrayElemAt: ['$userMembership.role', 0] },
                        null
                    ]
                },
                creator: { $arrayElemAt: ['$creator', 0] }
            }
        },
        {
            $project: {
                userMembership: 0
            }
        }
    ]);

    return channel[0] || null;
};

// Create new channel
export const createChannel = async (channelData) => {
    const channel = new CommunityChannel(channelData);
    await channel.save();

    // Automatically add creator as admin
    await joinChannel(channel._id, channelData.createdBy, 'admin');

    return channel;
};

// Join channel
export const joinChannel = async (channelId, userId, role = 'member') => {
    // Check if channel exists
    const channel = await CommunityChannel.findById(channelId);
    if (!channel) {
        throw new Error('Channel not found');
    }

    // Check if already a member
    const existingMember = await ChannelMember.findOne({
        channelId,
        userId,
        isActive: true
    });

    if (existingMember) {
        throw new Error('Already a member');
    }

    // Create membership
    const membership = new ChannelMember({
        channelId,
        userId,
        role
    });

    await membership.save();

    // Update channel member count
    await CommunityChannel.findByIdAndUpdate(
        channelId,
        { $inc: { memberCount: 1 } }
    );

    return membership.populate('userId', 'name email');
};

// Leave channel
export const leaveChannel = async (channelId, userId) => {
    const membership = await ChannelMember.findOneAndUpdate(
        { channelId, userId, isActive: true },
        { isActive: false },
        { new: true }
    );

    if (membership) {
        // Update channel member count
        await CommunityChannel.findByIdAndUpdate(
            channelId,
            { $inc: { memberCount: -1 } }
        );
    }

    return membership;
};

// Check if user is a member of channel
// export const isChannelMember = async (channelId, userId) => {
//     const membership = await ChannelMember.findOne({
//         channelId,
//         userId,
//         isActive: true
//     });

//     return !!membership;
// };

// Get channel messages with pagination
export const getChannelMessages = async (options) => {
    const {
        channelId,
        page = 1,
        limit = 50,
        before,
        after
    } = options;

    const skip = (page - 1) * limit;

    // Build filter
    const filter = {
        channelId,
        isDeleted: false
    };

    if (before) {
        filter.createdAt = { $lt: new Date(before) };
    }

    if (after) {
        filter.createdAt = { $gt: new Date(after) };
    }

    const [messages, total] = await Promise.all([
        CommunityMessage.find(filter)
            .populate('userId', 'name email')
            .populate('mentions', 'name email')
            .populate('replies.userId', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        CommunityMessage.countDocuments(filter)
    ]);

    // Reverse to show oldest first
    messages.reverse();

    return {
        messages,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1
        }
    };
};

// Send message to channel
export const sendMessage = async (messageData) => {
    const message = new CommunityMessage(messageData);
    await message.save();

    // Update channel stats
    await Promise.all([
        CommunityChannel.findByIdAndUpdate(
            messageData.channelId,
            {
                $inc: { messageCount: 1 },
                lastActivity: new Date()
            }
        ),
        ChannelMember.findOneAndUpdate(
            { channelId: messageData.channelId, userId: messageData.userId },
            {
                $inc: { messageCount: 1 },
                lastSeen: new Date()
            }
        )
    ]);

    return message.populate([
        { path: 'userId', select: 'name email' },
        { path: 'mentions', select: 'name email' }
    ]);
};

// Add reaction to message
export const addReaction = async (messageId, userId, emoji) => {
    const message = await CommunityMessage.findById(messageId);
    if (!message) {
        throw new Error('Message not found');
    }

    // Remove existing reaction from same user for same emoji
    message.reactions = message.reactions.filter(
        r => !(r.userId.toString() === userId.toString() && r.emoji === emoji)
    );

    // Add new reaction
    message.reactions.push({ userId, emoji });
    await message.save();

    return message;
};

// Remove reaction from message
export const removeReaction = async (messageId, userId, emoji) => {
    const message = await CommunityMessage.findById(messageId);
    if (!message) {
        throw new Error('Message not found');
    }

    message.reactions = message.reactions.filter(
        r => !(r.userId.toString() === userId.toString() && r.emoji === emoji)
    );

    await message.save();
    return message;
};

// Get user's joined channels
export const getUserChannels = async (userId) => {
    const channels = await ChannelMember.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                isActive: true
            }
        },
        {
            $lookup: {
                from: 'communitychannels',
                localField: 'channelId',
                foreignField: '_id',
                as: 'channel'
            }
        },
        {
            $unwind: '$channel'
        },
        {
            $match: {
                'channel.isActive': true
            }
        },
    //    {
    //   $project: {
    //     _id: 0,
    //     channelId: '$channel._id',
    //     name: '$channel.name',
    //     description: '$channel.description',
    //     category: '$channel.category',
    //     icon: '$channel.icon',
    //     memberCount: '$channel.memberCount',
    //     messageCount: '$channel.messageCount',
    //     lastActivity: '$channel.lastActivity',
    //     role: '$role',
    //     joinedAt: '$joinedAt',
    //     lastSeen: '$lastSeen',
    //     unreadCount: 0 // TODO: Calculate actual unread count
    //   }
    {
            $project: {
                channelId: '$channel._id',
                name: '$channel.name',
                description: '$channel.description',
                category: '$channel.category',
                icon: '$channel.icon',
                memberCount: '$channel.memberCount',
                messageCount: '$channel.messageCount',
                lastActivity: '$channel.lastActivity',
                role: '$role',
                joinedAt: '$joinedAt',
                lastSeen: '$lastSeen',
                unreadCount: { $literal: 0 }   // constant field ✅
            }
        },
        {
            $sort: { lastActivity: -1 }
        }
    ]);

    return channels;
};

// Get channel members with pagination
export const getChannelMembers = async (options) => {
    const {
        channelId,
        page = 1,
        limit = 50,
        search,
        role
    } = options;

    const skip = (page - 1) * limit;

    // Build filter
    const filter = {
        channelId,
        isActive: true
    };

    if (role) {
        filter.role = role;
    }

    const pipeline = [
        { $match: filter },
        {
            $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'user'
            }
        },
        {
            $unwind: '$user'
        }
    ];

    // Add search filter if provided
    if (search) {
        pipeline.push({
            $match: {
                $or: [
                    { 'user.name': { $regex: search, $options: 'i' } },
                    { 'user.email': { $regex: search, $options: 'i' } }
                ]
            }
        });
    }

    // Add pagination
    pipeline.push(
        { $sort: { joinedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
            $project: {
                _id: 1,
                role: 1,
                joinedAt: 1,
                lastSeen: 1,
                messageCount: 1,
                user: {
                    _id: '$user._id',
                    name: '$user.name',
                    email: '$user.email'
                }
            }
        }
    );

    const [members, total] = await Promise.all([
        ChannelMember.aggregate(pipeline),
        ChannelMember.countDocuments(filter)
    ]);

    return {
        members,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1
        }
    };
};

// Check if user can moderate channel
export const canModerateChannel = async (channelId, userId) => {
    const membership = await ChannelMember.findOne({
        channelId,
        userId,
        isActive: true,
        role: { $in: ['moderator', 'admin'] }
    });

    const channel = await CommunityChannel.findById(channelId);
    const isCreator = channel && channel.createdBy.toString() === userId.toString();

    return !!membership || isCreator;
};

// Update channel
export const updateChannel = async (channelId, updateData) => {
    const allowedUpdates = ['name', 'description', 'icon'];
    const filteredData = {};

    allowedUpdates.forEach(field => {
        if (updateData[field] !== undefined) {
            filteredData[field] = updateData[field];
        }
    });

    const channel = await CommunityChannel.findByIdAndUpdate(
        channelId,
        filteredData,
        { new: true }
    ).populate('createdBy', 'name email');

    return channel;
};

// Delete message
export const deleteMessage = async (messageId, userId) => {
    const message = await CommunityMessage.findById(messageId);

    if (!message) {
        throw new Error('Message not found');
    }

    // Check if user is author or can moderate
    const isAuthor = message.userId.toString() === userId.toString();
    const canModerate = await canModerateChannel(message.channelId, userId);

    if (!isAuthor && !canModerate) {
        throw new Error('Unauthorized');
    }

    // Soft delete
    message.isDeleted = true;
    await message.save();

    // Update channel message count
    await CommunityChannel.findByIdAndUpdate(
        message.channelId,
        { $inc: { messageCount: -1 } }
    );

    return { channelId: message.channelId };
};

// Get channel analytics (for moderators/admins)
export const getChannelAnalytics = async (channelId, userId, days = 7) => {
    // Check if user can access analytics
    const canModerate = await canModerateChannel(channelId, userId);
    if (!canModerate) {
        throw new Error('Unauthorized');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await CommunityAnalytics.aggregate([
        {
            $match: {
                channelId: mongoose.Types.ObjectId(channelId),
                date: { $gte: startDate }
            }
        },
        {
            $sort: { date: 1 }
        }
    ]);

    // Get overall stats
    const overallStats = await CommunityMessage.aggregate([
        {
            $match: {
                channelId: mongoose.Types.ObjectId(channelId),
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: null,
                totalMessages: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' },
                avgReactions: { $avg: { $size: '$reactions' } }
            }
        },
        {
            $project: {
                totalMessages: 1,
                uniqueUsers: { $size: '$uniqueUsers' },
                avgReactions: { $round: ['$avgReactions', 2] }
            }
        }
    ]);

    return {
        dailyStats: analytics,
        overallStats: overallStats[0] || {
            totalMessages: 0,
            uniqueUsers: 0,
            avgReactions: 0
        }
    };
};

// Search messages across channels
export const searchMessages = async (query, userId, options = {}) => {
    const {
        channelId,
        page = 1,
        limit = 20
    } = options;

    const skip = (page - 1) * limit;

    // Get user's channels if no specific channel provided
    let channelFilter = {};
    if (channelId) {
        // Check if user is member of specific channel
        const isMember = await isChannelMember(channelId, userId);
        if (!isMember) {
            throw new Error('Access denied');
        }
        channelFilter.channelId = mongoose.Types.ObjectId(channelId);
    } else {
        // Get all channels user is member of
        const userChannels = await ChannelMember.find({
            userId,
            isActive: true
        }).select('channelId');

        channelFilter.channelId = {
            $in: userChannels.map(m => m.channelId)
        };
    }

    const searchFilter = {
        ...channelFilter,
        isDeleted: false,
        $text: { $search: query }
    };

    const [messages, total] = await Promise.all([
        CommunityMessage.find(searchFilter)
            .populate('userId', 'name email')
            .populate('channelId', 'name icon')
            .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
            .skip(skip)
            .limit(limit),
        CommunityMessage.countDocuments(searchFilter)
    ]);

    return {
        messages,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            totalItems: total,
            hasNextPage: page < Math.ceil(total / limit),
            hasPrevPage: page > 1
        }
    };
};

// Pin/Unpin message
export const toggleMessagePin = async (messageId, userId) => {
    const message = await CommunityMessage.findById(messageId);

    if (!message) {
        throw new Error('Message not found');
    }

    // Check if user can moderate
    const canModerate = await canModerateChannel(message.channelId, userId);
    if (!canModerate) {
        throw new Error('Unauthorized');
    }

    message.isPinned = !message.isPinned;
    await message.save();

    return message;
};

// Get pinned messages for a channel
export const getPinnedMessages = async (channelId, userId) => {
    // Check if user is member
    const isMember = await isChannelMember(channelId, userId);
    if (!isMember) {
        throw new Error('Access denied');
    }

    const pinnedMessages = await CommunityMessage.find({
        channelId,
        isPinned: true,
        isDeleted: false
    })
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .limit(10);

    return pinnedMessages;
};