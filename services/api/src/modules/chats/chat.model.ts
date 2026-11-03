import mongoose, { Model, Schema, Types, model } from 'mongoose';

export interface ChatDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  model: string;
  systemPrompt: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chatSchema = new Schema<ChatDocument>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'New Chat',
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    systemPrompt: {
      type: String,
      default: null,
    },
    lastMessageAt: {
      type: Date,
      default: () => new Date(),
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

chatSchema.index({ userId: 1, lastMessageAt: -1 });

export const ChatModel =
  (mongoose.models.Chat as Model<ChatDocument> | undefined) ??
  model<ChatDocument>('Chat', chatSchema);

