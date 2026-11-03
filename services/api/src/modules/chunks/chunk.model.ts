import mongoose, { Model, Schema, Types, model } from 'mongoose';

export interface ChunkMetadata {
  chunkIndex: number;
  start: number;
  end: number;
  source: string;
}

export interface ChunkDocument {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  userId: Types.ObjectId;
  chatId: Types.ObjectId | null;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
  createdAt: Date;
}

const chunkMetadataSchema = new Schema<ChunkMetadata>(
  {
    chunkIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    start: {
      type: Number,
      required: true,
      min: 0,
    },
    end: {
      type: Number,
      required: true,
      min: 0,
    },
    source: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    _id: false,
  },
);

const chunkSchema = new Schema<ChunkDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: 'Document',
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    chatId: {
      type: Schema.Types.ObjectId,
      ref: 'Chat',
      default: null,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    embedding: {
      type: [Number],
      default: [],
    },
    metadata: {
      type: chunkMetadataSchema,
      required: true,
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

chunkSchema.index({ documentId: 1, 'metadata.chunkIndex': 1 });

export const ChunkModel =
  (mongoose.models.Chunk as Model<ChunkDocument> | undefined) ??
  model<ChunkDocument>('Chunk', chunkSchema);

