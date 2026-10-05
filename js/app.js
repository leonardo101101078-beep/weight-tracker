/**
 * app.js — 主邏輯與事件綁定
 */

function todayStr() {
  return localDateStr();
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

// ─── 勾選項目設定（主頁與月曆共用） ───────────────────────

const CHIP_OPTIONS = {
  food: [
    { value: '健康組合', icon: '🥦', hint: '西蘭花/雞胸肉/水煮蛋' },
    { value: '高蛋白',   icon: '🥤' },
    { value: '蘋果',     icon: '🍎' },
    { value: '碳水',     icon: '🍚', hint: '飯/麵/麵包' },
    { value: '海苔片',   icon: '🌿' },
    { value: '垃圾食物', icon: '🍟', hint: '洋芋片' },
    { value: '菜飯',     icon: '🍱' },
  ],
  exercise: [
    { value: '重訓',   icon: '💪' },
    { value: '爬樓機', icon: '🏢' },
    { value: '游泳',   icon: '🏊' },
  ],
};

function renderChips(containerId, options) {
  const el = document.getElementById(containerId);
  el.innerHTML = options.map(o =>
    `<label class="chip"><input type="checkbox" value="${o.value}" /><span>${o.icon} ${o.value}` +
    (o.hint ? `<small class="chip-hint">${o.hint}</small>` : '') + '</span></label>'
  ).join('');
}

function getCheckedValues(containerId) {
  return [...document.querySelectorAll(`#${containerId} input:checked`)].map(cb => cb.value);
}

function setCheckedValues(containerId, values) {
  document.querySelectorAll(`#${containerId} input`).forEach(cb => {
    cb.checked = (values || []).includes(cb.value);
  });
}

/** 保留舊紀錄中已不在選項內的值（例如改版前的「跑步」），避免儲存時被覆蓋掉 */
function keepLegacyValues(oldValues, selected, options) {
  const legacy = (oldValues || []).filter(v => !options.some(o => o.value === v));
  return [...legacy, ...selected];
}

renderChips('food-chips', CHIP_OPTIONS.food);
renderChips('exercise-chips', CHIP_OPTIONS.exercise);
renderChips('cal-food-chips', CHIP_OPTIONS.food);
renderChips('cal-exercise-chips', CHIP_OPTIONS.exercise);

// ─── 配色切換 ─────────────────────────────────────────────

const THEME_BG = { green: '#0A1A10', navy: '#001F3E' };

function currentTheme() {
  return document.documentElement.dataset.theme === 'navy' ? 'navy' : 'green';
}

function applyTheme(theme) {
  if (theme === 'navy') document.documentElement.dataset.theme = 'navy';
  else delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]').content = THEME_BG[theme];
}

document.getElementById('theme-toggle').addEventListener('click', async () => {
  const next = currentTheme() === 'navy' ? 'green' : 'navy';
  applyTheme(next);
  try { localStorage.setItem('theme', next); } catch (e) {}
  resetWeightChart();
  renderWeightChart(await getLast7DaysRecords());
});

// ─── 連續戒糖日 ───────────────────────────────────────────
// 每天早上量體重時勾「昨日戒糖」，所以計數以昨天為最新一天，今天不計入。

/**
 * 從昨天往回數連續戒糖天數（含週末），中斷即歸零。
 * 昨天還沒勾不算中斷，從前天開始數。
 */
async function calcSugarStreak() {
  const records = await getAllRecords();
  const done = new Set(records.filter(r => r.sugarFree).map(r => r.date));

  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (!done.has(localDateStr(d))) d.setDate(d.getDate() - 1);

  let streak = 0;
  while (done.has(localDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

async function refreshSugar() {
  const [streak, yd] = await Promise.all([calcSugarStreak(), getRecord(yesterdayStr())]);
  document.getElementById('sugar-streak').textContent = streak;
  document.getElementById('sugar-yesterday').checked = !!yd?.sugarFree;
}

/** 最近 7 天（含今天）的紀錄，給七日圖用 */
function getLast7DaysRecords() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return getRecordsByRange(localDateStr(d), todayStr());
}

const MONTHS_EN = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const WEEKDAYS_EN = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} / ${MONTHS_EN[d.getMonth()]} / ${d.getFullYear()} / ${WEEKDAYS_EN[d.getDay()]}`;
}

// ─── 日期標頭渲染 ─────────────────────────────────────────

function renderDateHeader(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  document.getElementById('date-day').textContent = d.getDate();
  document.getElementById('date-month').textContent = MONTHS_EN[d.getMonth()];
  document.getElementById('date-year').textContent = d.getFullYear();
  document.getElementById('date-weekday').textContent = WEEKDAYS_EN[d.getDay()];
}

// ─── 初始化 ───────────────────────────────────────────────

async function init() {
  applyTheme(currentTheme());
  renderDateHeader(todayStr());

  const today = await getRecord(todayStr());
  if (today) {
    if (today.weight != null) document.getElementById('weight-input').value = today.weight;
    if (today.notes)          document.getElementById('notes-input').value  = today.notes;
    setCheckedValues('food-chips', today.foodTypes);
    loadExerciseUI(today.exerciseTypes || [], today.exerciseNotes || '');
  }

  const recent = await getLast7DaysRecords();
  renderWeightChart(recent);
  await refreshCompare();
  await refreshSugar();

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
  renderExerciseTags('yesterday-food', yd?.foodTypes);
  renderExerciseTags('yesterday-exercise', yd?.exerciseTypes);

  document.getElementById('today-weight').textContent =
    td?.weight != null ? `${td.weight} kg` : '—';
  document.getElementById('today-notes').textContent  = td?.notes || '';
  renderExerciseTags('today-food', td?.foodTypes);
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
  setCheckedValues('exercise-chips', types);
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
  await saveRecord(todayStr(), { weight: val });
  showFeedback('weight-feedback', '體重已儲存 ✓');
  const recent = await getLast7DaysRecords();
  renderWeightChart(recent);
  await refreshCompare();
  // 數字跳動動畫
  const todayWeightEl = document.getElementById('today-weight');
  animateCounter(todayWeightEl, prevWeight, val, 'kg');
});

// ─── 昨日戒糖（勾選即存） ─────────────────────────────────

document.getElementById('sugar-yesterday').addEventListener('change', async e => {
  await saveRecord(yesterdayStr(), { sugarFree: e.target.checked });
  await refreshSugar();
});

// ─── 儲存飲食 ─────────────────────────────────────────────

document.getElementById('save-notes-btn').addEventListener('click', async () => {
  const notes     = document.getElementById('notes-input').value.trim();
  const foodTypes = getCheckedValues('food-chips');
  await saveRecord(todayStr(), { notes, foodTypes });
  showFeedback('notes-feedback', '飲食紀錄已儲存 ✓');
  await refreshCompare();
});

// ─── 儲存運動 ─────────────────────────────────────────────

document.getElementById('save-exercise-btn').addEventListener('click', async () => {
  const old   = await getRecord(todayStr());
  const types = keepLegacyValues(old?.exerciseTypes, getCheckedValues('exercise-chips'), CHIP_OPTIONS.exercise);
  const notes = document.getElementById('exercise-notes').value.trim();
  await saveRecord(todayStr(), { exerciseTypes: types, exerciseNotes: notes });
  showFeedback('exercise-feedback', '運動紀錄已儲存 ✓');
  await refreshCompare();
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

    if (_calRecordMap[dateStr]?.sugarFree) cell.classList.add('sugar');

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
  document.getElementById('cal-sugar').checked = !!rec.sugarFree;
  setCheckedValues('cal-food-chips', rec.foodTypes);
  setCheckedValues('cal-exercise-chips', rec.exerciseTypes);
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
  const sugarFree     = document.getElementById('cal-sugar').checked;
  const foodTypes     = getCheckedValues('cal-food-chips');
  const exerciseTypes = keepLegacyValues(_calRecordMap[_calSelected]?.exerciseTypes,
                                         getCheckedValues('cal-exercise-chips'), CHIP_OPTIONS.exercise);
  const exerciseNotes = document.getElementById('cal-exercise-notes').value.trim();

  await saveRecord(_calSelected, { weight, notes, sugarFree, foodTypes, exerciseTypes, exerciseNotes });

  // 更新快取並重繪
  const updated = await getRecord(_calSelected);
  _calRecordMap[_calSelected] = updated;
  await renderCalendar();

  showFeedback('cal-feedback', '已儲存 ✓');

  // 無條件刷新主頁面圖表與對比（任何日期的體重變動都影響七日趨勢）
  const recent = await getLast7DaysRecords();
  renderWeightChart(recent);
  await refreshCompare();
  await refreshSugar();

  // 若編輯的是今天，同步主頁面輸入欄位
  if (_calSelected === todayStr()) {
    if (weight != null) document.getElementById('weight-input').value = weight;
    document.getElementById('notes-input').value = notes;
    setCheckedValues('food-chips', foodTypes);
    loadExerciseUI(exerciseTypes, exerciseNotes);
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
