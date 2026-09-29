// 路由 /api/episodes/:date/vocab/:id
// POST —— 家长审核：body { action: 'approve' | 'delete' }

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
  const action = (body.action || '').toString();

  if (action === 'approve') {
    await env.DB.prepare('UPDATE vocab_items SET approved = 1 WHERE id = ?').bind(id).run();
  } else if (action === 'delete') {
    await env.DB.prepare('DELETE FROM vocab_items WHERE id = ?').bind(id).run();
  } else if (action === 'edit') {
    const word = (body.word || '').toString().trim();
    const sentence = (body.sentence || '').toString().trim();
    if (!word) {
      return new Response('词不能为空', { status: 400 });
    }
    await env.DB.prepare('UPDATE vocab_items SET word = ?, sentence = ? WHERE id = ?').bind(word, sentence, id).run();
  } else {
    return new Response('未知 action', { status: 400 });
  }

  return Response.json({ ok: true });
}
