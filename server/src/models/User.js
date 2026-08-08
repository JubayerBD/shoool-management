import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { bilingual, baseSchemaOptions, ROLES } from './common.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: bilingual({ requiredEn: true }), required: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, index: true },
    isActive: { type: Boolean, default: true },
    // Optional links to a domain profile depending on role.
    student: { type: Schema.Types.ObjectId, ref: 'Student' },
    teacher: { type: Schema.Types.ObjectId, ref: 'Teacher' },
    // For parents: the students they are guardian of.
    children: [{ type: Schema.Types.ObjectId, ref: 'Student' }],
    lastLoginAt: { type: Date },
  },
  baseSchemaOptions
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

export const User = mongoose.model('User', userSchema);
