-- 听力打卡表（多用户 + tag + LLM 词句，开发阶段重建版，重跑会清空数据）
DROP TABLE IF EXISTS episodes;
DROP TABLE IF EXISTS vocab_items;
DROP TABLE IF EXISTS terms;
DROP TABLE IF EXISTS summary_hints;
DROP TABLE IF EXISTS checkins;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS episode_tags;

-- 用户
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 音频条目（打卡和签字都拆到 checkins）
CREATE TABLE episodes (
  date TEXT PRIMARY KEY,          -- 'YYYY-MM-DD'，唯一，按日期解锁的关键
  title TEXT NOT NULL DEFAULT '',
  audio_key TEXT,
  pdf_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 打卡（每个用户对每个日期一条，含该用户的家长签字）
CREATE TABLE checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  listened_at TEXT,
  summarized_at TEXT,
  parent_reviewed_at TEXT,        -- 该用户的家长签字时间
  UNIQUE(date, user_id)
);

-- tag（颜色 hash 生成，同一 tag 固定颜色）
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT
);

-- 音频-tag 关联（一个音频多个 tag）
CREATE TABLE episode_tags (
  episode_date TEXT NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (episode_date, tag_id)
);

-- 术语（LLM 提取，孩子听之前看，不需要审核）
CREATE TABLE terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  word TEXT NOT NULL,
  pinyin TEXT,
  meaning TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 概述提示词（LLM 提取，孩子「已听」后看，用于提示写概述）
CREATE TABLE summary_hints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  word TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 词句（LLM 提取重点词句，家长审核通过后孩子可见；不含术语）
CREATE TABLE vocab_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  word TEXT NOT NULL,
  sentence TEXT,
  pos TEXT,
  pinyin TEXT,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
