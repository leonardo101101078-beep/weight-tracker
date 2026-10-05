/**
 * chart-render.js — Chart.js 七日折線圖
 */

let _chartInstance = null;

/** 從 CSS 變數讀主色，配色切換後由 resetWeightChart() 重建圖表 */
function chartColor(varName) {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/** 戒糖日整欄底色（chart.$sugarDays = 日期索引陣列） */
const sugarColumnsPlugin = {
  id: 'sugarColumns',
  beforeDatasetsDraw(chart) {
    const idxs = chart.$sugarDays || [];
    if (!idxs.length) return;
    const { ctx, chartArea, scales: { x } } = chart;
    const half = (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
    ctx.save();
    ctx.fillStyle = `rgba(${chartColor('--accent2-rgb')},0.18)`;
    idxs.forEach(i => {
      const cx = x.getPixelForValue(i);
      const left = Math.max(cx - half + 2, chartArea.left);   // 留 4px 縫，相鄰戒糖日仍分得開
      const right = Math.min(cx + half - 2, chartArea.right);
      ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
    });
    ctx.restore();
  }
};

function resetWeightChart() {
  if (_chartInstance) { _chartInstance.destroy(); _chartInstance = null; }
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function roundWeightValue(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function formatWeightValue(value) {
  const rounded = roundWeightValue(value);
  if (rounded == null) return '無資料';
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatChartDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

/**
 * 產生最近 7 天的日期清單（含無資料的空格）
 * @returns {string[]} YYYY-MM-DD 陣列，最舊 → 最新
 */
function getLast7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(localDateStr(d));
  }
  return days;
}

/**
 * @param {Array<{date:string, weight?:number}>} records
 */
function renderWeightChart(records) {
  const ctx = document.getElementById('weight-chart');
  if (!ctx) return;

  const days = getLast7Days();
  const recordMap = {};
  const sugarSet  = new Set();
  records.forEach(r => {
    recordMap[r.date] = roundWeightValue(r.weight);
    if (r.sugarFree) sugarSet.add(r.date);
  });

  const labels    = days.map(d => formatChartDate(d) + (sugarSet.has(d) ? '✓' : ''));
  const sugarDays = days.map((d, i) => sugarSet.has(d) ? i : -1).filter(i => i >= 0);
  const data    = days.map(d => recordMap[d] ?? null);
  const hasData = data.some(v => v !== null);

  if (_chartInstance) {
    _chartInstance.data.labels = labels;
    _chartInstance.data.datasets[0].data = data;
    _chartInstance.$sugarDays = sugarDays;
    _chartInstance.update('active');
    return;
  }

  _chartInstance = new Chart(ctx, {
    type: 'line',
    plugins: [sugarColumnsPlugin],
    data: {
      labels,
      datasets: [{
        label: '體重 (kg)',
        data,
        borderColor: chartColor('--green'),
        backgroundColor: `rgba(${chartColor('--accent-rgb')},0.08)`,
        pointBackgroundColor: chartColor('--green'),
        pointRadius: 5,
        pointHoverRadius: 7,
        borderWidth: 2.5,
        tension: 0.3,
        fill: true,
        spanGaps: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ctx.parsed.y !== null ? `${formatWeightValue(ctx.parsed.y)} kg` : '無資料'
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: chartColor('--text-light') }
        },
        y: {
          grid: { color: chartColor('--glass-border') },
          ticks: {
            font: { size: 11 },
            color: chartColor('--text-light'),
            callback: v => formatWeightValue(v)
          },
          title: {
            display: true,
            text: 'kg',
            color: chartColor('--text-light'),
            font: { size: 10 }
          },
          suggestedMin: hasData ? undefined : 50,
          suggestedMax: hasData ? undefined : 80,
          grace: '5%',
        }
      }
    }
  });
  _chartInstance.$sugarDays = sugarDays;
  _chartInstance.update('none');
}
