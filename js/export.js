/**
 * export.js — SheetJS Excel 匯出（本地下載）
 */

const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function getWeekday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return WEEKDAY_NAMES[d.getDay()];
}

/**
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate   YYYY-MM-DD
 */
async function exportToExcel(startDate, endDate) {
  const records = await getRecordsByRange(startDate, endDate);

  if (!records.length) {
    return { ok: false, message: '該日期範圍內沒有任何紀錄' };
  }

  const rows = [['日期', '星期', '體重 (kg)', '飲食紀錄', '運動項目', '運動筆記']];
  records.forEach(r => {
    rows.push([
      r.date,
      getWeekday(r.date),
      r.weight != null ? r.weight : '',
      r.notes  || '',
      (r.exerciseTypes || []).join('、'),
      r.exerciseNotes  || ''
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 欄寬
  ws['!cols'] = [
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 36 },
    { wch: 20 },
    { wch: 30 }
  ];

  // 標題列樣式（SheetJS 社群版僅支援有限樣式，設定粗體需 Pro，略過）
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '體重紀錄');

  const filename = `體重紀錄_${startDate}_${endDate}.xlsx`;
  XLSX.writeFile(wb, filename);

  return { ok: true, message: `已下載「${filename}」` };
}
