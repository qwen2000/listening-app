// 路由 /api/episodes/:date/checkin
// POST —— 孩子打卡，body: { action: 'listened' | 'summarized' }，无需密码

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

  const now = new Date().toISOString();
  let result;
  if (action === 'listened') {
    result = await env.DB.prepare(
      'UPDATE episodes SET listened_at = ? WHERE date = ?'
    ).bind(now, date).run();
  } else if (action === 'summarized') {
    result = await env.DB.prepare(
      'UPDATE episodes SET summarized_at = ? WHERE date = ?'
    ).bind(now, date).run();
  } else {
    return new Response('未知 action', { status: 400 });
  }

  if (!result.meta.changes) {
    return new Response('该日期还没有听力', { status: 404 });
  }

  return Response.json({ ok: true, date, action });
}
