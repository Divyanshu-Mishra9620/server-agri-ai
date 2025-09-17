// import { Server } from "socket.io";
// import * as chatService from "./chat.service.js";
// import { Conversation, Analytics } from "./chat.models.js";
// import jwt from 'jsonwebtoken';
// import config from "../../config/env.js";

// let io;

// const authenticateSocket = async (socket, next) => {
//   try {
//     const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

//     if (!token) {
//       return next(new Error('Authentication token required'));
//     }

//     const decoded = jwt.verify(token, config.jwtSecret);
//     socket.userId = decoded.id || decoded.userId;
//     socket.userInfo = decoded;

//     console.log(`User ${socket.userId} authenticated via socket`);
//     next();
//   } catch (error) {
//     console.error('Socket authentication error:', error);
//     next(new Error('Invalid authentication token'));
//   }
// };

// // ADDED: Context validation and sanitization function
// function validateAndSanitizeContext(context) {
//   if (!context || typeof context !== 'object') {
//     return {};
//   }

//   const sanitized = {};

//   // Sanitize crop
//   if (context.crop && typeof context.crop === 'string') {
//     sanitized.crop = context.crop.trim();
//   }

//   // Sanitize location - ensure proper nested structure
//   if (context.location && typeof context.location === 'object') {
//     const location = {};

//     if (context.location.address && typeof context.location.address === 'string') {
//       location.address = context.location.address.trim();
//     }

//     if (context.location.coordinates && typeof context.location.coordinates === 'object') {
//       const coords = context.location.coordinates;
//       if (typeof coords.lat === 'number' && typeof coords.lon === 'number') {
//         location.coordinates = {
//           lat: coords.lat,
//           lon: coords.lon
//         };
//       }
//     }

//     if (context.location.state && typeof context.location.state === 'string') {
//       location.state = context.location.state.trim();
//     }

//     if (context.location.district && typeof context.location.district === 'string') {
//       location.district = context.location.district.trim();
//     }

//     // Only add location if it has at least one valid field
//     if (Object.keys(location).length > 0) {
//       sanitized.location = location;
//     }
//   }

//   // Sanitize weather
//   if (context.weather && typeof context.weather === 'object') {
//     const weather = {};

//     if (typeof context.weather.temp === 'number') {
//       weather.temp = context.weather.temp;
//     }

//     if (typeof context.weather.humidity === 'number') {
//       weather.humidity = context.weather.humidity;
//     }

//     if (typeof context.weather.rain === 'number') {
//       weather.rain = context.weather.rain;
//     }

//     if (context.weather.description && typeof context.weather.description === 'string') {
//       weather.description = context.weather.description.trim();
//     }

//     if (Object.keys(weather).length > 0) {
//       sanitized.weather = weather;
//     }
//   }

//   // Sanitize soilAnalysis
//   if (context.soilAnalysis && typeof context.soilAnalysis === 'object') {
//     const soilAnalysis = {};

//     if (context.soilAnalysis.summary && typeof context.soilAnalysis.summary === 'string') {
//       soilAnalysis.summary = context.soilAnalysis.summary.trim();
//     }

//     if (Array.isArray(context.soilAnalysis.recommendations)) {
//       soilAnalysis.recommendations = context.soilAnalysis.recommendations
//         .filter(rec => typeof rec === 'string' && rec.trim())
//         .map(rec => rec.trim());
//     }

//     if (typeof context.soilAnalysis.confidence === 'number') {
//       soilAnalysis.confidence = context.soilAnalysis.confidence;
//     }

//     if (Object.keys(soilAnalysis).length > 0) {
//       sanitized.soilAnalysis = soilAnalysis;
//     }
//   }

//   // Sanitize marketData
//   if (context.marketData && typeof context.marketData === 'object') {
//     const marketData = {};

//     if (typeof context.marketData.currentPrice === 'number') {
//       marketData.currentPrice = context.marketData.currentPrice;
//     }

//     if (context.marketData.trend && typeof context.marketData.trend === 'string') {
//       marketData.trend = context.marketData.trend.trim();
//     }

//     if (typeof context.marketData.changePercent === 'number') {
//       marketData.changePercent = context.marketData.changePercent;
//     }

//     if (context.marketData.forecast && typeof context.marketData.forecast === 'string') {
//       marketData.forecast = context.marketData.forecast.trim();
//     }

//     if (Object.keys(marketData).length > 0) {
//       sanitized.marketData = marketData;
//     }
//   }

//   return sanitized;
// }

// export function initSocket(server) {
//   io = new Server(server, {
//     cors: {
//       origin: config.frontendUrl || "*",
//       methods: ["GET", "POST"],
//       credentials: true
//     },
//     transports: ['websocket', 'polling']
//   });

//   // Apply authentication middleware
//   io.use(authenticateSocket);

//   io.on("connection", (socket) => {
//     console.log(`Socket connected: ${socket.id} (User: ${socket.userId})`);

//     // Join user to their personal room
//     socket.join(`user:${socket.userId}`);

//     // Track connection analytics
//     trackEvent(socket.userId, 'chat_message', {
//       eventType: 'socket_connection',
//       socketId: socket.id,
//       userAgent: socket.handshake.headers['user-agent']
//     });

//     // Handle joining specific conversation room
//     socket.on("join_conversation", async ({ conversationId }) => {
//       try {
//         // Verify user owns this conversation
//         const conversation = await Conversation.findOne({
//           _id: conversationId,
//           userId: socket.userId
//         });

//         if (conversation) {
//           socket.join(`conversation:${conversationId}`);
//           socket.conversationId = conversationId;

//           socket.emit("conversation_joined", {
//             conversationId,
//             messageCount: conversation.messages.length
//           });

//           console.log(`User ${socket.userId} joined conversation ${conversationId}`);
//         } else {
//           socket.emit("error", { message: "Conversation not found or access denied" });
//         }
//       } catch (error) {
//         console.error("Error joining conversation:", error);
//         socket.emit("error", { message: "Failed to join conversation" });
//       }
//     });

//     // FIXED: Handle chat messages with proper context validation
//     socket.on("chat_message", async ({ messages, context, conversationId, sessionId }) => {
//       const startTime = Date.now();

//       try {
//         console.log(`Received chat message from user ${socket.userId}`);

//         // Validate and sanitize context
//         const sanitizedContext = validateAndSanitizeContext(context);
//         console.log('Original context:', context);
//         console.log('Sanitized context:', sanitizedContext);

//         // Emit typing indicator to all clients in the room
//         socket.emit("assistant_typing", { isTyping: true });

//         // Process the message with AI using sanitized context
//         const result = await chatService.converseWithAssistant({
//           messages,
//           context: sanitizedContext,
//           userId: socket.userId
//         });
//         const responseTime = Date.now() - startTime;

//         // Save conversation to database
//         let conversation;
//         if (conversationId) {
//           conversation = await Conversation.findById(conversationId);
//         }

//         if (!conversation) {
//           conversation = new Conversation({
//             userId: socket.userId,
//             sessionId: sessionId || generateSessionId(),
//             messages: [],
//             context: sanitizedContext
//           });
//         }

//         // Add new messages to conversation
//         const existingMessageCount = conversation.messages.length;
//         const newMessages = messages.slice(existingMessageCount);
//         if (result.replies) {
//           newMessages.push(...result.replies);
//         }

//         conversation.messages.push(...newMessages);
//         conversation.context = { ...conversation.context, ...sanitizedContext };
//         conversation.lastActivity = new Date();

//         await conversation.save();

//         // Emit response
//         socket.emit("assistant_typing", { isTyping: false });
//         socket.emit("chat_response", {
//           replies: result.replies || [],
//           conversationId: conversation._id,
//           success: true
//         });

//         // Track analytics
//         trackEvent(socket.userId, 'chat_message', {
//           messageCount: messages.length,
//           responseTime,
//           hasContext: Object.keys(sanitizedContext).length > 0,
//           success: true
//         });

//         console.log(`Chat response sent to user ${socket.userId} (${responseTime}ms)`);

//       } catch (error) {
//         console.error("Chat message error:", error);
//         const responseTime = Date.now() - startTime;

//         socket.emit("assistant_typing", { isTyping: false });
//         socket.emit("chat_error", {
//           message: "I'm sorry, I'm having trouble responding right now. Please try again.",
//           error: error.message
//         });

//         // Track error analytics
//         trackEvent(socket.userId, 'chat_message', {
//           responseTime,
//           success: false,
//           error: error.message
//         });
//       }
//     });

//     // Handle real-time soil analysis
//     socket.on("analyze_soil", async ({ imageData, crop, conversationId }) => {
//       try {
//         socket.emit("analysis_status", { status: "processing", message: "Analyzing your soil/plant image..." });

//         // This would integrate with your existing soil analysis logic
//         // For now, emit a placeholder response
//         setTimeout(() => {
//           const mockResult = {
//             summary: "The soil appears healthy with good organic content. Consider adding compost for better nutrient retention.",
//             recommendations: [
//               "Add organic compost",
//               "Test pH levels",
//               "Ensure proper drainage"
//             ],
//             confidence: 0.85
//           };

//           socket.emit("analysis_complete", {
//             result: mockResult,
//             conversationId
//           });
//         }, 3000);

//         // Community Chat

//  socket.on("join_community_channel", async ({ channelId }) => {
//       try {
//         // Verify user is a member of this channel
//         const isMember = await chatService.isChannelMember(channelId, socket.userId);

//         if (isMember) {
//           socket.join(`channel:${channelId}`);
//           socket.currentChannelId = channelId;

//           socket.emit("channel_joined", {
//             channelId,
//             message: "Successfully joined channel"
//           });

//           // Notify other channel members
//           socket.to(`channel:${channelId}`).emit("user_joined_channel", {
//             userId: socket.userId,
//             userInfo: socket.userInfo,
//             channelId
//           });

//           console.log(`User ${socket.userId} joined channel ${channelId}`);
//         } else {
//           socket.emit("error", { message: "Access denied - not a channel member" });
//         }
//       } catch (error) {
//         console.error("Error joining channel:", error);
//         socket.emit("error", { message: "Failed to join channel" });
//       }
//     });

//     // Handle leaving community channel
//     socket.on("leave_community_channel", ({ channelId }) => {
//       try {
//         socket.leave(`channel:${channelId}`);

//         // Notify other channel members
//         socket.to(`channel:${channelId}`).emit("user_left_channel", {
//           userId: socket.userId,
//           userInfo: socket.userInfo,
//           channelId
//         });

//         socket.emit("channel_left", { channelId });

//         if (socket.currentChannelId === channelId) {
//           socket.currentChannelId = null;
//         }

//         console.log(`User ${socket.userId} left channel ${channelId}`);
//       } catch (error) {
//         console.error("Error leaving channel:", error);
//         socket.emit("error", { message: "Failed to leave channel" });
//       }
//     });

//     // Handle community message sending
//     socket.on("send_community_message", async ({ channelId, content, messageType = 'text', mentions = [] }) => {
//       try {
//         // Verify user is a member
//         const isMember = await chatService.isChannelMember(channelId, socket.userId);
//         if (!isMember) {
//           socket.emit("error", { message: "Access denied - not a channel member" });
//           return;
//         }

//         // Create message data
//         const messageData = {
//           channelId,
//           userId: socket.userId,
//           content: content.trim(),
//           messageType,
//           mentions
//         };

//         // Save message using community service
//         const message = await chatService.sendCommunityMessage(messageData);

//         // Populate user data for real-time display
//         const populatedMessage = await message.populate([
//           { path: 'userId', select: 'name email' },
//           { path: 'mentions', select: 'name email' }
//         ]);

//         // Emit to all channel members
//         io.to(`channel:${channelId}`).emit("new_community_message", {
//           message: populatedMessage,
//           channelId
//         });

//         // Send mention notifications
//         if (mentions.length > 0) {
//           mentions.forEach(mentionedUserId => {
//             io.to(`user:${mentionedUserId}`).emit("mention_notification", {
//               message: populatedMessage,
//               channelId,
//               mentionedBy: socket.userInfo
//             });
//           });
//         }

//         console.log(`Community message sent in channel ${channelId} by user ${socket.userId}`);

//       } catch (error) {
//         console.error("Community message error:", error);
//         socket.emit("error", { message: "Failed to send message" });
//       }
//     });

//     // Handle message reactions
//     socket.on("toggle_message_reaction", async ({ messageId, emoji }) => {
//       try {
//         const result = await chatService.toggleMessageReaction(messageId, socket.userId, emoji);

//         // Emit reaction update to channel
//         if (result.channelId) {
//           io.to(`channel:${result.channelId}`).emit("message_reaction_updated", {
//             messageId,
//             userId: socket.userId,
//             emoji,
//             action: result.action, // 'add' or 'remove'
//             reactionCounts: result.reactionCounts
//           });
//         }

//       } catch (error) {
//         console.error("Reaction error:", error);
//         socket.emit("error", { message: "Failed to update reaction" });
//       }
//     });

//     // Handle typing indicators for community chat
//     socket.on("community_typing", ({ channelId, isTyping }) => {
//       try {
//         socket.to(`channel:${channelId}`).emit("user_typing", {
//           userId: socket.userId,
//           userInfo: socket.userInfo,
//           channelId,
//           isTyping
//         });
//       } catch (error) {
//         console.error("Typing indicator error:", error);
//       }
//     });

//     // Handle message deletion
//     socket.on("delete_community_message", async ({ messageId }) => {
//       try {
//         const result = await chatService.deleteCommunityMessage(messageId, socket.userId);

//         // Emit deletion to channel
//         io.to(`channel:${result.channelId}`).emit("message_deleted", {
//           messageId,
//           deletedBy: socket.userId,
//           channelId: result.channelId
//         });

//       } catch (error) {
//         console.error("Delete message error:", error);
//         socket.emit("error", { message: "Failed to delete message" });
//       }
//     });

//     // Handle message editing
//     socket.on("edit_community_message", async ({ messageId, newContent }) => {
//       try {
//         const message = await chatService.editCommunityMessage(messageId, socket.userId, newContent);

//         if (message) {
//           // Emit edit to channel
//           io.to(`channel:${message.channelId}`).emit("message_edited", {
//             messageId,
//             newContent,
//             editedAt: message.editedAt,
//             editedBy: socket.userId,
//             channelId: message.channelId
//           });
//         }

//       } catch (error) {
//         console.error("Edit message error:", error);
//         socket.emit("error", { message: "Failed to edit message" });
//       }
//     });

//     // Handle getting online members in channel
//     socket.on("get_online_members", async ({ channelId }) => {
//       try {
//         const room = io.sockets.adapter.rooms.get(`channel:${channelId}`);
//         const onlineMembers = [];

//         if (room) {
//           for (const socketId of room) {
//             const memberSocket = io.sockets.sockets.get(socketId);
//             if (memberSocket && memberSocket.userId && memberSocket.userInfo) {
//               onlineMembers.push({
//                 userId: memberSocket.userId,
//                 userInfo: memberSocket.userInfo
//               });
//             }
//           }
//         }

//         socket.emit("online_members", {
//           channelId,
//           members: onlineMembers,
//           count: onlineMembers.length
//         });

//       } catch (error) {
//         console.error("Get online members error:", error);
//         socket.emit("error", { message: "Failed to get online members" });
//       }
//     });

//       } catch (error) {
//         socket.emit("analysis_error", { message: "Failed to analyze image" });
//       }
//     });

//     // Handle weather updates request
//     socket.on("request_weather", async ({ coordinates }) => {
//       try {
//         // This would integrate with your weather service
//         socket.emit("weather_update", {
//           location: coordinates,
//           data: { temp: 28, humidity: 65, description: "partly cloudy" }
//         });
//       } catch (error) {
//         socket.emit("weather_error", { message: "Failed to get weather data" });
//       }
//     });

//     // Handle feedback
//     socket.on("submit_feedback", async ({ conversationId, messageIndex, rating, feedback }) => {
//       try {
//         // Save feedback to database (implement based on your Feedback model)
//         console.log(`Feedback received from user ${socket.userId}:`, { rating, feedback });

//         socket.emit("feedback_received", {
//           message: "Thank you for your feedback!"
//         });

//       } catch (error) {
//         socket.emit("feedback_error", { message: "Failed to submit feedback" });
//       }
//     });

//     // Handle disconnect
//     socket.on("disconnect", (reason) => {
//       console.log(`Socket disconnected: ${socket.id} (User: ${socket.userId}, Reason: ${reason})`);

//       // Track disconnect analytics
//       trackEvent(socket.userId, 'chat_message', {
//         eventType: 'socket_disconnect',
//         reason,
//         socketId: socket.id
//       });
//     });

//     // Handle errors
//     socket.on("error", (error) => {
//       console.error(`Socket error for user ${socket.userId}:`, error);

//       trackEvent(socket.userId, 'chat_message', {
//           eventType: 'socket_error',
//         error: error.message,
//         socketId: socket.id
//       });
//     });
//   });

//   // Handle connection errors
//   io.on("connect_error", (error) => {
//     console.error("Socket.IO connection error:", error);
//   });

//   return io;
// }

// // Utility function to track events
// async function trackEvent(userId, eventType, eventData) {
//   try {
//     // List of valid enum values
//     const validEventTypes = [
//       'chat_message',
//       'soil_analysis',
//       'weather_query',
//       'market_query',
//       'geocoding'
//     ];

//     // Use 'chat_message' as fallback for invalid enum values
//     const safeEventType = validEventTypes.includes(eventType) ? eventType : 'chat_message';

//     const analytics = new Analytics({
//       userId,
//       eventType: safeEventType,
//       eventData: {
//         originalEventType: eventType, // Preserve original event type
//         ...eventData
//       },
//       success: !eventData.error
//     });

//     await analytics.save();
//   } catch (error) {
//     console.error("Failed to track analytics:", error);
//   }
// }

// // Generate unique session ID
// function generateSessionId() {
//   return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
// }

// // Emit to specific user (utility function)
// export function emitToUser(userId, event, data) {
//   if (io) {
//     io.to(`user:${userId}`).emit(event, data);
//   }
// }

// // Emit to conversation room (utility function)
// export function emitToConversation(conversationId, event, data) {
//   if (io) {
//     io.to(`conversation:${conversationId}`).emit(event, data);
//   }
// }

// // Get connected users count (utility function)
// export function getConnectedUsersCount() {
//   return io ? io.engine.clientsCount : 0;
// }

import { Server } from "socket.io";
import * as chatService from "./chat.service.js";
import { Conversation, Analytics } from "./chat.models.js";
import jwt from "jsonwebtoken";
import config from "../../config/env.js";

let io;

const authenticateSocket = async (socket, next) => {
  try {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    socket.userId = decoded.id || decoded.userId;
    socket.userInfo = decoded;

    console.log(`User ${socket.userId} authenticated via socket`);
    next();
  } catch (error) {
    console.error("Socket authentication error:", error);
    next(new Error("Invalid authentication token"));
  }
};

// Context validation and sanitization function
function validateAndSanitizeContext(context) {
  if (!context || typeof context !== "object") {
    return {};
  }

  const sanitized = {};

  // Sanitize crop
  if (context.crop && typeof context.crop === "string") {
    sanitized.crop = context.crop.trim();
  }

  // Sanitize location - ensure proper nested structure
  if (context.location && typeof context.location === "object") {
    const location = {};

    if (
      context.location.address &&
      typeof context.location.address === "string"
    ) {
      location.address = context.location.address.trim();
    }

    if (
      context.location.coordinates &&
      typeof context.location.coordinates === "object"
    ) {
      const coords = context.location.coordinates;
      if (typeof coords.lat === "number" && typeof coords.lon === "number") {
        location.coordinates = {
          lat: coords.lat,
          lon: coords.lon,
        };
      }
    }

    if (context.location.state && typeof context.location.state === "string") {
      location.state = context.location.state.trim();
    }

    if (
      context.location.district &&
      typeof context.location.district === "string"
    ) {
      location.district = context.location.district.trim();
    }

    // Only add location if it has at least one valid field
    if (Object.keys(location).length > 0) {
      sanitized.location = location;
    }
  }

  // Sanitize weather
  if (context.weather && typeof context.weather === "object") {
    const weather = {};

    if (typeof context.weather.temp === "number") {
      weather.temp = context.weather.temp;
    }

    if (typeof context.weather.humidity === "number") {
      weather.humidity = context.weather.humidity;
    }

    if (typeof context.weather.rain === "number") {
      weather.rain = context.weather.rain;
    }

    if (
      context.weather.description &&
      typeof context.weather.description === "string"
    ) {
      weather.description = context.weather.description.trim();
    }

    if (Object.keys(weather).length > 0) {
      sanitized.weather = weather;
    }
  }

  // Sanitize soilAnalysis
  if (context.soilAnalysis && typeof context.soilAnalysis === "object") {
    const soilAnalysis = {};

    if (
      context.soilAnalysis.summary &&
      typeof context.soilAnalysis.summary === "string"
    ) {
      soilAnalysis.summary = context.soilAnalysis.summary.trim();
    }

    if (Array.isArray(context.soilAnalysis.recommendations)) {
      soilAnalysis.recommendations = context.soilAnalysis.recommendations
        .filter((rec) => typeof rec === "string" && rec.trim())
        .map((rec) => rec.trim());
    }

    if (typeof context.soilAnalysis.confidence === "number") {
      soilAnalysis.confidence = context.soilAnalysis.confidence;
    }

    if (Object.keys(soilAnalysis).length > 0) {
      sanitized.soilAnalysis = soilAnalysis;
    }
  }

  // Sanitize marketData
  if (context.marketData && typeof context.marketData === "object") {
    const marketData = {};

    if (typeof context.marketData.currentPrice === "number") {
      marketData.currentPrice = context.marketData.currentPrice;
    }

    if (
      context.marketData.trend &&
      typeof context.marketData.trend === "string"
    ) {
      marketData.trend = context.marketData.trend.trim();
    }

    if (typeof context.marketData.changePercent === "number") {
      marketData.changePercent = context.marketData.changePercent;
    }

    if (
      context.marketData.forecast &&
      typeof context.marketData.forecast === "string"
    ) {
      marketData.forecast = context.marketData.forecast.trim();
    }

    if (Object.keys(marketData).length > 0) {
      sanitized.marketData = marketData;
    }
  }

  return sanitized;
}

export function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: config.frontendUrl || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  // Apply authentication middleware
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id} (User: ${socket.userId})`);

    // Join user to their personal room
    socket.join(`user:${socket.userId}`);

    // Track connection analytics
    trackEvent(socket.userId, "chat_message", {
      eventType: "socket_connection",
      socketId: socket.id,
      userAgent: socket.handshake.headers["user-agent"],
    });

    // Handle joining specific conversation room
    socket.on("join_conversation", async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findOne({
          _id: conversationId,
          userId: socket.userId,
        });

        if (conversation) {
          socket.join(`conversation:${conversationId}`);
          socket.conversationId = conversationId;

          socket.emit("conversation_joined", {
            conversationId,
            messageCount: conversation.messages.length,
          });

          console.log(
            `User ${socket.userId} joined conversation ${conversationId}`
          );
        } else {
          socket.emit("error", {
            message: "Conversation not found or access denied",
          });
        }
      } catch (error) {
        console.error("Error joining conversation:", error);
        socket.emit("error", { message: "Failed to join conversation" });
      }
    });

    // Handle chat messages with proper context validation
    socket.on(
      "chat_message",
      async ({ messages, context, conversationId, sessionId }) => {
        const startTime = Date.now();

        try {
          console.log(`Received chat message from user ${socket.userId}`);

          const sanitizedContext = validateAndSanitizeContext(context);
          console.log("Original context:", context);
          console.log("Sanitized context:", sanitizedContext);

          socket.emit("assistant_typing", { isTyping: true });

          const result = await chatService.converseWithAssistant({
            messages,
            context: sanitizedContext,
            userId: socket.userId,
          });
          const responseTime = Date.now() - startTime;

          let conversation;
          if (conversationId) {
            conversation = await Conversation.findById(conversationId);
          }

          if (!conversation) {
            conversation = new Conversation({
              userId: socket.userId,
              sessionId: sessionId || generateSessionId(),
              messages: [],
              context: sanitizedContext,
            });
          }

          const existingMessageCount = conversation.messages.length;
          const newMessages = messages.slice(existingMessageCount);
          if (result.replies) {
            newMessages.push(...result.replies);
          }

          conversation.messages.push(...newMessages);
          conversation.context = {
            ...conversation.context,
            ...sanitizedContext,
          };
          conversation.lastActivity = new Date();

          await conversation.save();

          socket.emit("assistant_typing", { isTyping: false });
          socket.emit("chat_response", {
            replies: result.replies || [],
            conversationId: conversation._id,
            success: true,
          });

          trackEvent(socket.userId, "chat_message", {
            messageCount: messages.length,
            responseTime,
            hasContext: Object.keys(sanitizedContext).length > 0,
            success: true,
          });

          console.log(
            `Chat response sent to user ${socket.userId} (${responseTime}ms)`
          );
        } catch (error) {
          console.error("Chat message error:", error);
          const responseTime = Date.now() - startTime;

          socket.emit("assistant_typing", { isTyping: false });
          socket.emit("chat_error", {
            message:
              "I'm sorry, I'm having trouble responding right now. Please try again.",
            error: error.message,
          });

          trackEvent(socket.userId, "chat_message", {
            responseTime,
            success: false,
            error: error.message,
          });
        }
      }
    );

    // COMMUNITY CHAT HANDLERS - FIXED STRUCTURE

    // Handle joining community channel
    socket.on("join_community_channel", async ({ channelId }) => {
      try {
        // Check if chatService has isChannelMember function
        if (typeof chatService.isChannelMember !== "function") {
          console.error("isChannelMember function not found in chatService");
          socket.emit("error", { message: "Channel service not available" });
          return;
        }

        const isMember = await chatService.isChannelMember(
          channelId,
          socket.userId
        );

        if (isMember) {
          socket.join(`channel:${channelId}`);
          socket.currentChannelId = channelId;

          socket.emit("channel_joined", {
            channelId,
            message: "Successfully joined channel",
          });

          socket.to(`channel:${channelId}`).emit("user_joined_channel", {
            userId: socket.userId,
            userInfo: socket.userInfo,
            channelId,
          });

          console.log(`User ${socket.userId} joined channel ${channelId}`);
        } else {
          socket.emit("error", {
            message: "Access denied - not a channel member",
          });
        }
      } catch (error) {
        console.error("Error joining channel:", error);
        socket.emit("error", { message: "Failed to join channel" });
      }
    });

    // Handle leaving community channel
    socket.on("leave_community_channel", ({ channelId }) => {
      try {
        socket.leave(`channel:${channelId}`);

        socket.to(`channel:${channelId}`).emit("user_left_channel", {
          userId: socket.userId,
          userInfo: socket.userInfo,
          channelId,
        });

        socket.emit("channel_left", { channelId });

        if (socket.currentChannelId === channelId) {
          socket.currentChannelId = null;
        }

        console.log(`User ${socket.userId} left channel ${channelId}`);
      } catch (error) {
        console.error("Error leaving channel:", error);
        socket.emit("error", { message: "Failed to leave channel" });
      }
    });

    // Handle community message sending
    socket.on(
      "send_community_message",
      async ({ channelId, content, messageType = "text", mentions = [] }) => {
        try {
          console.log(
            `Received community message from user ${socket.userId} for channel ${channelId}`
          );

          // Check if required service functions exist
          if (typeof chatService.isChannelMember !== "function") {
            socket.emit("error", { message: "Channel service not available" });
            return;
          }

          if (typeof chatService.sendCommunityMessage !== "function") {
            socket.emit("error", { message: "Message service not available" });
            return;
          }

          const isMember = await chatService.isChannelMember(
            channelId,
            socket.userId
          );
          if (!isMember) {
            socket.emit("error", {
              message: "Access denied - not a channel member",
            });
            return;
          }

          if (!content || !content.trim()) {
            socket.emit("error", {
              message: "Message content cannot be empty",
            });
            return;
          }

          const messageData = {
            channelId,
            userId: socket.userId,
            content: content.trim(),
            messageType,
            mentions,
          };

          const message = await chatService.sendCommunityMessage(messageData);

          // Populate user data for real-time display
          const populatedMessage = await message.populate([
            { path: "userId", select: "name email" },
            { path: "mentions", select: "name email" },
          ]);

          // Emit to all channel members
          io.to(`channel:${channelId}`).emit("new_community_message", {
            message: populatedMessage,
            channelId,
          });

          // Send mention notifications
          if (mentions.length > 0) {
            mentions.forEach((mentionedUserId) => {
              io.to(`user:${mentionedUserId}`).emit("mention_notification", {
                message: populatedMessage,
                channelId,
                mentionedBy: socket.userInfo,
              });
            });
          }

          console.log(
            `Community message sent in channel ${channelId} by user ${socket.userId}`
          );
        } catch (error) {
          console.error("Community message error:", error);
          socket.emit("error", {
            message: "Failed to send message: " + error.message,
          });
        }
      }
    );

    // Handle message reactions
    socket.on("toggle_message_reaction", async ({ messageId, emoji }) => {
      try {
        if (typeof chatService.toggleMessageReaction !== "function") {
          socket.emit("error", { message: "Reaction service not available" });
          return;
        }

        const result = await chatService.toggleMessageReaction(
          messageId,
          socket.userId,
          emoji
        );

        if (result.channelId) {
          io.to(`channel:${result.channelId}`).emit(
            "message_reaction_updated",
            {
              messageId,
              userId: socket.userId,
              emoji,
              action: result.action,
              reactionCounts: result.reactionCounts,
            }
          );
        }
      } catch (error) {
        console.error("Reaction error:", error);
        socket.emit("error", { message: "Failed to update reaction" });
      }
    });

    // Handle typing indicators for community chat
    socket.on("community_typing", ({ channelId, isTyping }) => {
      try {
        socket.to(`channel:${channelId}`).emit("user_typing", {
          userId: socket.userId,
          userInfo: socket.userInfo,
          channelId,
          isTyping,
        });
      } catch (error) {
        console.error("Typing indicator error:", error);
      }
    });

    // Handle message deletion
    socket.on("delete_community_message", async ({ messageId }) => {
      try {
        if (typeof chatService.deleteCommunityMessage !== "function") {
          socket.emit("error", { message: "Delete service not available" });
          return;
        }

        const result = await chatService.deleteCommunityMessage(
          messageId,
          socket.userId
        );

        io.to(`channel:${result.channelId}`).emit("message_deleted", {
          messageId,
          deletedBy: socket.userId,
          channelId: result.channelId,
        });
      } catch (error) {
        console.error("Delete message error:", error);
        socket.emit("error", { message: "Failed to delete message" });
      }
    });

    // Handle message editing
    socket.on("edit_community_message", async ({ messageId, newContent }) => {
      try {
        if (typeof chatService.editCommunityMessage !== "function") {
          socket.emit("error", { message: "Edit service not available" });
          return;
        }

        const message = await chatService.editCommunityMessage(
          messageId,
          socket.userId,
          newContent
        );

        if (message) {
          io.to(`channel:${message.channelId}`).emit("message_edited", {
            messageId,
            newContent,
            editedAt: message.editedAt,
            editedBy: socket.userId,
            channelId: message.channelId,
          });
        }
      } catch (error) {
        console.error("Edit message error:", error);
        socket.emit("error", { message: "Failed to edit message" });
      }
    });

    // Handle getting online members in channel
    socket.on("get_online_members", async ({ channelId }) => {
      try {
        const room = io.sockets.adapter.rooms.get(`channel:${channelId}`);
        const onlineMembers = [];

        if (room) {
          for (const socketId of room) {
            const memberSocket = io.sockets.sockets.get(socketId);
            if (memberSocket && memberSocket.userId && memberSocket.userInfo) {
              onlineMembers.push({
                userId: memberSocket.userId,
                userInfo: memberSocket.userInfo,
              });
            }
          }
        }

        socket.emit("online_members", {
          channelId,
          members: onlineMembers,
          count: onlineMembers.length,
        });
      } catch (error) {
        console.error("Get online members error:", error);
        socket.emit("error", { message: "Failed to get online members" });
      }
    });

    // Handle real-time soil analysis
    socket.on("analyze_soil", async ({ imageData, crop, conversationId }) => {
      try {
        socket.emit("analysis_status", {
          status: "processing",
          message: "Analyzing your soil/plant image...",
        });

        setTimeout(() => {
          const mockResult = {
            summary:
              "The soil appears healthy with good organic content. Consider adding compost for better nutrient retention.",
            recommendations: [
              "Add organic compost",
              "Test pH levels",
              "Ensure proper drainage",
            ],
            confidence: 0.85,
          };

          socket.emit("analysis_complete", {
            result: mockResult,
            conversationId,
          });
        }, 3000);
      } catch (error) {
        socket.emit("analysis_error", { message: "Failed to analyze image" });
      }
    });

    // Handle weather updates request
    socket.on("request_weather", async ({ coordinates }) => {
      try {
        socket.emit("weather_update", {
          location: coordinates,
          data: { temp: 28, humidity: 65, description: "partly cloudy" },
        });
      } catch (error) {
        socket.emit("weather_error", { message: "Failed to get weather data" });
      }
    });

    // Handle feedback
    socket.on(
      "submit_feedback",
      async ({ conversationId, messageIndex, rating, feedback }) => {
        try {
          console.log(`Feedback received from user ${socket.userId}:`, {
            rating,
            feedback,
          });

          socket.emit("feedback_received", {
            message: "Thank you for your feedback!",
          });
        } catch (error) {
          socket.emit("feedback_error", {
            message: "Failed to submit feedback",
          });
        }
      }
    );

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      console.log(
        `Socket disconnected: ${socket.id} (User: ${socket.userId}, Reason: ${reason})`
      );

      trackEvent(socket.userId, "chat_message", {
        eventType: "socket_disconnect",
        reason,
        socketId: socket.id,
      });
    });

    // Handle errors
    socket.on("error", (error) => {
      console.error(`Socket error for user ${socket.userId}:`, error);

      trackEvent(socket.userId, "chat_message", {
        eventType: "socket_error",
        error: error.message,
        socketId: socket.id,
      });
    });
  });

  // Handle connection errors
  io.on("connect_error", (error) => {
    console.error("Socket.IO connection error:", error);
  });

  return io;
}

// Utility function to track events
async function trackEvent(userId, eventType, eventData) {
  try {
    const validEventTypes = [
      "chat_message",
      "soil_analysis",
      "weather_query",
      "market_query",
      "geocoding",
    ];

    const safeEventType = validEventTypes.includes(eventType)
      ? eventType
      : "chat_message";

    const analytics = new Analytics({
      userId,
      eventType: safeEventType,
      eventData: {
        originalEventType: eventType,
        ...eventData,
      },
      success: !eventData.error,
    });

    await analytics.save();
  } catch (error) {
    console.error("Failed to track analytics:", error);
  }
}

// Generate unique session ID
function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Emit to specific user (utility function)
export function emitToUser(userId, event, data) {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
}

// Emit to conversation room (utility function)
export function emitToConversation(conversationId, event, data) {
  if (io) {
    io.to(`conversation:${conversationId}`).emit(event, data);
  }
}

// Get connected users count (utility function)
export function getConnectedUsersCount() {
  return io ? io.engine.clientsCount : 0;
}
