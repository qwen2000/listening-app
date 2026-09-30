// 路由 /api/episodes/:date/checkin
// POST —— 孩子打卡，body: { action: 'listened' | 'summarized', user_id }，无需密码

export async function onRequest(context) {
  const { request, env, params } = context;
  const date = params.date;

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const action = (body.action || '').toString();
  const userId = body.user_id;

  if (!userId) {
    return new Response('缺少 user_id', { status: 400 });
  }
  const field = action === 'listened' ? 'listened_at' : (action === 'summarized' ? 'summarized_at' : '');
  if (!field) {
    return new Response('未知 action', { status: 400 });
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO checkins (date, user_id, ${field}) VALUES (?, ?, ?)
     ON CONFLICT(date, user_id) DO UPDATE SET ${field} = excluded.${field}`
  ).bind(date, userId, now).run();

  return Response.json({ ok: true, date, action });
}
