// 路由 /api/tags
// GET  —— 列出所有 tag（含颜色）
// POST —— 家长创建 tag（body: { name }），需密码

function checkPassword(request, env) {
  const pw = request.headers.get('X-Parent-Password') || '';
  return pw === env.PARENT_PASSWORD;
}

const TAG_PALETTE = ['#2b6cb0', '#c53030', '#2f855a', '#b7791f', '#6b46c1', '#3182ce', '#d53f8c', '#dd6b20', '#38a169', '#805ad5', '#e53e3e', '#00a3c4'];

function hashColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM tags ORDER BY id').all();
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
    const color = hashColor(name);
    await env.DB.prepare('INSERT INTO tags (name, color) VALUES (?, ?) ON CONFLICT(name) DO NOTHING').bind(name, color).run();
    return Response.json({ ok: true, name, color });
  }

  return new Response('Method not allowed', { status: 405 });
}
