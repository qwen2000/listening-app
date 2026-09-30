// 路由 /api/episodes/:date/terms
// GET —— 获取该日期的术语（拼音+释义），孩子听之前看，无需审核、无需密码

export async function onRequest(context) {
  const { request, env, params } = context;
  const date = params.date;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { results } = await env.DB.prepare(
    'SELECT word, pinyin, meaning FROM terms WHERE date = ? ORDER BY id'
  ).bind(date).all();

  return Response.json(results || []);
}
