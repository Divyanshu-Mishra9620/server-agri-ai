// modules/communityChat/communityChat.service.js
import {
  CommunityChannel,
  CommunityMessage,
  ChannelMember,
  CommunityAnalytics,
} from "./communityChat.models.js";
import mongoose from "mongoose";

// Get all channels with filtering and pagination
export const getChannels = async (options) => {
  const {
    page = 1,
    limit = 20,
    category,
    search,
    sortBy = "lastActivity",
    order = "desc",
    userId,
  } = options;

  const skip = (page - 1) * limit;
  const sortOrder = order === "desc" ? -1 : 1;

  // Build filter object
  const filter = { isActive: true };

  if (category) {
    filter.category = category;
  }

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
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
          from: "channelmembers",
          let: { channelId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$channelId", "$$channelId"] },
                    { $eq: ["$userId", userId] },
                    { $eq: ["$isActive", true] },
                  ],
                },
              },
            },
          ],
          as: "userMembership",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "createdBy",
          foreignField: "_id",
          select: "name email",
          as: "creator",
        },
      },
      {
        $addFields: {
          isMember: { $gt: [{ $size: "$userMembership" }, 0] },
          creator: { $arrayElemAt: ["$creator", 0] },
        },
      },
      {
        $project: {
          userMembership: 0,
        },
      },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
    ]),
    CommunityChannel.countDocuments(filter),
  ]);

  return {
    channels,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

// Get channel by ID with member status
export const getChannelById = async (channelId, userId) => {
  const channel = await CommunityChannel.aggregate([
    {
      $match: {
        _id: mongoose.Types.ObjectId(channelId),
        isActive: true,
      },
    },
    {
      $lookup: {
        from: "channelmembers",
        let: { channelId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$channelId", "$$channelId"] },
                  { $eq: ["$userId", userId] },
                  { $eq: ["$isActive", true] },
                ],
              },
            },
          },
        ],
        as: "userMembership",
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        select: "name email",
        as: "creator",
      },
    },
    {
      $addFields: {
        isMember: { $gt: [{ $size: "$userMembership" }, 0] },
        userRole: {
          $ifNull: [{ $arrayElemAt: ["$userMembership.role", 0] }, null],
        },
        creator: { $arrayElemAt: ["$creator", 0] },
      },
    },
    {
      $project: {
        userMembership: 0,
      },
    },
  ]);

  return channel[0] || null;
};

// Create new channel
export const createChannel = async (channelData) => {
  const channel = new CommunityChannel(channelData);
  await channel.save();

  // Automatically add creator as admin
  await joinChannel(channel._id, channelData.createdBy, "admin");

  return channel;
};

// Join channel
export const joinChannel = async (channelId, userId, role = "member") => {
  // Check if channel exists
  const channel = await CommunityChannel.findById(channelId);
  if (!channel) {
    throw new Error("Channel not found");
  }

  // Check if already a member
  const existingMember = await ChannelMember.findOne({
    channelId,
    userId,
    isActive: true,
  });

  if (existingMember) {
    throw new Error("Already a member");
  }

  // Create membership
  const membership = new ChannelMember({
    channelId,
    userId,
    role,
  });

  await membership.save();

  // Update channel member count
  await CommunityChannel.findByIdAndUpdate(channelId, {
    $inc: { memberCount: 1 },
  });

  return membership.populate("userId", "name email");
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
    await CommunityChannel.findByIdAndUpdate(channelId, {
      $inc: { memberCount: -1 },
    });
  }

  return membership;
};

// Check if user is a member of channel
export const isChannelMember = async (channelId, userId) => {
  const membership = await ChannelMember.findOne({
    channelId,
    userId,
    isActive: true,
  });

  return !!membership;
};

// Get channel messages with pagination
export const getChannelMessages = async (options) => {
  const { channelId, page = 1, limit = 50, before, after } = options;

  const skip = (page - 1) * limit;

  // Build filter
  const filter = {
    channelId,
    isDeleted: false,
  };

  if (before) {
    filter.createdAt = { $lt: new Date(before) };
  }

  if (after) {
    filter.createdAt = { $gt: new Date(after) };
  }

  const [messages, total] = await Promise.all([
    CommunityMessage.find(filter)
      .populate("userId", "name email")
      .populate("mentions", "name email")
      .populate("replies.userId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CommunityMessage.countDocuments(filter),
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
      hasPrevPage: page > 1,
    },
  };
};

// Send message to channel
export const sendMessage = async (messageData) => {
  const message = new CommunityMessage(messageData);
  await message.save();

  // Update channel stats
  await Promise.all([
    CommunityChannel.findByIdAndUpdate(messageData.channelId, {
      $inc: { messageCount: 1 },
      lastActivity: new Date(),
    }),
    ChannelMember.findOneAndUpdate(
      { channelId: messageData.channelId, userId: messageData.userId },
      {
        $inc: { messageCount: 1 },
        lastSeen: new Date(),
      }
    ),
  ]);

  return message.populate([
    { path: "userId", select: "name email" },
    { path: "mentions", select: "name email" },
  ]);
};

// Add reaction to message
export const addReaction = async (messageId, userId, emoji) => {
  const message = await CommunityMessage.findById(messageId);
  if (!message) {
    throw new Error("Message not found");
  }

  // Remove existing reaction from same user for same emoji
  message.reactions = message.reactions.filter(
    (r) => !(r.userId.toString() === userId.toString() && r.emoji === emoji)
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
    throw new Error("Message not found");
  }

  message.reactions = message.reactions.filter(
    (r) => !(r.userId.toString() === userId.toString() && r.emoji === emoji)
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
        isActive: true,
      },
    },
    {
      $lookup: {
        from: "communitychannels",
        localField: "channelId",
        foreignField: "_id",
        as: "channel",
      },
    },
    {
      $unwind: "$channel",
    },
    {
      $match: {
        "channel.isActive": true,
      },
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
        channelId: "$channel._id",
        name: "$channel.name",
        description: "$channel.description",
        category: "$channel.category",
        icon: "$channel.icon",
        memberCount: "$channel.memberCount",
        messageCount: "$channel.messageCount",
        lastActivity: "$channel.lastActivity",
        role: "$role",
        joinedAt: "$joinedAt",
        lastSeen: "$lastSeen",
        unreadCount: { $literal: 0 }, // constant field ✅
      },
    },
    {
      $sort: { lastActivity: -1 },
    },
  ]);

  return channels;
};

// Get channel members with pagination
export const getChannelMembers = async (options) => {
  const { channelId, page = 1, limit = 50, search, role } = options;

  const skip = (page - 1) * limit;

  // Build filter
  const filter = {
    channelId,
    isActive: true,
  };

  if (role) {
    filter.role = role;
  }

  const pipeline = [
    { $match: filter },
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    {
      $unwind: "$user",
    },
  ];

  // Add search filter if provided
  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { "user.name": { $regex: search, $options: "i" } },
          { "user.email": { $regex: search, $options: "i" } },
        ],
      },
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
          _id: "$user._id",
          name: "$user.name",
          email: "$user.email",
        },
      },
    }
  );

  const [members, total] = await Promise.all([
    ChannelMember.aggregate(pipeline),
    ChannelMember.countDocuments(filter),
  ]);

  return {
    members,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

// Check if user can moderate channel
export const canModerateChannel = async (channelId, userId) => {
  const membership = await ChannelMember.findOne({
    channelId,
    userId,
    isActive: true,
    role: { $in: ["moderator", "admin"] },
  });

  const channel = await CommunityChannel.findById(channelId);
  const isCreator =
    channel && channel.createdBy.toString() === userId.toString();

  return !!membership || isCreator;
};

// Update channel
export const updateChannel = async (channelId, updateData) => {
  const allowedUpdates = ["name", "description", "icon"];
  const filteredData = {};

  allowedUpdates.forEach((field) => {
    if (updateData[field] !== undefined) {
      filteredData[field] = updateData[field];
    }
  });

  const channel = await CommunityChannel.findByIdAndUpdate(
    channelId,
    filteredData,
    { new: true }
  ).populate("createdBy", "name email");

  return channel;
};

// Delete message
export const deleteMessage = async (messageId, userId) => {
  const message = await CommunityMessage.findById(messageId);

  if (!message) {
    throw new Error("Message not found");
  }

  // Check if user is author or can moderate
  const isAuthor = message.userId.toString() === userId.toString();
  const canModerate = await canModerateChannel(message.channelId, userId);

  if (!isAuthor && !canModerate) {
    throw new Error("Unauthorized");
  }

  // Soft delete
  message.isDeleted = true;
  await message.save();

  // Update channel message count
  await CommunityChannel.findByIdAndUpdate(message.channelId, {
    $inc: { messageCount: -1 },
  });

  return { channelId: message.channelId };
};

// Get channel analytics (for moderators/admins)
export const getChannelAnalytics = async (channelId, userId, days = 7) => {
  // Check if user can access analytics
  const canModerate = await canModerateChannel(channelId, userId);
  if (!canModerate) {
    throw new Error("Unauthorized");
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const analytics = await CommunityAnalytics.aggregate([
    {
      $match: {
        channelId: mongoose.Types.ObjectId(channelId),
        date: { $gte: startDate },
      },
    },
    {
      $sort: { date: 1 },
    },
  ]);

  // Get overall stats
  const overallStats = await CommunityMessage.aggregate([
    {
      $match: {
        channelId: mongoose.Types.ObjectId(channelId),
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        totalMessages: { $sum: 1 },
        uniqueUsers: { $addToSet: "$userId" },
        avgReactions: { $avg: { $size: "$reactions" } },
      },
    },
    {
      $project: {
        totalMessages: 1,
        uniqueUsers: { $size: "$uniqueUsers" },
        avgReactions: { $round: ["$avgReactions", 2] },
      },
    },
  ]);

  return {
    dailyStats: analytics,
    overallStats: overallStats[0] || {
      totalMessages: 0,
      uniqueUsers: 0,
      avgReactions: 0,
    },
  };
};

// Search messages across channels
export const searchMessages = async (query, userId, options = {}) => {
  const { channelId, page = 1, limit = 20 } = options;

  const skip = (page - 1) * limit;

  // Get user's channels if no specific channel provided
  let channelFilter = {};
  if (channelId) {
    // Check if user is member of specific channel
    const isMember = await isChannelMember(channelId, userId);
    if (!isMember) {
      throw new Error("Access denied");
    }
    channelFilter.channelId = mongoose.Types.ObjectId(channelId);
  } else {
    // Get all channels user is member of
    const userChannels = await ChannelMember.find({
      userId,
      isActive: true,
    }).select("channelId");

    channelFilter.channelId = {
      $in: userChannels.map((m) => m.channelId),
    };
  }

  const searchFilter = {
    ...channelFilter,
    isDeleted: false,
    $text: { $search: query },
  };

  const [messages, total] = await Promise.all([
    CommunityMessage.find(searchFilter)
      .populate("userId", "name email")
      .populate("channelId", "name icon")
      .sort({ score: { $meta: "textScore" }, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    CommunityMessage.countDocuments(searchFilter),
  ]);

  return {
    messages,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
};

// Pin/Unpin message
export const toggleMessagePin = async (messageId, userId) => {
  const message = await CommunityMessage.findById(messageId);

  if (!message) {
    throw new Error("Message not found");
  }

  // Check if user can moderate
  const canModerate = await canModerateChannel(message.channelId, userId);
  if (!canModerate) {
    throw new Error("Unauthorized");
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
    throw new Error("Access denied");
  }

  const pinnedMessages = await CommunityMessage.find({
    channelId,
    isPinned: true,
    isDeleted: false,
  })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(10);

  return pinnedMessages;
};
