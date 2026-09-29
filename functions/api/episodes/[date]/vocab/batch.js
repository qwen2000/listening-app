// 路由 /api/episodes/:date/vocab/batch
// POST —— 批量操作：body { action: 'approve_all' | 'delete_all' }

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
  const action = (body.action || '').toString();

  if (action === 'approve_all') {
    await env.DB.prepare('UPDATE vocab_items SET approved = 1 WHERE date = ?').bind(date).run();
  } else if (action === 'delete_all') {
    await env.DB.prepare('DELETE FROM vocab_items WHERE date = ?').bind(date).run();
  } else {
    return new Response('未知 action', { status: 400 });
  }

  return Response.json({ ok: true });
}
