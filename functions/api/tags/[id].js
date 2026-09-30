// 路由 /api/tags/:id
// POST —— 家长更新 tag 颜色，body: { color }，需密码

function checkPassword(request, env) {
  const pw = request.headers.get('X-Parent-Password') || '';
  return pw === env.PARENT_PASSWORD;
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const id = params.id;

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
  const color = (body.color || '').toString().trim();
  if (!color) {
    return new Response('缺少 color', { status: 400 });
  }

  await env.DB.prepare('UPDATE tags SET color = ? WHERE id = ?').bind(color, id).run();
  return Response.json({ ok: true });
}
