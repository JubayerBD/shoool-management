import { ApiError } from '../utils/ApiError.js';

/**
 * Validate req[source] against a Zod schema, replacing it with the parsed value.
 * @param {import('zod').ZodTypeAny} schema
 * @param {'body'|'query'|'params'} [source='body']
 */
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.reduce((acc, issue) => {
        acc[issue.path.join('.') || '_'] = issue.message;
        return acc;
      }, {});
      throw ApiError.badRequest('Validation failed', details);
    }
    req[source] = result.data;
    next();
  };
}
