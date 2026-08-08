import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Reusable bilingual subdocument. Content that is shown to end users in either
 * language (names, titles, notice bodies, ...) is stored as { en, bn }.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.requiredEn=false]  Require the English value.
 * @param {boolean} [opts.requiredBn=false]  Require the Bangla value.
 */
export function bilingual({ requiredEn = false, requiredBn = false } = {}) {
  return new Schema(
    {
      en: { type: String, trim: true, default: '', required: requiredEn },
      bn: { type: String, trim: true, default: '', required: requiredBn },
    },
    { _id: false }
  );
}

export const ROLES = ['admin', 'teacher', 'student', 'parent', 'accountant'];

/** Shared options applied to every top-level schema. */
export const baseSchemaOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      return ret;
    },
  },
  toObject: { virtuals: true },
};
