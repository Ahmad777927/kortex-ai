import mongoose, { Model, Schema, Types, model } from 'mongoose';

export type UserRole = 'user' | 'admin';

export interface UserDocument {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
      required: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

export const UserModel =
  (mongoose.models.User as Model<UserDocument> | undefined) ??
  model<UserDocument>('User', userSchema);

