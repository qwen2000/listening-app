-- 听力打卡表（开发阶段重建版：字段已更新，重跑会清空数据）
DROP TABLE IF EXISTS episodes;
DROP TABLE IF EXISTS vocab_items;

CREATE TABLE episodes (
  date TEXT PRIMARY KEY,          -- 'YYYY-MM-DD'，唯一，按日期解锁的关键
  title TEXT NOT NULL DEFAULT '', -- 听力标题
  audio_key TEXT,                 -- R2 音频对象键
  pdf_key TEXT,                   -- R2 文本 PDF 对象键（家长后上传，可空）
  listened_at TEXT,               -- 孩子点「已听」的时间
  summarized_at TEXT,             -- 孩子点「已概述」的时间
  parent_reviewed_at TEXT,        -- 家长签字/认证时间
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 提取的词句表：每条一个词语 + 一句例句，家长审核通过后孩子可见
CREATE TABLE vocab_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,             -- 对应哪一天的听力
  word TEXT NOT NULL,             -- 词语
  sentence TEXT,                  -- 例句
  pos TEXT,                       -- 词性：成语/名词/动词/形容词
  approved INTEGER NOT NULL DEFAULT 0,  -- 0=待审，1=通过
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_vocab_date ON vocab_items(date);
