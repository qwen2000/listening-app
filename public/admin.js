let password = '';
let existingMap = {}; // date -> { audio, pdf }，用于覆盖前二次确认
let currentWeekKey = null; // 检查打卡当前选中的周

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 计算某日期所在周的周一（YYYY-MM-DD）
function getWeekKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const diff = (dt.getDay() + 6) % 7;
  const monday = new Date(y, m - 1, d - diff);
  const mm = String(monday.getMonth() + 1).padStart(2, '0');
  const dd = String(monday.getDate()).padStart(2, '0');
  return `${monday.getFullYear()}-${mm}-${dd}`;
}

// 周一日期 -> "9/28-10/4"
function formatWeekRange(mondayStr) {
  const [y, m, d] = mondayStr.split('-').map(Number);
  const sunday = new Date(y, m - 1, d + 6);
  return `${m}/${d}-${sunday.getMonth() + 1}/${sunday.getDate()}`;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
  return `${m}月${d}日 ${wd}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function authHeaders(extra) {
  return Object.assign({ 'X-Parent-Password': password }, extra || {});
}

function showMsg(id, text, isErr) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'msg ' + (isErr ? 'err' : 'ok');
}

async function unlock() {
  const pw = document.getElementById('password').value.trim();
  if (!pw) {
    showMsg('lockMsg', '请输入密码', true);
    return;
  }
  const res = await fetch('/api/verify', {
    method: 'POST',
    headers: { 'X-Parent-Password': pw },
  });
  if (res.ok) {
    password = pw;
    document.getElementById('lock').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    document.getElementById('todayLabel').textContent = '已解锁';
    loadList();
    loadExistingDates();
  } else {
    showMsg('lockMsg', '密码错误', true);
  }
}

async function uploadAudio() {
  const date = document.getElementById('date').value;
  const title = document.getElementById('audioTitle').value.trim();
  const file = document.getElementById('audioFile').files[0];
  if (!date || !file) {
    showMsg('audioMsg', '请选择日期和音频文件', true);
    return;
  }
  if (existingMap[date] && existingMap[date].audio) {
    if (!confirm(`日期 ${date} 已有音频，确定覆盖吗？`)) return;
  }

  const form = new FormData();
  form.append('date', date);
  form.append('title', title);
  form.append('file', file);
  form.append('tags', document.getElementById('audioTags').value.trim());

  const btn = document.getElementById('uploadAudioBtn');
  btn.disabled = true;
  btn.textContent = '上传中…';
  try {
    const res = await fetch('/api/episodes', {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    if (res.ok) {
      showMsg('audioMsg', `已上传：${date}`, false);
      document.getElementById('audioFile').value = '';
      loadList();
      loadExistingDates();
    } else if (res.status === 401) {
      showMsg('audioMsg', '密码错误，请重新解锁', true);
    } else {
      showMsg('audioMsg', '上传失败', true);
    }
  } catch {
    showMsg('audioMsg', '网络错误', true);
  }
  btn.disabled = false;
  btn.textContent = '上传音频';
}

async function uploadPdf() {
  const date = document.getElementById('date').value;
  const file = document.getElementById('pdfFile').files[0];
  if (!date || !file) {
    showMsg('pdfMsg', '请选择日期和 PDF 文件', true);
    return;
  }
  if (existingMap[date] && existingMap[date].pdf) {
    if (!confirm(`日期 ${date} 已有文本，确定覆盖吗？`)) return;
  }

  const form = new FormData();
  form.append('file', file);

  const btn = document.getElementById('uploadPdfBtn');
  btn.disabled = true;
  btn.textContent = '上传中…';
  try {
    const res = await fetch(`/api/episodes/${date}/pdf`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    });
    if (res.ok) {
      showMsg('pdfMsg', `已上传文本：${date}`, false);
      document.getElementById('pdfFile').value = '';
      loadList();
      loadExistingDates();
    } else if (res.status === 401) {
      showMsg('pdfMsg', '密码错误，请重新解锁', true);
    } else {
      showMsg('pdfMsg', '上传失败', true);
    }
  } catch {
    showMsg('pdfMsg', '网络错误', true);
  }
  btn.disabled = false;
  btn.textContent = '上传 PDF';
}

async function loadList() {
  const res = await fetch('/api/review');
  const allEps = await res.json();
  const el = document.getElementById('reviewList');

  if (!allEps.length) {
    el.innerHTML = '<p class="muted">还没有任何听力</p>';
    document.getElementById('weekSelect').innerHTML = '';
    return;
  }

  // 按周分组，填充周下拉，默认当前周
  const weeks = new Map();
  for (const e of allEps) {
    const key = getWeekKey(e.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(e);
  }
  const thisWeekKey = getWeekKey(todayStr());
  if (!currentWeekKey || !weeks.has(currentWeekKey)) {
    currentWeekKey = thisWeekKey;
  }
  const sortedWeeks = [...weeks.keys()].sort((a, b) => b.localeCompare(a));
  document.getElementById('weekSelect').innerHTML = sortedWeeks.map((key) => `<option value="${key}" ${key === currentWeekKey ? 'selected' : ''}>${formatWeekRange(key)}</option>`).join('');

  const eps = currentWeekKey && weeks.has(currentWeekKey) ? weeks.get(currentWeekKey) : allEps;

  el.innerHTML = eps.map((e) => {
    const userRows = (e.users || []).map((u) => {
      const listened = u.listened ? '✅听' : '⬜听';
      const summarized = u.summarized ? '✅概述' : '⬜概述';
      let status;
      if (u.reviewed) {
        status = '<span class="badge reviewed-badge">已签字</span>';
      } else if (u.listened && u.summarized) {
        status = `<button class="btn secondary" data-review="${e.date}" data-user="${u.id}">签字</button>`;
      } else {
        status = '<span class="muted">未完成</span>';
      }
      return `
        <div class="user-row">
          <span class="user-name">${escapeHtml(u.name)}</span>
          <span class="user-status">${listened} ${summarized}</span>
          ${status}
        </div>
      `;
    }).join('');
    const tagsHtml = (e.tags || []).map((t) => `<span class="tag-chip" style="background:${escapeHtml(t.color)};color:#fff;">${escapeHtml(t.name)}</span>`).join('');
    const tagsStr = (e.tags || []).map((t) => t.name).join(', ');
    return `
      <div class="review-row" data-edit-row="${e.date}" data-title="${escapeHtml(e.title || '')}" data-tags="${escapeHtml(tagsStr)}">
        <div class="review-info">
          <div class="review-date">${formatDate(e.date)}${e.audioUrl ? '' : ' · ⚠️ 无音频'}</div>
          <div class="review-title"><span>${escapeHtml(e.title || '（无标题）')}</span> ${tagsHtml}</div>
          ${userRows || '<div class="review-summary">还没有用户</div>'}
        </div>
        <div style="flex-shrink:0;">
          <button class="btn secondary" data-edit-audio="${e.date}">编辑</button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('[data-review]').forEach((btn) => {
    btn.addEventListener('click', () => markReview(btn.dataset.review, btn.dataset.user, btn));
  });
  document.querySelectorAll('[data-edit-audio]').forEach((btn) => {
    btn.addEventListener('click', () => enterEditAudioMode(btn.dataset.editAudio));
  });
}

function enterEditAudioMode(date) {
  const row = document.querySelector(`[data-edit-row="${date}"]`);
  const title = row.dataset.title;
  const tags = row.dataset.tags;

  row.innerHTML = `
    <div class="review-info" style="flex:1;">
      <div class="review-date">${formatDate(date)}</div>
      <input type="text" class="edit-word-input" value="${escapeHtml(title)}" placeholder="标题">
      <input type="text" class="edit-word-input" style="margin-top:6px;width:100%;" value="${escapeHtml(tags)}" placeholder="标签（逗号分隔）">
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0;">
      <button class="btn" data-save-audio="${date}">保存</button>
      <button class="btn secondary" data-cancel-audio="${date}">取消</button>
    </div>
  `;

  row.querySelector('[data-save-audio]').addEventListener('click', () => saveAudioEdit(date));
  row.querySelector('[data-cancel-audio]').addEventListener('click', () => loadList());
}

async function saveAudioEdit(date) {
  const row = document.querySelector(`[data-edit-row="${date}"]`);
  const inputs = row.querySelectorAll('input');
  const title = inputs[0].value.trim();
  const tags = inputs[1].value.trim();
  const res = await fetch(`/api/episodes/${date}/update`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title, tags }),
  });
  if (res.ok) {
    loadList();
  } else if (res.status === 401) {
    alert('密码错误');
  } else {
    alert('保存失败');
  }
}

async function markReview(date, userId, btn) {
  btn.disabled = true;
  btn.textContent = '处理中…';
  const res = await fetch(`/api/episodes/${date}/review`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ user_id: userId }),
  });
  if (res.ok) {
    loadList();
  } else if (res.status === 401) {
    alert('密码错误，请重新解锁');
    btn.disabled = false;
    btn.textContent = '签字';
  } else {
    alert('操作失败');
    btn.disabled = false;
    btn.textContent = '签字';
  }
}

document.getElementById('unlockBtn').addEventListener('click', unlock);
document.getElementById('uploadAudioBtn').addEventListener('click', uploadAudio);
document.getElementById('uploadPdfBtn').addEventListener('click', uploadPdf);
document.getElementById('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') unlock();
});

// 默认日期填今天
document.getElementById('date').value = todayStr();
document.getElementById('todayLabel').textContent = `今天是 ${formatDate(todayStr())}`;
document.getElementById('date').addEventListener('change', loadDateStatus);
document.getElementById('weekSelect').addEventListener('change', (e) => {
  currentWeekKey = e.target.value;
  loadList();
});
loadDateStatus();

// ===== 用户管理 =====
document.getElementById('addUserBtn').addEventListener('click', addUser);

// ===== 词句提取与审核 =====
document.getElementById('extractFromTextBtn').addEventListener('click', extractFromText);
document.getElementById('localOcrBtn').addEventListener('click', localOcr);
document.getElementById('selectAllVocab').addEventListener('change', selectAllVocab);
document.getElementById('approveSelectedBtn').addEventListener('click', () => batchSelected('approve'));
document.getElementById('deleteSelectedBtn').addEventListener('click', () => batchSelected('delete'));

// 提取数量：记住上次输入
const savedCount = localStorage.getItem('vocabCount');
if (savedCount) {
  document.getElementById('vocabCount').value = savedCount;
}

// ===== 用户管理 =====
async function loadUsers() {
  const res = await fetch('/api/users');
  const users = await res.json();
  const el = document.getElementById('userList');
  if (!users.length) {
    el.innerHTML = '<p class="muted">还没有用户，先添加</p>';
    return;
  }
  el.innerHTML = users.map((u) => `<span class="tag-chip" style="background:#eef2f7;color:#333;">${escapeHtml(u.name)}</span>`).join('');
}

async function addUser() {
  const name = document.getElementById('newUserName').value.trim();
  if (!name) {
    alert('请输入用户名字');
    return;
  }
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  });
  if (res.ok) {
    document.getElementById('newUserName').value = '';
    loadUsers();
  } else if (res.status === 401) {
    alert('密码错误');
  } else {
    alert('添加失败');
  }
}

// ===== 标签建议 =====
async function loadTagSuggestions() {
  const res = await fetch('/api/tags');
  const tags = await res.json();
  const el = document.getElementById('tagSuggestions');
  if (!tags.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = tags.map((t) => `<span class="tag-chip" style="background:${escapeHtml(t.color)};color:#fff;cursor:pointer;" data-tag="${escapeHtml(t.name)}">${escapeHtml(t.name)}</span>`).join('');
  el.querySelectorAll('[data-tag]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const input = document.getElementById('audioTags');
      const existing = input.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
      if (!existing.includes(chip.dataset.tag)) {
        existing.push(chip.dataset.tag);
        input.value = existing.join(', ');
      }
    });
  });
}

// 标签管理（改颜色）
async function loadTagManage() {
  const res = await fetch('/api/tags');
  const tags = await res.json();
  const el = document.getElementById('tagManageList');
  if (!tags.length) {
    el.innerHTML = '<p class="muted">还没有标签</p>';
    return;
  }
  el.innerHTML = tags.map((t) => `
    <div class="user-row">
      <span class="tag-chip" style="background:${escapeHtml(t.color)};color:#fff;">${escapeHtml(t.name)}</span>
      <input type="color" value="${escapeHtml(t.color)}" data-color-id="${t.id}" style="width:36px;height:30px;border:none;padding:0;cursor:pointer;border-radius:4px;">
    </div>
  `).join('');
  el.querySelectorAll('[data-color-id]').forEach((input) => {
    input.addEventListener('change', async () => {
      const color = input.value;
      const id = input.dataset.colorId;
      const res = await fetch(`/api/tags/${id}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ color }),
      });
      if (res.ok) {
        loadTagManage();
        loadTagSuggestions();
      } else if (res.status === 401) {
        alert('密码错误');
      }
    });
  });
}

// 初始化：加载用户和标签
loadUsers();
loadTagSuggestions();
loadTagManage();

async function extractFromText() {
  const date = document.getElementById('date').value;
  const text = document.getElementById('pastedText').value.trim();
  if (!date) {
    showMsg('extractMsg', '请选择日期', true);
    return;
  }
  if (!text) {
    showMsg('extractMsg', '请先粘贴文字', true);
    return;
  }
  const btn = document.getElementById('extractFromTextBtn');
  btn.disabled = true;
  btn.textContent = '提取中…';
  showMsg('extractMsg', '正在提取词句…', false);
  try {
    const count = getVocabCount();
    localStorage.setItem('vocabCount', String(count));
    const res = await fetch(`/api/episodes/${date}/extract`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text, count }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showMsg('extractMsg', `提取到 ${data.count} 个词语，请在下面审核`, false);
      loadVocabList(date);
      loadPreview();
    } else if (res.status === 401) {
      showMsg('extractMsg', '密码错误', true);
    } else {
      const msg = data && data.error ? data.error : '提取失败';
      showMsg('extractMsg', msg, true);
    }
  } catch {
    showMsg('extractMsg', '网络错误', true);
  }
  btn.disabled = false;
  btn.textContent = '从粘贴文字提取词句';
}

async function localOcr() {
  const fileInput = document.getElementById('localOcrFile');
  const file = fileInput.files[0];
  if (!file) {
    showMsg('ocrMsg', '请先选择文件', true);
    return;
  }
  const btn = document.getElementById('localOcrBtn');
  const progressEl = document.getElementById('ocrProgress');
  const progressBar = document.getElementById('ocrProgressBar');
  btn.disabled = true;
  btn.textContent = '识别中…';
  progressEl.style.display = 'block';
  progressBar.style.width = '0%';
  showMsg('ocrMsg', '正在识别…', false);

  const pollTimer = setInterval(async () => {
    try {
      const pr = await fetch('http://127.0.0.1:8787/progress');
      const p = await pr.json();
      if (p && p.total > 0) {
        const pct = Math.round((p.done / p.total) * 100);
        progressBar.style.width = pct + '%';
        showMsg('ocrMsg', `识别中… ${p.done}/${p.total} 块（${pct}%）`, false);
      }
    } catch { /* 轮询失败忽略 */ }
  }, 1500);

  try {
    const res = await fetch('http://127.0.0.1:8787/ocr', {
      method: 'POST',
      body: file,
    });
    clearInterval(pollTimer);
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.text) {
      progressBar.style.width = '100%';
      document.getElementById('pastedText').value = data.text;
      showMsg('ocrMsg', `识别完成（${data.lines} 行），已填入下方框，点「从粘贴文字提取词句」`, false);
    } else {
      showMsg('ocrMsg', (data && data.error) || '识别失败', true);
    }
  } catch {
    clearInterval(pollTimer);
    showMsg('ocrMsg', '无法连接本地 OCR 服务，请先在电脑上运行 ocr_server.py', true);
  }
  btn.disabled = false;
  btn.textContent = '本地识别';
  setTimeout(() => { progressEl.style.display = 'none'; }, 2500);
}

async function loadVocabList(date) {
  const el = document.getElementById('vocabList');
  const res = await fetch(`/api/episodes/${date}/vocab`, { headers: authHeaders() });
  if (!res.ok) {
    el.innerHTML = '';
    return;
  }
  const items = await res.json();
  if (!items.length) {
    el.innerHTML = '<p class="muted">还没有词句，先点「提取词句」</p>';
    document.getElementById('vocabToolbar').style.display = 'none';
    return;
  }
  document.getElementById('vocabToolbar').style.display = 'flex';
  el.innerHTML = items.map((it) => `
    <div class="review-row" data-vocab-row="${it.id}" data-word="${escapeHtml(it.word)}" data-sentence="${escapeHtml(it.sentence || '')}" data-pos="${escapeHtml(it.pos || '')}">
      <input type="checkbox" class="vocab-check" data-id="${it.id}" ${it.approved ? 'checked disabled' : ''} style="flex-shrink:0;width:16px;height:16px;">
      <div class="review-info">
        <div class="review-title"><span>${escapeHtml(it.word)}</span> <span class="vocab-pos">${escapeHtml(it.pos || '')}</span></div>
        ${it.sentence ? `<div class="review-summary">${escapeHtml(it.sentence)}</div>` : ''}
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0;align-items:center;">
        <button class="btn secondary" data-editvocab="${it.id}">编辑</button>
        ${it.approved ? '<span class="badge reviewed-badge">已保留</span>' : ''}
      </div>
    </div>
  `).join('');

  el.querySelectorAll('[data-editvocab]').forEach((b) => {
    b.addEventListener('click', () => enterEditMode(b.dataset.editvocab, date));
  });
}

async function vocabAction(id, action, date) {
  const res = await fetch(`/api/episodes/${date}/vocab/${id}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action }),
  });
  if (res.ok) {
    loadVocabList(date);
  } else if (res.status === 401) {
    alert('密码错误');
  } else {
    alert('操作失败');
  }
}

function getVocabCount() {
  const n = parseInt(document.getElementById('vocabCount').value, 10);
  return n > 0 ? n : 20;
}

function selectAllVocab() {
  const checked = document.getElementById('selectAllVocab').checked;
  document.querySelectorAll('.vocab-check:not(:disabled)').forEach((cb) => {
    cb.checked = checked;
  });
}

function getSelectedVocabIds() {
  const ids = [];
  document.querySelectorAll('.vocab-check:checked:not(:disabled)').forEach((cb) => {
    ids.push(cb.dataset.id);
  });
  return ids;
}

async function batchSelected(action) {
  const ids = getSelectedVocabIds();
  if (!ids.length) {
    alert('请先勾选词语');
    return;
  }
  const date = document.getElementById('date').value;
  for (const id of ids) {
    const res = await fetch(`/api/episodes/${date}/vocab/${id}`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action }),
    });
    if (res.status === 401) {
      alert('密码错误');
      return;
    }
  }
  document.getElementById('selectAllVocab').checked = false;
  loadVocabList(date);
}

function enterEditMode(id, date) {
  const row = document.querySelector(`[data-vocab-row="${id}"]`);
  const word = row.dataset.word;
  const sentence = row.dataset.sentence;
  const pos = row.dataset.pos;

  row.innerHTML = `
    <div class="review-info" style="flex:1;">
      <div style="display:flex;gap:6px;align-items:center;">
        <input type="text" class="edit-word-input" value="${escapeHtml(word)}">
        <span class="vocab-pos">${escapeHtml(pos || '')}</span>
      </div>
      <textarea class="edit-sentence-input" placeholder="例句">${escapeHtml(sentence || '')}</textarea>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0;">
      <button class="btn" data-savevocab="${id}">保存</button>
      <button class="btn secondary" data-cancelvocab="${id}">取消</button>
    </div>
  `;

  row.querySelector('[data-savevocab]').addEventListener('click', () => saveVocabEdit(id, date));
  row.querySelector('[data-cancelvocab]').addEventListener('click', () => loadVocabList(date));
}

async function saveVocabEdit(id, date) {
  const row = document.querySelector(`[data-vocab-row="${id}"]`);
  const word = row.querySelector('.edit-word-input').value.trim();
  const sentence = row.querySelector('.edit-sentence-input').value.trim();
  if (!word) {
    alert('词不能为空');
    return;
  }
  const res = await fetch(`/api/episodes/${date}/vocab/${id}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action: 'edit', word, sentence }),
  });
  if (res.ok) {
    loadVocabList(date);
  } else if (res.status === 401) {
    alert('密码错误');
  } else {
    alert('保存失败');
  }
}

// 选音频文件后自动填标题（用文件名去掉扩展名，家长可再修改）
document.getElementById('audioFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const titleEl = document.getElementById('audioTitle');
  if (!titleEl.value.trim()) {
    titleEl.value = file.name.replace(/\.[^.]+$/, '');
  }
});

// 加载已有记录（用于上传前覆盖确认）
async function loadExistingDates() {
  const res = await fetch('/api/episodes');
  const eps = await res.json();
  existingMap = {};
  for (const e of eps) {
    existingMap[e.date] = { audio: !!e.audioUrl, pdf: !!e.pdfUrl };
  }
}

// 显示所选日期的状态（标题、是否有文档/提示词/词句）
async function loadDateStatus() {
  const date = document.getElementById('date').value;
  const el = document.getElementById('dateStatus');
  if (!date) {
    el.innerHTML = '';
    return;
  }
  const res = await fetch(`/api/episodes/${date}/status`);
  if (!res.ok) {
    el.innerHTML = '';
    return;
  }
  const s = await res.json();
  if (!s.hasAudio && !s.hasPdf && !s.hasHints && !s.hasVocab) {
    el.innerHTML = '<span class="muted">这个日期还没有内容</span>';
    return;
  }
  const parts = [];
  if (s.hasAudio) parts.push(`🎵 音频：${escapeHtml(s.title || '（无标题）')}`);
  parts.push(s.hasPdf ? '✅ 已有文档' : '❌ 无文档');
  parts.push(s.hasHints ? '✅ 已生成提示词' : '❌ 未生成提示词');
  parts.push(s.hasVocab ? '✅ 已提取词句' : '❌ 未提取词句');
  el.innerHTML = parts.join('<br>');
  loadPreview();
}

// 预览该日期的术语和概述提示词
async function loadPreview() {
  const date = document.getElementById('date').value;
  const el = document.getElementById('previewArea');
  if (!date) {
    el.innerHTML = '';
    return;
  }
  const [termsRes, hintsRes] = await Promise.all([
    fetch(`/api/episodes/${date}/terms`),
    fetch(`/api/episodes/${date}/summary-hints`),
  ]);
  const terms = await termsRes.json();
  const hints = await hintsRes.json();
  let html = '';
  if (terms.length) {
    html += '<div class="terms-title">📖 高频术语</div><div class="terms-list">' + terms.map((t) => `<span class="term-chip">${escapeHtml(t.word)}</span>`).join('') + '</div>';
  }
  if (hints.length) {
    html += '<div class="hints-title">✍️ 概述提示词</div><div class="terms-list">' + hints.map((h) => `<span class="term-chip">${escapeHtml(h)}</span>`).join('') + '</div>';
  }
  if (!html) {
    html = '<p class="muted">还没有提取内容</p>';
  }
  el.innerHTML = html;
}
