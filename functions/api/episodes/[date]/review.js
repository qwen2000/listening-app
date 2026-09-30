// 路由 /api/episodes/:date/review
// POST —— 家长对某个用户签字，body: { user_id }，需密码

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

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const userId = body.user_id;
  if (!userId) {
    return new Response('缺少 user_id', { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE checkins SET parent_reviewed_at = ? WHERE date = ? AND user_id = ?'
  ).bind(now, date, userId).run();

  return Response.json({ ok: true, date, userId });
}
