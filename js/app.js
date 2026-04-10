/**
 * app.js — 主邏輯與事件綁定
 */

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日　${WEEKDAY_NAMES[d.getDay()]}`;
}

// ─── 初始化 ───────────────────────────────────────────────

async function init() {
  document.getElementById('today-date').textContent = formatDate(todayStr());

  const today = await getRecord(todayStr());
  if (today) {
    if (today.weight != null) document.getElementById('weight-input').value = today.weight;
    if (today.notes)          document.getElementById('notes-input').value  = today.notes;
    loadExerciseUI(today.exerciseTypes || [], today.exerciseNotes || '');
  }

  const recent = await getRecentRecords(7);
  renderWeightChart(recent);
  await refreshCompare();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  const now = new Date();
  const firstDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  document.getElementById('export-start').value = firstDay;
  document.getElementById('export-end').value   = todayStr();
}

// ─── 體重對比 ─────────────────────────────────────────────

function renderExerciseTags(elId, types) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = '';
  (types || []).forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'compare-exercise-tag';
    tag.textContent = t;
    el.appendChild(tag);
  });
}

async function refreshCompare() {
  const [yd, td] = await Promise.all([getRecord(yesterdayStr()), getRecord(todayStr())]);

  document.getElementById('yesterday-weight').textContent =
    yd?.weight != null ? `${yd.weight} kg` : '—';
  document.getElementById('yesterday-notes').textContent  = yd?.notes || '';
  renderExerciseTags('yesterday-exercise', yd?.exerciseTypes);

  document.getElementById('today-weight').textContent =
    td?.weight != null ? `${td.weight} kg` : '—';
  document.getElementById('today-notes').textContent  = td?.notes || '';
  renderExerciseTags('today-exercise', td?.exerciseTypes);

  const diffEl = document.getElementById('weight-diff');
  if (yd?.weight != null && td?.weight != null) {
    const diff = (td.weight - yd.weight).toFixed(1);
    if (diff > 0) {
      diffEl.textContent = `▲ 較昨日增加 ${diff} kg`;
      diffEl.className = 'weight-diff up';
    } else if (diff < 0) {
      diffEl.textContent = `▼ 較昨日減少 ${Math.abs(diff)} kg`;
      diffEl.className = 'weight-diff down';
    } else {
      diffEl.textContent = '與昨日持平';
      diffEl.className = 'weight-diff same';
    }
  } else {
    diffEl.textContent = '';
    diffEl.className = 'weight-diff';
  }
}

// ─── Feedback 提示 ────────────────────────────────────────

function showFeedback(elId, msg, type = 'success') {
  const el = document.getElementById(elId);
  el.textContent = msg;
  el.className = `feedback ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'feedback'; }, 2500);
}

// ─── 運動 UI ─────────────────────────────────────────────

function loadExerciseUI(types, notes) {
  document.querySelectorAll('#exercise-section .chip input').forEach(cb => {
    cb.checked = types.includes(cb.value);
  });
  document.getElementById('exercise-notes').value = notes;
}

// ─── 儲存體重 ─────────────────────────────────────────────

document.getElementById('save-weight-btn').addEventListener('click', async () => {
  const val = parseFloat(document.getElementById('weight-input').value);
  if (isNaN(val) || val < 20 || val > 300) {
    showFeedback('weight-feedback', '請輸入有效體重（20–300 kg）', 'error');
    return;
  }
  const prevWeight = parseFloat(document.getElementById('today-weight').textContent) || val;
  await saveRecord(todayStr(), val);
  showFeedback('weight-feedback', '體重已儲存 ✓');
  const recent = await getRecentRecords(7);
  renderWeightChart(recent);
  await refreshCompare();
  // 數字跳動動畫
  const todayWeightEl = document.getElementById('today-weight');
  animateCounter(todayWeightEl, prevWeight, val, 'kg');
});

// ─── 儲存飲食 ─────────────────────────────────────────────

document.getElementById('save-notes-btn').addEventListener('click', async () => {
  const notes = document.getElementById('notes-input').value.trim();
  await saveRecord(todayStr(), undefined, notes);
  showFeedback('notes-feedback', '飲食紀錄已儲存 ✓');
  await refreshCompare();
});

// ─── 儲存運動 ─────────────────────────────────────────────

document.getElementById('save-exercise-btn').addEventListener('click', async () => {
  const types = [...document.querySelectorAll('#exercise-section .chip input:checked')].map(cb => cb.value);
  const notes = document.getElementById('exercise-notes').value.trim();
  await saveRecord(todayStr(), undefined, undefined, types, notes);
  showFeedback('exercise-feedback', '運動紀錄已儲存 ✓');
});

// ─── Modal 開關 ───────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.getElementById('overlay').classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.getElementById('overlay').classList.add('hidden');
}

document.getElementById('overlay').addEventListener('click', () => {
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
  document.getElementById('overlay').classList.add('hidden');
});

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.modal));
});

// ─── 月曆 ─────────────────────────────────────────────────

let _calYear, _calMonth, _calRecordMap = {}, _calSelected = null;

async function openCalendar() {
  const now = new Date();
  _calYear  = now.getFullYear();
  _calMonth = now.getMonth() + 1;
  _calSelected = null;
  document.getElementById('cal-edit-panel').classList.add('hidden');
  await renderCalendar();
  openModal('history-modal');
}

async function renderCalendar() {
  const records = await getRecordsByMonth(_calYear, _calMonth);
  _calRecordMap = {};
  records.forEach(r => { _calRecordMap[r.date] = r; });

  document.getElementById('cal-title').textContent = `${_calYear}年${_calMonth}月`;

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDay = new Date(_calYear, _calMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(_calYear, _calMonth, 0).getDate();
  const today = todayStr();

  // 空白格（月份第一天前）
  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day empty';
    grid.appendChild(blank);
  }

  // 日期格
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${_calYear}-${String(_calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (dateStr === today)         cell.classList.add('today');
    if (dateStr === _calSelected)  cell.classList.add('selected');

    cell.textContent = d;

    if (_calRecordMap[dateStr]) {
      const dot = document.createElement('div');
      dot.className = 'cal-dot';
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => selectCalDay(dateStr));
    grid.appendChild(cell);
  }
}

async function selectCalDay(dateStr) {
  _calSelected = dateStr;

  // 重繪格子（更新 selected 狀態）
  await renderCalendar();

  const rec = _calRecordMap[dateStr] || {};
  const panel = document.getElementById('cal-edit-panel');
  panel.classList.remove('hidden');

  document.getElementById('cal-edit-date').textContent = formatDate(dateStr);
  document.getElementById('cal-weight-input').value = rec.weight != null ? rec.weight : '';
  document.getElementById('cal-notes-input').value  = rec.notes || '';

  const types = rec.exerciseTypes || [];
  document.querySelectorAll('#cal-exercise-chips input').forEach(cb => {
    cb.checked = types.includes(cb.value);
  });
  document.getElementById('cal-exercise-notes').value = rec.exerciseNotes || '';

  document.getElementById('cal-feedback').textContent = '';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('cal-prev').addEventListener('click', async () => {
  _calMonth--;
  if (_calMonth < 1) { _calMonth = 12; _calYear--; }
  _calSelected = null;
  document.getElementById('cal-edit-panel').classList.add('hidden');
  await renderCalendar();
});

document.getElementById('cal-next').addEventListener('click', async () => {
  _calMonth++;
  if (_calMonth > 12) { _calMonth = 1; _calYear++; }
  _calSelected = null;
  document.getElementById('cal-edit-panel').classList.add('hidden');
  await renderCalendar();
});

// 儲存月曆編輯
document.getElementById('cal-save-btn').addEventListener('click', async () => {
  if (!_calSelected) return;

  const wVal = document.getElementById('cal-weight-input').value;
  const weight = wVal !== '' ? parseFloat(wVal) : undefined;
  if (weight !== undefined && (isNaN(weight) || weight < 20 || weight > 300)) {
    showFeedback('cal-feedback', '請輸入有效體重（20–300 kg）', 'error');
    return;
  }

  const notes         = document.getElementById('cal-notes-input').value.trim();
  const exerciseTypes = [...document.querySelectorAll('#cal-exercise-chips input:checked')].map(cb => cb.value);
  const exerciseNotes = document.getElementById('cal-exercise-notes').value.trim();

  await saveRecord(_calSelected, weight, notes, exerciseTypes, exerciseNotes);

  // 更新快取並重繪
  const updated = await getRecord(_calSelected);
  _calRecordMap[_calSelected] = updated;
  await renderCalendar();

  showFeedback('cal-feedback', '已儲存 ✓');

  // 若編輯的是今天，同步主頁面
  if (_calSelected === todayStr()) {
    if (weight != null) {
      document.getElementById('weight-input').value = weight;
      const recent = await getRecentRecords(7);
      renderWeightChart(recent);
    }
    document.getElementById('notes-input').value = notes;
    loadExerciseUI(exerciseTypes, exerciseNotes);
    await refreshCompare();
  }
});

document.getElementById('history-btn').addEventListener('click', openCalendar);

// ─── 導出記錄 Modal ───────────────────────────────────────

document.getElementById('export-btn').addEventListener('click', () => {
  openModal('export-modal');
});

document.getElementById('download-btn').addEventListener('click', async () => {
  const start = document.getElementById('export-start').value;
  const end   = document.getElementById('export-end').value;

  if (!start || !end) {
    showFeedback('export-feedback', '請選擇開始與結束日期', 'error');
    return;
  }
  if (start > end) {
    showFeedback('export-feedback', '開始日期不能晚於結束日期', 'error');
    return;
  }

  const result = await exportToExcel(start, end);
  showFeedback('export-feedback', result.message, result.ok ? 'success' : 'error');
});

// ─── 滾動視差動畫（IntersectionObserver） ─────────────────

function initScrollAnimations() {
  // 頁面剛載入時，已在視窗內的卡片立即顯示（不等 IntersectionObserver 延遲）
  const initiallyVisible = new Set();
  document.querySelectorAll('.card').forEach(card => {
    const rect = card.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      card.classList.add('visible');
      initiallyVisible.add(card);
    }
  });

  // 視窗外的卡片在滾動進入時再淡入
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !initiallyVisible.has(entry.target)) {
        entry.target.classList.add('visible');
      }
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.card').forEach(card => {
    if (!initiallyVisible.has(card)) observer.observe(card);
  });
}

// ─── 按鈕漣漪效果 ─────────────────────────────────────────

function addRipple(e) {
  const btn = e.currentTarget;
  const circle = document.createElement('span');
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  circle.className = 'ripple';
  circle.style.cssText = `
    width:${size}px; height:${size}px;
    left:${e.clientX - rect.left - size/2}px;
    top:${e.clientY - rect.top - size/2}px;
  `;
  btn.appendChild(circle);
  circle.addEventListener('animationend', () => circle.remove());
}

document.querySelectorAll('.btn-primary, .btn-secondary').forEach(btn => {
  btn.addEventListener('click', addRipple);
});

// ─── 數字跳動動畫 ─────────────────────────────────────────

function animateCounter(el, from, to, unit = '') {
  if (from === to) return;
  const duration = 600;
  const start = performance.now();
  const diff = to - from;
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const val = (from + diff * eased).toFixed(1);
    el.textContent = val + (unit ? ' ' + unit : '');
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── 啟動 ─────────────────────────────────────────────────
init();
initScrollAnimations();
