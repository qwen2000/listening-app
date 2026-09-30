// 路由 /api/episodes
// GET  —— 列出所有听力（带 tag 和指定用户的打卡状态）?user_id=X
// POST —— 家长上传音频（FormData: date, title, file, tags），需密码

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
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');

    const { results } = await env.DB.prepare(
      'SELECT * FROM episodes ORDER BY date DESC'
    ).all();

    // 该用户的打卡状态
    const checkins = {};
    if (userId) {
      const cr = await env.DB.prepare(
        'SELECT date, listened_at, summarized_at, parent_reviewed_at FROM checkins WHERE user_id = ?'
      ).bind(userId).all();
      for (const c of cr.results || []) checkins[c.date] = c;
    }

    // 所有 tag
    const tr = await env.DB.prepare(
      'SELECT et.episode_date, t.name, t.color FROM episode_tags et JOIN tags t ON t.id = et.tag_id'
    ).all();
    const tagsByDate = {};
    for (const t of tr.results || []) {
      if (!tagsByDate[t.episode_date]) tagsByDate[t.episode_date] = [];
      tagsByDate[t.episode_date].push({ name: t.name, color: t.color });
    }

    const list = (results || []).map((r) => ({
      date: r.date,
      title: r.title,
      audioUrl: r.audio_key ? `/files/${r.audio_key}` : null,
      pdfUrl: r.pdf_key ? `/files/${r.pdf_key}` : null,
      parentReviewedAt: checkins[r.date] ? checkins[r.date].parent_reviewed_at : null,
      listenedAt: checkins[r.date] ? checkins[r.date].listened_at : null,
      summarizedAt: checkins[r.date] ? checkins[r.date].summarized_at : null,
      tags: tagsByDate[r.date] || [],
    }));
    return Response.json(list);
  }

  if (request.method === 'POST') {
    if (!checkPassword(request, env)) {
      return new Response('Unauthorized', { status: 401 });
    }

    const form = await request.formData();
    const date = (form.get('date') || '').toString().trim();
    const title = (form.get('title') || '').toString().trim();
    const file = form.get('file');
    const tagsStr = (form.get('tags') || '').toString().trim();

    if (!date || !file || typeof file === 'string') {
      return new Response('缺少 date 或 file', { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return new Response('日期格式应为 YYYY-MM-DD', { status: 400 });
    }

    const name = file.name || 'audio.mp3';
    const ext = (name.split('.').pop() || 'mp3').toLowerCase();
    const key = `audio/${date}.${ext}`;

    const AUDIO_MIME = {
      mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav',
      ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac',
    };
    const contentType = file.type || AUDIO_MIME[ext] || 'audio/mpeg';

    await env.R2.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType },
    });

    await env.DB.prepare(
      `INSERT INTO episodes (date, title, audio_key)
       VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         title = excluded.title,
         audio_key = excluded.audio_key`
    ).bind(date, title, key).run();

    // 处理 tags（逗号分隔）
    if (tagsStr) {
      const tagNames = tagsStr.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      for (const tagName of tagNames) {
        const color = hashColor(tagName);
        await env.DB.prepare(
          'INSERT INTO tags (name, color) VALUES (?, ?) ON CONFLICT(name) DO NOTHING'
        ).bind(tagName, color).run();
        const tag = await env.DB.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first();
        if (tag) {
          await env.DB.prepare(
            'INSERT OR IGNORE INTO episode_tags (episode_date, tag_id) VALUES (?, ?)'
          ).bind(date, tag.id).run();
        }
      }
    }

    return Response.json({ ok: true, date, title, key });
  }

  return new Response('Method not allowed', { status: 405 });
}
