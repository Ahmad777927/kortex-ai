import mongoose, { Model, Schema, Types, model } from 'mongoose';

export type DocumentStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface DocumentDocument {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  chatId: Types.ObjectId | null;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  status: DocumentStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<DocumentDocument>(
  {
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
    filename: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
    },
    storagePath: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['uploaded', 'processing', 'ready', 'failed'],
      required: true,
      default: 'uploaded',
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

documentSchema.index({ userId: 1, createdAt: -1 });
documentSchema.index({ status: 1 });

export const DocumentModel =
  (mongoose.models.Document as Model<DocumentDocument> | undefined) ??
  model<DocumentDocument>('Document', documentSchema);

