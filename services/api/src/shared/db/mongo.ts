import mongoose from 'mongoose';
import { env } from '../config/env.js';

let isConnected = false;

export async function connectMongo(): Promise<typeof mongoose> {
  if (isConnected) {
    return mongoose;
  }

  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB,
    serverSelectionTimeoutMS: 10_000,
  });

  isConnected = true;
  return mongoose;
}

export async function disconnectMongo(): Promise<void> {
  if (!isConnected) {
    return;
  }

  await mongoose.disconnect();
  isConnected = false;
}

