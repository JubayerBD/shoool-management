import { ApiError } from './ApiError.js';

/**
 * Build a guardRemove() for crudController: refuses to delete a record while other
 * collections still point at it, so history is never silently orphaned.
 * @param {Array<[import('mongoose').Model, string, string]>} checks  [Model, field, label]
 */
export function blockIfInUse(checks) {
  return async (id) => {
    for (const [Model, field, label] of checks) {
      // eslint-disable-next-line no-await-in-loop
      if (await Model.exists({ [field]: id })) {
        throw ApiError.conflict(`Cannot delete: it is still used by ${label}. Remove or reassign those first.`);
      }
    }
  };
}
