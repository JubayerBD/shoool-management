import { ApiError } from './ApiError.js';

/**
 * Build a set of CRUD handlers for a Mongoose model.
 *
 * @param {import('mongoose').Model} Model
 * @param {object} [opts]
 * @param {string[]} [opts.populate]      Paths to populate on read.
 * @param {string[]} [opts.searchable]    String paths matched by ?search=.
 * @param {string[]} [opts.filterable]    Query keys copied verbatim into the filter.
 * @param {object}   [opts.defaultSort]   Default sort, e.g. { createdAt: -1 }.
 * @param {(id:string)=>Promise<void>} [opts.guardRemove]  Throws (409) when other records still depend on this one.
 */
export function crudController(Model, opts = {}) {
  const {
    populate = [],
    searchable = [],
    filterable = [],
    defaultSort = { createdAt: -1 },
    guardRemove,
  } = opts;

  function buildFilter(query) {
    const filter = {};
    for (const key of filterable) {
      // Only plain string values: blocks operator objects such as ?status[$ne]=active.
      if (typeof query[key] === 'string' && query[key] !== '') filter[key] = query[key];
    }
    if (query.search && searchable.length) {
      const rx = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = searchable.map((path) => ({ [path]: rx }));
    }
    return filter;
  }

  return {
    async list(req, res) {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
      const filter = buildFilter(req.query);
      // Accept only plain field names ('name.en', '-createdAt'); anything else falls back to the default.
      const sort = typeof req.query.sort === 'string' && /^-?[A-Za-z_][\w.]*$/.test(req.query.sort) ? req.query.sort : defaultSort;

      let q = Model.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
      for (const p of populate) q = q.populate(p);

      const [items, total] = await Promise.all([q.exec(), Model.countDocuments(filter)]);
      res.json({ items, total, page, limit, pages: Math.ceil(total / limit) });
    },

    async get(req, res) {
      let q = Model.findById(req.params.id);
      for (const p of populate) q = q.populate(p);
      const doc = await q.exec();
      if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);
      res.json({ item: doc });
    },

    async create(req, res) {
      const doc = await Model.create(req.body);
      res.status(201).json({ item: doc });
    },

    async update(req, res) {
      const doc = await Model.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);
      res.json({ item: doc });
    },

    async remove(req, res) {
      if (guardRemove) await guardRemove(req.params.id);
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);
      res.json({ ok: true, id: req.params.id });
    },
  };
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
