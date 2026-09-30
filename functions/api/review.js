// 路由 /api/review
// GET —— 家长检查打卡汇总：每个音频 + 每个用户的打卡状态

export async function onRequest(context) {
  const { env } = context;

  const eps = await env.DB.prepare('SELECT * FROM episodes ORDER BY date DESC').all();
  const users = await env.DB.prepare('SELECT * FROM users ORDER BY id').all();
  const checkins = await env.DB.prepare('SELECT * FROM checkins').all();

  const checkinMap = {};
  for (const c of checkins.results || []) {
    if (!checkinMap[c.date]) checkinMap[c.date] = {};
    checkinMap[c.date][c.user_id] = c;
  }

  const list = (eps.results || []).map((e) => ({
    date: e.date,
    title: e.title,
    parentReviewedAt: e.parent_reviewed_at || null,
    audioUrl: e.audio_key ? `/files/${e.audio_key}` : null,
    users: (users.results || []).map((u) => {
      const c = checkinMap[e.date] && checkinMap[e.date][u.id];
      return {
        id: u.id,
        name: u.name,
        listened: !!(c && c.listened_at),
        summarized: !!(c && c.summarized_at),
        reviewed: !!(c && c.parent_reviewed_at),
      };
    }),
  }));

  return Response.json(list);
}
