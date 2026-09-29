// 路由 /api/episodes/:date/review
// POST —— 家长标记「已检查」，需密码

function checkPassword(request, env) {
  const pw = request.headers.get('X-Parent-Password') || '';
  return pw === env.PARENT_PASSWORD;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const date = params.date;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!checkPassword(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    'UPDATE episodes SET parent_reviewed_at = ? WHERE date = ?'
  ).bind(now, date).run();

  if (!result.meta.changes) {
    return new Response('该日期还没有听力', { status: 404 });
  }

  return Response.json({ ok: true, date });
}
