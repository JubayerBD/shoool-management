import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB() {
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.mongoUri);
  // eslint-disable-next-line no-console
  console.log(`[db] Connected to MongoDB (${mongoose.connection.name})`);
  return mongoose.connection;
}
