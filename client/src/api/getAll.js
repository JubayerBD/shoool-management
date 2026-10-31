import api from './client.js';

// Follow every page so pickers, totals and printable reports never silently truncate.
export async function getAll(url, config = {}, key = 'items') {
  const items = [];
  let page = 1;
  while (true) {
    const response = await api.get(url, { ...config, params: { ...config.params, page, limit: 200 } });
    items.push(...(response.data[key] || []));
    if (!response.data.pages || page >= response.data.pages) {
      return { ...response, data: { ...response.data, [key]: items } };
    }
    page++;
  }
}
