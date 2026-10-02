// 路由 /api/episodes/:date/summary-hints
// GET —— 获取该日期的概述提示词（孩子「已听」后看）

export async function onRequest(context) {
  const { request, env, params } = context;
  const date = params.date;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { results } = await env.DB.prepare(
    'SELECT word FROM summary_hints WHERE date = ? ORDER BY id'
  ).bind(date).all();

  return Response.json((results || []).map((r) => r.word));
}
