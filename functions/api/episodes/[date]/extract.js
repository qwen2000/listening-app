// 路由 /api/episodes/:date/extract
// POST —— 家长触发提取，body 带 { text }（本地识别后粘贴的文字）
// 提取：LLM（DeepSeek）为主，词库兜底。产出两类：
//   - terms（术语+拼音+释义，孩子听之前看，不审核）
//   - vocab（重点词句，家长审核后孩子看）

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

// 词库匹配（兜底，只产词句，不产术语）
function buildVocabFromWordlist(text, count) {
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

  const sentences = text
    .replace(/[\r\n]+/g, '')
    .split(/[。！？!?；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return tagged.map(({ word, pos }) => {
    let sentence = sentences.find((s) => s.includes(word)) || '';
    if (sentence.length > 90) sentence = sentence.slice(0, 90) + '…';
    return { word, pos, pinyin: '', sentence };
  });
}

// 用原文的完整句子补全 LLM 可能截断的例句
function fixSentences(vocab, text) {
  const sentences = text
    .replace(/[\r\n]+/g, '')
    .split(/[。！？!?；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return vocab.map((v) => {
    const full = sentences.find((s) => s.includes(v.word));
    if (full && full.length > (v.sentence || '').length) {
      let sentence = full;
      if (sentence.length > 90) sentence = sentence.slice(0, 90) + '…';
      return { ...v, sentence };
    }
    return v;
  });
}

// LLM 提取（DeepSeek）：术语 + 词句
async function extractWithLLM(text, count, env) {
  if (!env.DEEPSEEK_API_KEY) return null;

  const prompt = `请分析下面的文本，提取三类内容：

1. terms（高频术语 5-10 个）：文本中反复出现的专业术语、关键概念词，每个配拼音和简要释义（给孩子听之前预习用）。
2. summary_hints（概述提示词 6-10 个）：写这篇内容的概述时，应该用到的关键词/短语（帮助孩子练习概述和写作，只返回词本身）。
3. vocab（重点词语 ${count} 个）：值得学习的成语、书面语，每个配词性、拼音和原文例句（例句必须是原文里完整的一句话，不要截断）。不要包含 terms 和 summary_hints 里的词。

只返回 JSON（不要任何解释）：
{"terms":[{"word":"...","pinyin":"...","meaning":"..."}], "summary_hints":["词1","词2"], "vocab":[{"word":"...","pos":"...","pinyin":"...","sentence":"..."}]}

词性只能是：成语、名词、动词、形容词、其他。
拼音用标准带声调字母（如：là gé lǎng rì diǎn）。

文本：
${text.slice(0, 8000)}`;

  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是资深中文老师，擅长提取专业术语和重点词语，准确标注拼音和释义。' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    });
    const data = await res.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    if (!content) return null;

    const jsonStr = content.replace(/```json\s*/g, '').replace(/```/g, '').trim();
    const obj = JSON.parse(jsonStr);

    const terms = (obj.terms || []).map((t) => ({
      word: (t.word || '').toString().trim(),
      pinyin: (t.pinyin || '').toString().trim(),
      meaning: (t.meaning || '').toString().trim(),
    })).filter((t) => t.word);

    const vocab = (obj.vocab || []).map((v) => ({
      word: (v.word || '').toString().trim(),
      pos: (v.pos || '').toString().trim(),
      pinyin: (v.pinyin || '').toString().trim(),
      sentence: (v.sentence || '').toString().trim(),
    })).filter((v) => v.word);

    const summaryHints = (obj.summary_hints || []).map((h) => (typeof h === 'string' ? h : (h && h.word) || '')).map((h) => h.toString().trim()).filter(Boolean);

    return { terms, summaryHints, vocab };
  } catch (e) {
    return null;
  }
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

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const pastedText = (body.text || '').toString().trim();
  const count = parseInt(body.count, 10) > 0 ? parseInt(body.count, 10) : 20;

  if (!pastedText) {
    return Response.json(
      { error: '请先用「本地识别」提取文字，再点「从粘贴文字提取词句」' },
      { status: 400 }
    );
  }
  const text = pastedText;

  // LLM 为主，词库兜底
  let terms = [];
  let summaryHints = [];
  let vocab = [];
  let source = 'llm';
  const llmResult = await extractWithLLM(text, count, env);
  if (llmResult && (llmResult.terms.length || llmResult.vocab.length)) {
    terms = llmResult.terms;
    summaryHints = llmResult.summaryHints || [];
    vocab = fixSentences(llmResult.vocab, text);
  } else {
    vocab = buildVocabFromWordlist(text, count);
    source = 'vocab';
  }

  // 存术语
  if (terms.length) {
    await env.DB.prepare('DELETE FROM terms WHERE date = ?').bind(date).run();
    const tstmt = env.DB.prepare('INSERT INTO terms (date, word, pinyin, meaning) VALUES (?, ?, ?, ?)');
    for (const t of terms) {
      await tstmt.bind(date, t.word, t.pinyin || '', t.meaning || '').run();
    }
  }

  // 存概述提示词
  if (summaryHints.length) {
    await env.DB.prepare('DELETE FROM summary_hints WHERE date = ?').bind(date).run();
    const hstmt = env.DB.prepare('INSERT INTO summary_hints (date, word) VALUES (?, ?)');
    for (const h of summaryHints) {
      await hstmt.bind(date, h).run();
    }
  }

  // 存词句
  if (vocab.length) {
    await env.DB.prepare('DELETE FROM vocab_items WHERE date = ?').bind(date).run();
    const vstmt = env.DB.prepare('INSERT INTO vocab_items (date, word, sentence, pos, pinyin, approved) VALUES (?, ?, ?, ?, ?, 0)');
    for (const v of vocab) {
      await vstmt.bind(date, v.word, v.sentence || '', v.pos || '', v.pinyin || '').run();
    }
  }

  return Response.json({ ok: true, terms: terms.length, summaryHints: summaryHints.length, vocab: vocab.length, source });
}
