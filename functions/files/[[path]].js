// 路由 /files/* —— R2 文件代理（音频 + PDF）
export async function onRequest(context) {
  const { request, env, params } = context;

  let key = params.path || '';
  if (Array.isArray(key)) key = key.join('/');
  if (!key) return new Response('Not found', { status: 404 });

  const obj = await env.R2.get(key);
  if (!obj) return new Response('Not found', { status: 404 });

  // 按扩展名判断 content-type（不依赖 R2 的 httpMetadata，本地模拟环境更可靠）
  const lower = key.toLowerCase();
  let contentType = (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream';
  if (lower.endsWith('.pdf')) contentType = 'application/pdf';
  else if (lower.endsWith('.mp3')) contentType = 'audio/mpeg';
  else if (lower.endsWith('.m4a')) contentType = 'audio/mp4';
  else if (lower.endsWith('.wav')) contentType = 'audio/wav';
  else if (lower.endsWith('.ogg')) contentType = 'audio/ogg';
  else if (lower.endsWith('.aac')) contentType = 'audio/aac';
  else if (lower.endsWith('.flac')) contentType = 'audio/flac';

  const buf = await obj.arrayBuffer();
  const size = buf.byteLength;

  // PDF：直接返回完整文件，避免 range 分片问题
  if (contentType === 'application/pdf') {
    return new Response(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // 音频等其他：支持 Range（拖动进度条）
  const range = request.headers.get('Range');
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (match) {
      let start = parseInt(match[1], 10);
      let end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (end >= size) end = size - 1;
      if (start < size && start <= end) {
        return new Response(buf.slice(start, end + 1), {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(end - start + 1),
          },
        });
      }
    }
    return new Response('Range not satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }

  return new Response(buf, {
    headers: {
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(size),
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
