// 路由 /api/episodes/:date/update
// POST —— 家长更新该日期的标题和标签，body: { title, tags }，需密码

function checkPassword(request, env) {
  const pw = request.headers.get('X-Parent-Password') || '';
  return pw === env.PARENT_PASSWORD;
}

function hashColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
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
  const title = (body.title || '').toString().trim();
  const tagsStr = (body.tags || '').toString().trim();

  // 更新标题
  await env.DB.prepare('UPDATE episodes SET title = ? WHERE date = ?').bind(title, date).run();

  // 更新标签：删除旧的，插入新的
  await env.DB.prepare('DELETE FROM episode_tags WHERE episode_date = ?').bind(date).run();
  if (tagsStr) {
    const tagNames = tagsStr.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    for (const tagName of tagNames) {
      const color = hashColor(tagName);
      await env.DB.prepare('INSERT INTO tags (name, color) VALUES (?, ?) ON CONFLICT(name) DO NOTHING').bind(tagName, color).run();
      const tag = await env.DB.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first();
      if (tag) {
        await env.DB.prepare('INSERT OR IGNORE INTO episode_tags (episode_date, tag_id) VALUES (?, ?)').bind(date, tag.id).run();
      }
    }
  }

  return Response.json({ ok: true, date });
}
