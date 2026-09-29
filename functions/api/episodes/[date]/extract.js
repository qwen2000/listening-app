// 路由 /api/episodes/:date/extract
// POST —— 家长触发词句提取
//   方式 1：body 带 { text }（粘贴 OCR 出来的文字）直接提取
//   方式 2：body 为空，从该日期的 PDF 解析文字再提取（仅文字型 PDF）

import { VOCAB_IDIOMS, VOCAB_NOUNS, VOCAB_VERBS, VOCAB_ADJECTIVES } from '../../../_vocab.js';

function checkPassword(request, env) {
  const pw = request.headers.get('X-Parent-Password') || '';
  return pw === env.PARENT_PASSWORD;
}

function countWords(words, text) {
  const freq = {};
  for (const word of words) {
    let count = 0;
    let idx = 0;
    while ((idx = text.indexOf(word, idx)) !== -1) {
      count++;
      idx += word.length;
    }
    if (count > 0) freq[word] = count;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
}

function buildItems(text, count) {
  // 成语优先，其余按 4:3:3（名:动:形）分配
  const idioms = countWords(VOCAB_IDIOMS, text);
  const idiomCount = Math.min(idioms.length, count);
  const remaining = count - idiomCount;
  const nounCount = Math.round(remaining * 0.4);
  const verbCount = Math.round(remaining * 0.3);
  const adjCount = remaining - nounCount - verbCount;

  const nouns = countWords(VOCAB_NOUNS, text).slice(0, nounCount);
  const verbs = countWords(VOCAB_VERBS, text).slice(0, verbCount);
  const adjs = countWords(VOCAB_ADJECTIVES, text).slice(0, adjCount);

  const tagged = [
    ...idioms.slice(0, idiomCount).map((w) => ({ word: w, pos: '成语' })),
    ...nouns.map((w) => ({ word: w, pos: '名词' })),
    ...verbs.map((w) => ({ word: w, pos: '动词' })),
    ...adjs.map((w) => ({ word: w, pos: '形容词' })),
  ].slice(0, count);

  // 按句末标点切分完整句子（忽略 OCR 换行，避免句子被切碎）
  const sentences = text
    .replace(/[\r\n]+/g, '')
    .split(/[。！？!?；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return tagged.map(({ word, pos }) => {
    let sentence = sentences.find((s) => s.includes(word)) || '';
    if (sentence.length > 90) {
      sentence = sentence.slice(0, 90) + '…';
    }
    return { word, pos, sentence };
  });
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

  // 尝试解析 body，可能带 { text }
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const pastedText = (body.text || '').toString().trim();
  const count = parseInt(body.count, 10) > 0 ? parseInt(body.count, 10) : 20;

  let text = '';
  if (pastedText) {
    text = pastedText;
  } else {
    // 从 PDF 提取文字
    const ep = await env.DB.prepare('SELECT pdf_key FROM episodes WHERE date = ?').bind(date).first();
    if (!ep || !ep.pdf_key) {
      return Response.json({ error: '该日期还没有 PDF，请先上传' }, { status: 404 });
    }
    const obj = await env.R2.get(ep.pdf_key);
    if (!obj) {
      return Response.json({ error: 'PDF 文件不存在' }, { status: 404 });
    }
    const buf = await obj.arrayBuffer();

    try {
      const { extractText } = await import('unpdf');
      const result = await extractText(new Uint8Array(buf));
      text = Array.isArray(result) ? result.map((t) => (t && t.str) || '').join('') : (result || '');
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      return Response.json(
        { error: 'PDF 解析失败（若是图片型 PDF，请用本地 OCR 后粘贴文字）：' + msg },
        { status: 500 }
      );
    }
    if (!text || text.trim().length < 10) {
      return Response.json(
        { error: 'PDF 里没提取到文字（图片型 PDF 请用本地 OCR 后粘贴文字）' },
        { status: 422 }
      );
    }
  }

  const items = buildItems(text, count);
  if (!items.length) {
    return Response.json({ ok: true, count: 0, items: [] });
  }

  await env.DB.prepare('DELETE FROM vocab_items WHERE date = ?').bind(date).run();
  const stmt = env.DB.prepare('INSERT INTO vocab_items (date, word, sentence, pos, approved) VALUES (?, ?, ?, ?, 0)');
  for (const it of items) {
    await stmt.bind(date, it.word, it.sentence, it.pos).run();
  }

  return Response.json({ ok: true, count: items.length, items });
}
