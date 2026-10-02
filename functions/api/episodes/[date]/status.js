// 路由 /api/episodes/:date/status
// GET —— 返回该日期的状态：标题、是否有音频/文档/提示词/词句

export async function onRequest(context) {
  const { request, env, params } = context;
  const date = params.date;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const ep = await env.DB.prepare('SELECT title, audio_key, pdf_key FROM episodes WHERE date = ?').bind(date).first();
  const hints = await env.DB.prepare('SELECT COUNT(*) as c FROM summary_hints WHERE date = ?').bind(date).first();
  const vocab = await env.DB.prepare('SELECT COUNT(*) as c FROM vocab_items WHERE date = ?').bind(date).first();

  return Response.json({
    date,
    title: ep ? ep.title : '',
    hasAudio: !!(ep && ep.audio_key),
    hasPdf: !!(ep && ep.pdf_key),
    hasHints: !!(hints && hints.c > 0),
    hasVocab: !!(vocab && vocab.c > 0),
  });
}
