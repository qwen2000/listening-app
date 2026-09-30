// 路由 /api/users
// GET  —— 列出所有用户
// POST —— 家长创建用户（body: { name }），需密码

function checkPassword(request, env) {
  const pw = request.headers.get('X-Parent-Password') || '';
  return pw === env.PARENT_PASSWORD;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM users ORDER BY id').all();
    return Response.json(results || []);
  }

  if (request.method === 'POST') {
    if (!checkPassword(request, env)) {
      return new Response('Unauthorized', { status: 401 });
    }
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const name = (body.name || '').toString().trim();
    if (!name) {
      return new Response('缺少 name', { status: 400 });
    }
    await env.DB.prepare('INSERT INTO users (name) VALUES (?) ON CONFLICT(name) DO NOTHING').bind(name).run();
    return Response.json({ ok: true, name });
  }

  return new Response('Method not allowed', { status: 405 });
}
