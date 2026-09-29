# 中文听力打卡网站（IB 中文 B HL）

家长给孩子用的私有小工具：家长上传听力音频（可选传文本 PDF），孩子按日期解锁、听、写感想、打卡，家长签字认证后孩子可看文本。

## 功能

- **听力库**：按日期排列，每天推送一条；今天高亮，过去可回看，未来锁定
- **孩子打卡**：听音频 → 打卡 + 写感想（可选）
- **家长签字**：密码进入管理页，上传音频 / 上传 PDF / 签字认证
- **看文本**：孩子打卡 + 家长签字后，才能看该条的文本 PDF 对照

## 技术栈

Cloudflare 全家桶，全免费额度内，容量几乎不受限：

| 层 | 选型 |
|---|---|
| 前端 | Cloudflare Pages（原生 HTML/CSS/JS，无构建） |
| API | Cloudflare Pages Functions |
| 文件 | Cloudflare R2（10GB 免费，零出口流量费），经 `/files` 代理读取 |
| 数据 | Cloudflare D1（SQLite） |

> 音频/PDF 通过 `/files/*` 代理从 R2 读取，**无需开启 R2 公开访问**，也无需配置 R2 公开域名。

## 目录结构

```
listening-app/
├── public/                 # 前端静态文件
│   ├── index.html          # 孩子主页
│   ├── admin.html          # 家长管理页
│   ├── style.css
│   ├── app.js
│   └── admin.js
├── functions/
│   ├── api/                # 后端 API
│   │   ├── episodes.js          # GET 列表 + POST 上传音频
│   │   ├── verify.js            # POST 校验密码
│   │   └── episodes/[date]/
│   │       ├── pdf.js           # POST 上传 PDF
│   │       ├── checkin.js       # POST 孩子打卡
│   │       └── review.js        # POST 家长签字
│   └── files/[[path]].js   # R2 文件代理（音频/PDF）
├── schema.sql              # D1 建表
├── wrangler.toml           # R2 / D1 绑定配置
└── package.json
```

## 部署步骤（一次性）

### 0. 前置

- 有 GitHub 账号和 Cloudflare 账号（R2 需先在控制台激活，可能要绑卡，免费额度内不收费）
- 本机装 Node.js ≥ 18，然后 `npm install -g wrangler`，`wrangler login`

### 1. 创建 R2 存储桶

```bash
wrangler r2 bucket create listening-audio
```

### 2. 创建 D1 数据库

```bash
wrangler d1 create listening-db
```

把输出里的 `database_id` 填进 `wrangler.toml`。建表：

```bash
wrangler d1 execute listening-db --remote --file=./schema.sql
```

### 3. 设置环境变量

在 Cloudflare 控制台 → Workers & Pages → 你的 Pages 项目 → Settings → Variables & Secrets，添加：

| 变量 | 类型 | 值 |
|---|---|---|
| `PARENT_PASSWORD` | Secret | 家长密码（自定义） |

> 本地开发时，在项目目录建 `.dev.vars` 文件写 `PARENT_PASSWORD=xxx`（已被 .gitignore 排除）。

### 4. 绑定 R2 和 D1 到 Pages

Cloudflare 控制台 → Pages 项目 → Settings → **Bindings**，添加：
- R2 bucket：绑定名 `R2`，选 `listening-audio`
- D1 database：绑定名 `DB`，选 `listening-db`

### 5. 建 GitHub 仓库并部署

1. 代码推 GitHub 仓库
2. Cloudflare 控制台 → Workers & Pages → Create → Pages → Connect to Git → 选仓库
3. 构建命令留空、输出目录 `public`
4. 部署后访问 `https://<项目名>.pages.dev`

## 本地开发

```bash
npm install
npm run dev   # wrangler pages dev public
```

本地需要 `wrangler.toml` 里 `database_id` 已填、R2/D1 已创建。`.dev.vars` 写 `PARENT_PASSWORD`。**本地 D1 是独立的，需单独建表**：

```bash
wrangler d1 execute listening-db --local --file=./schema.sql
```

## API 一览

| 方法 | 路径 | 作用 | 密码 |
|---|---|---|---|
| GET | `/api/episodes` | 列出所有听力 | 否 |
| POST | `/api/episodes` | 上传音频（FormData: date, title, file） | ✅ |
| POST | `/api/episodes/:date/pdf` | 上传文本 PDF | ✅ |
| POST | `/api/episodes/:date/checkin` | 孩子打卡（写感想） | 否 |
| POST | `/api/episodes/:date/review` | 家长签字认证 | ✅ |
| POST | `/api/verify` | 校验家长密码 | ✅ |
| GET | `/files/*` | R2 文件代理（音频/PDF） | 否 |

密码校验：请求头 `X-Parent-Password` 与 `PARENT_PASSWORD` 比对。
