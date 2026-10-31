import { ApiError } from './ApiError.js';

export function pagination(query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 200);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    throw ApiError.badRequest('page must be positive and limit must be between 1 and 200');
  }
  return { page, limit, skip: (page - 1) * limit };
}

export async function paginated(Model, filter, query, populate, sort) {
  const { page, limit, skip } = pagination(query);
  let cursor = Model.find(filter).sort({ ...sort, _id: -1 }).skip(skip).limit(limit);
  if (populate) cursor = cursor.populate(populate);
  const [items, total] = await Promise.all([cursor, Model.countDocuments(filter)]);
  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}
