/**
 * chart-render.js — Chart.js 七日折線圖
 */

let _chartInstance = null;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

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
    days.push(d.toISOString().slice(0, 10));
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
  records.forEach(r => { recordMap[r.date] = r.weight ?? null; });

  const labels  = days.map(formatChartDate);
  const data    = days.map(d => recordMap[d] ?? null);
  const hasData = data.some(v => v !== null);

  if (_chartInstance) {
    _chartInstance.data.labels = labels;
    _chartInstance.data.datasets[0].data = data;
    _chartInstance.update('active');
    return;
  }

  _chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '體重 (kg)',
        data,
        borderColor: '#4ADE80',
        backgroundColor: 'rgba(74,222,128,0.08)',
        pointBackgroundColor: '#4ADE80',
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
            label: ctx => ctx.parsed.y !== null ? `${ctx.parsed.y} kg` : '無資料'
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: 'rgba(240,255,244,0.4)' }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.06)' },
          ticks: {
            font: { size: 11 },
            color: 'rgba(240,255,244,0.4)',
            callback: v => `${v}`
          },
          title: {
            display: true,
            text: 'kg',
            color: 'rgba(240,255,244,0.35)',
            font: { size: 10 }
          },
          suggestedMin: hasData ? undefined : 50,
          suggestedMax: hasData ? undefined : 80,
          grace: '5%',
        }
      }
    }
  });
}
