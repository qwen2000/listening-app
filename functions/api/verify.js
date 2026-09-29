// 路由 /api/verify
// POST —— 校验家长密码（管理页解锁时调用），需密码头

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  const pw = request.headers.get('X-Parent-Password') || '';
  if (!pw || pw !== env.PARENT_PASSWORD) {
    return new Response('Unauthorized', { status: 401 });
  }
  return Response.json({ ok: true });
}
