// 路由 /api/episodes/:date/vocab
// GET —— 获取该日期的词句清单。家长（带正确密码）看全部；孩子只看已审核通过的。

export async function onRequest(context) {
  const { request, env, params } = context;
  const date = params.date;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { results } = await env.DB.prepare(
    'SELECT id, word, sentence, pos, pinyin, approved FROM vocab_items WHERE date = ? ORDER BY id'
  ).bind(date).all();

  const pw = request.headers.get('X-Parent-Password') || '';
  const isParent = pw && pw === env.PARENT_PASSWORD;

  const list = (results || []).filter((r) => isParent || r.approved === 1);
  return Response.json(list);
}
