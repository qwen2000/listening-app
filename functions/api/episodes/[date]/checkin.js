// 路由 /api/episodes/:date/checkin
// POST —— 孩子打卡（无需密码）或家长取消打卡（需密码）
//   body: { action: 'listened' | 'summarized' | 'unlisten' | 'unsummarize', user_id }

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

  const isCancel = action === 'unlisten' || action === 'unsummarize';
  if (isCancel && !checkPassword(request, env)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const field = action === 'listened' || action === 'unlisten'
    ? 'listened_at'
    : (action === 'summarized' || action === 'unsummarize' ? 'summarized_at' : '');
  if (!field) {
    return new Response('未知 action', { status: 400 });
  }

  if (isCancel) {
    // 取消打卡：清空字段，同时清空该用户的家长签字（打卡状态变了，签字作废）
    await env.DB.prepare(
      `UPDATE checkins SET ${field} = NULL, parent_reviewed_at = NULL WHERE date = ? AND user_id = ?`
    ).bind(date, userId).run();
  } else {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO checkins (date, user_id, ${field}) VALUES (?, ?, ?)
       ON CONFLICT(date, user_id) DO UPDATE SET ${field} = excluded.${field}`
    ).bind(date, userId, now).run();
  }

  return Response.json({ ok: true, date, action });
}
