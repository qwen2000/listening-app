// 路由 /api/episodes/:date/pdf
// POST —— 家长上传该音频的文本文件（PDF 或长图 JPG/PNG），需密码

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

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return new Response('缺少 file', { status: 400 });
  }

  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const buf = await file.arrayBuffer();

  let ext = 'pdf';
  let contentType = 'application/pdf';

  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/.test(name)) {
    if (/\.png$/.test(name) || mime === 'image/png') {
      ext = 'png';
      contentType = 'image/png';
    } else if (/\.webp$/.test(name) || mime === 'image/webp') {
      ext = 'webp';
      contentType = 'image/webp';
    } else if (/\.gif$/.test(name) || mime === 'image/gif') {
      ext = 'gif';
      contentType = 'image/gif';
    } else {
      ext = 'jpg';
      contentType = 'image/jpeg';
    }
  }

  const key = `pdf/${date}.${ext}`;
  await env.R2.put(key, buf, { httpMetadata: { contentType } });

  await env.DB.prepare(
    'UPDATE episodes SET pdf_key = ? WHERE date = ?'
  ).bind(key, date).run();

  return Response.json({ ok: true, date, key, type: ext === 'pdf' ? 'pdf' : 'image' });
}
