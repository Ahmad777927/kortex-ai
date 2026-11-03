import mongoose, { Model, Schema, Types, model } from 'mongoose';

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface MessageCitation {
  documentId: Types.ObjectId;
  chunkId: Types.ObjectId;
  score: number;
}

export interface MessageDocument {
  _id: Types.ObjectId;
  chatId: Types.ObjectId;
  role: MessageRole;
  content: string;
  tokensIn: number | null;
  tokensOut: number | null;
  latencyMs: number | null;
  citations: MessageCitation[];
  createdAt: Date;
}

const messageCitationSchema = new Schema<MessageCitation>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
    },
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: 'Chunk',
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
  },
  {
    _id: false,
  },
);

const messageSchema = new Schema<MessageDocument>(
  {
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['system', 'user', 'assistant', 'tool'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    tokensIn: {
      type: Number,
      default: null,
    },
    tokensOut: {
      type: Number,
      default: null,
    },
    latencyMs: {
      type: Number,
      default: null,
    },
    citations: {
      type: [messageCitationSchema],
      default: [],
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
      required: true,
    },
  },
  {
    versionKey: false,
  },
);

messageSchema.index({ chatId: 1, createdAt: 1 });

export const MessageModel =
  (mongoose.models.Message as Model<MessageDocument> | undefined) ??
  model<MessageDocument>('Message', messageSchema);

