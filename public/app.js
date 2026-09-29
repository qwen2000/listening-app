const listEl = document.getElementById('list');
const todayLabelEl = document.getElementById('todayLabel');
const weekNavEl = document.getElementById('weekNav');
const todayBtn = document.getElementById('todayBtn');
const allBtn = document.getElementById('allBtn');

let allEpisodes = [];
let currentWeek = null; // null = 全部

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
  return `${m}月${d}日 ${wd}`;
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function load() {
  const res = await fetch('/api/episodes');
  if (!res.ok) {
    listEl.innerHTML = '<p class="empty">加载失败，请稍后再试</p>';
    return;
  }
  allEpisodes = await res.json();
  renderNav();
  renderList();
}

function renderNav() {
  const weeks = new Map();
  for (const e of allEpisodes) {
    const key = getWeekKey(e.date);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key).push(e);
  }
  const sorted = [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const thisWeekKey = getWeekKey(todayStr());

  if (!sorted.length) {
    weekNavEl.innerHTML = '<p class="muted" style="font-size:12px;">暂无内容</p>';
    return;
  }

  weekNavEl.innerHTML = sorted.map(([key, eps]) => {
    const done = eps.filter((e) => e.listenedAt && e.summarizedAt).length;
    const active = currentWeek === key ? 'active' : '';
    const current = key === thisWeekKey ? 'current' : '';
    return `<div class="week-nav-item ${active} ${current}" data-week="${key}">
      <span class="week-range">${formatWeekRange(key)}</span>
      <span class="week-progress">${done}/${eps.length}</span>
    </div>`;
  }).join('');

  weekNavEl.querySelectorAll('.week-nav-item').forEach((el) => {
    el.addEventListener('click', () => {
      currentWeek = el.dataset.week;
      renderNav();
      renderList();
    });
  });
}

function renderList() {
  const today = todayStr();
  todayLabelEl.textContent = `今天是 ${formatDate(today)}`;

  let eps = allEpisodes;
  if (currentWeek) {
    eps = allEpisodes.filter((e) => getWeekKey(e.date) === currentWeek);
  }

  if (!eps.length) {
    listEl.innerHTML = currentWeek
      ? '<p class="empty">这一周还没有听力</p>'
      : '<p class="empty">还没有听力，等家长上传吧。</p>';
    return;
  }

  const hasToday = eps.some((e) => e.date === today);
  let html = '';
  if (!hasToday && !currentWeek) {
    html += '<div class="notice">今天还没有听力，先复习之前的吧～</div>';
  }
  html += eps.map((e) => cardHtml(e, today)).join('');
  listEl.innerHTML = html;
  bindEvents();
  loadVocab();
}

function pdfArea(e, listened, summarized, reviewed) {
  if (!e.pdfUrl) return '';
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(e.pdfUrl);
  if (listened && summarized && reviewed) {
    const label = isImage ? '🖼️ 查看文本图片' : '📄 查看文本';
    return `<a class="pdf-link" href="${escapeHtml(e.pdfUrl)}" target="_blank" rel="noopener">${label}</a>`;
  }
  const steps = [];
  if (!listened) steps.push('已听');
  if (!summarized) steps.push('已概述');
  if (!reviewed) steps.push('家长签字');
  return `<p class="muted">完成 ${steps.join('、')} 后即可看文本</p>`;
}

function cardHtml(e, today) {
  const isToday = e.date === today;
  const isFuture = e.date > today;
  const listened = !!e.listenedAt;
  const summarized = !!e.summarizedAt;
  const reviewed = !!e.parentReviewedAt;
  const cls = isToday ? 'card today' : (isFuture ? 'card locked' : 'card');

  let body = '';
  if (isFuture) {
    body = `<p class="muted">🔒 未解锁，到 ${formatDate(e.date)} 才能听</p>`;
  } else if (e.audioUrl) {
    body = `
      <audio controls preload="none" src="${escapeHtml(e.audioUrl)}"></audio>
      <div class="checkin-row">
        ${listened
          ? '<span class="badge checked-badge">✅ 已听</span>'
          : `<button class="btn" data-action="listened" data-date="${e.date}">① 已听</button>`}
        ${summarized
          ? '<span class="badge checked-badge">✅ 已概述</span>'
          : `<button class="btn" data-action="summarized" data-date="${e.date}" ${listened ? '' : 'disabled'}>② 已概述</button>`}
      </div>
      ${pdfArea(e, listened, summarized, reviewed)}
      ${listened && summarized && reviewed && e.pdfUrl ? `<div class="vocab-area" data-vocab="${e.date}"></div>` : ''}
    `;
  } else {
    body = '<p class="muted">音频还没上传</p>';
  }

  return `
    <div class="${cls}">
      <div class="card-head">
        <span class="date">${formatDate(e.date)}</span>
        ${isToday ? '<span class="badge today-badge">今天</span>' : ''}
      </div>
      <h2 class="title">${escapeHtml(e.title || '（无标题）')}</h2>
      ${body}
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const date = btn.dataset.date;
      const action = btn.dataset.action;

      btn.disabled = true;
      btn.textContent = '处理中…';
      try {
        const res = await fetch(`/api/episodes/${date}/checkin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          load();
        } else {
          alert('操作失败，请重试');
          btn.disabled = false;
          btn.textContent = action === 'listened' ? '① 已听' : '② 已概述';
        }
      } catch {
        alert('网络错误');
        btn.disabled = false;
        btn.textContent = action === 'listened' ? '① 已听' : '② 已概述';
      }
    });
  });
}

async function loadVocab() {
  const areas = document.querySelectorAll('[data-vocab]');
  for (const el of areas) {
    const date = el.dataset.vocab;
    try {
      const res = await fetch(`/api/episodes/${date}/vocab`);
      if (!res.ok) { el.innerHTML = ''; continue; }
      const items = await res.json();
      if (!items || !items.length) { el.innerHTML = ''; continue; }
      el.innerHTML = '<h3 class="vocab-title">📝 重点词语和例句</h3>' + items.map((it) => `
        <div class="vocab-item">
          <span class="vocab-word">${escapeHtml(it.word)}</span>
          <span class="vocab-pos">${escapeHtml(it.pos || '')}</span>
          ${it.sentence ? `<span class="vocab-sentence">${escapeHtml(it.sentence)}</span>` : ''}
        </div>
      `).join('');
    } catch {
      el.innerHTML = '';
    }
  }
}

todayBtn.addEventListener('click', () => {
  currentWeek = getWeekKey(todayStr());
  renderNav();
  renderList();
});

allBtn.addEventListener('click', () => {
  currentWeek = null;
  renderNav();
  renderList();
});

load();
