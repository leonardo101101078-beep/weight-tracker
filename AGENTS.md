# 自律有力貓

## 專案定位

行動優先的離線 PWA，讓使用者每天快速記錄體重、戒糖、飲食與運動。全部資料存在本機 IndexedDB，無後端伺服器，可安裝至手機主畫面並完整離線使用。

---

## 技術架構

- **語言**：純 Vanilla JavaScript (ES6+)、HTML5、CSS3，無框架依賴
- **本地儲存**：IndexedDB（透過 Promise 封裝的非同步 API）
- **離線能力**：Service Worker，本站檔案 Network First、CDN Cache First，快取版本 `weight-tracker-v11`
- **圖表**：Chart.js 4.4.0（CDN）
- **Excel 匯出**：SheetJS XLSX 0.20.3（本機 `js/vendor/xlsx.full.min.js`，官方 cdn.sheetjs.com 下載）

---

## 資料夾結構

```
自律有力貓/
├── index.html              主頁面（所有 UI markup）
├── manifest.json           PWA 設定（名稱、圖示、主題色）
├── sw.js                   Service Worker（Network First / CDN Cache First）
├── css/
│   └── style.css           CSS 設計系統（Glassmorphism、變數）
├── js/
│   ├── app.js              主邏輯、事件綁定、畫面渲染
│   ├── db.js               IndexedDB 封裝（唯一資料層）
│   ├── chart-render.js     Chart.js 七日折線圖
│   ├── export.js           Excel 匯出（SheetJS）
│   └── vendor/xlsx.full.min.js  SheetJS 0.20.3
└── icons/
    ├── favicon.png
    ├── icon-192.png
    ├── icon-512.png
    └── generate-icons.html （圖示產生工具，非執行時檔案）
```

---

## 各模組職責

### `js/db.js` — 資料層（IndexedDB 封裝）

所有資料操作都在此，其他模組只能透過這些函式存取資料庫。

| 函式 | 說明 |
|---|---|
| `openDB()` | 開啟或取得 DB 連線（singleton，懶初始化） |
| `localDateStr(d?)` | 本地時區 YYYY-MM-DD（勿用 `toISOString`，UTC+8 早上會變前一天） |
| `saveRecord(date, fields)` | Upsert：`fields` 物件中 `!== undefined` 的欄位才寫入，其餘保留 |
| `getRecord(date)` | 取得單筆紀錄，不存在回傳 `null` |
| `getRecentRecords(days)` | 取最近 N 筆（用 `prev` cursor 倒序，最後 reverse） |
| `getRecordsByMonth(year, month)` | 取指定月份所有紀錄 |
| `getRecordsByRange(startDate, endDate)` | 取日期區間紀錄（IDBKeyRange.bound） |
| `getAllRecords()` | 取所有紀錄並依日期排序 |

**資料 Schema（每筆紀錄）：**
```js
{
  date: "2026-05-06",            // 主鍵，YYYY-MM-DD
  weight: 70.5,                   // 選填，kg（float）
  sugarFree: true,                // 選填，當日是否戒糖
  foodTypes: ["高蛋白","蘋果"],   // 選填，飲食勾選項目
  notes: "飲食備註",              // 選填，字串
  exerciseTypes: ["重訓","游泳"], // 選填，字串陣列（可能含改版前的舊項目，如「跑步」）
  exerciseNotes: "30分鐘"         // 選填，字串
}
```

---

### `js/app.js` — 主邏輯

啟動流程（`init()`）：
1. 渲染今日日期標頭
2. 從 DB 載入今日紀錄並填入表單
3. 取最近 7 筆渲染折線圖
4. 顯示今昨對比、連續戒糖日（`refreshSugar()`）

七日圖資料一律用 `getLast7DaysRecords()`（最近 7 個日曆天的區間查詢）。
5. 註冊 Service Worker
6. 設定 Excel 匯出預設日期區間

關鍵事件：
- **昨日戒糖**：每天早上勾選昨天，`saveRecord(yesterdayStr(), { sugarFree })`，重算計數
- **儲存體重**：驗證 20–300 kg 範圍，`saveRecord(date, { weight })`，刷新圖表與對比，執行計數器動畫
- **儲存飲食**：`saveRecord(date, { notes, foodTypes })`
- **儲存運動**：`saveRecord(date, { exerciseTypes, exerciseNotes })`，經 `keepLegacyValues()` 保留不在現行選項中的舊值
- **配色切換**：`#theme-toggle` 切換 `html[data-theme="navy"]`，存 localStorage `theme`，重建圖表
- **月曆**：`openCalendar()` → `renderCalendar()` → `selectCalDay()` → `cal-save-btn` 儲存並同步主頁

勾選項目：`CHIP_OPTIONS.food`（7 項）/ `CHIP_OPTIONS.exercise`（重訓/爬樓機/游泳），由 `renderChips()` 產生主頁與月曆 chip，改選項只改這裡。

連續戒糖日 `calcSugarStreak()`：從昨天往回數連續 `sugarFree` 天數（含週末、跨週累積、無上限），中斷即歸零；今天不計入；昨天未勾不算中斷（從前天起算）。顯示為「N 天」。

月曆：戒糖日格子加 `.cal-day.sugar`（底色 + 右上角 ✓），下方有圖例；`.cal-dot` 只代表「有紀錄」。

輔助函式：
- `animateCounter(el, from, to, unit)` — 600ms ease-out cubic 計數器動畫（`requestAnimationFrame`）
- `addRipple(e)` — 按鈕波紋效果
- `initScrollAnimations()` — IntersectionObserver 卡片淡入
- `showFeedback(elId, msg, type)` — 顯示 2.5s 後自動消失的提示訊息

---

### `js/chart-render.js` — 折線圖

- 固定顯示「最近 7 天」（含無資料日，以 `null` 呈現空格）
- `spanGaps: false`，斷開的日子不連線
- 重複呼叫時更新現有 instance 而非重建（避免 flicker）
- 顏色：從 CSS 變數 `--green` / `--accent-rgb` 讀取；切換配色時 `resetWeightChart()` 後重繪
- 戒糖日：x 軸日期加 ✓，`sugarColumnsPlugin` 依 `chart.$sugarDays`（日期索引）畫整欄底色 `rgba(--accent2-rgb, .18)`

---

### `js/export.js` — Excel 匯出

- 呼叫 `getRecordsByRange(start, end)` 取資料
- SheetJS `aoa_to_sheet` 將陣列轉成試算表
- 欄位：日期、星期、體重、戒糖、飲食項目、飲食紀錄、運動項目、運動筆記
- 輸出檔名：`體重紀錄_YYYY-MM-DD_YYYY-MM-DD.xlsx`

---

### `sw.js` — Service Worker

```
快取名稱：weight-tracker-v11
本站檔案：Network First（線上拿最新並更新快取，離線回退快取 → index.html）
CDN（Chart.js）：Cache First
```

安裝時預快取本地靜態資源與 Chart.js。啟動時刪除非當前 `CACHE_NAME` 的快取。
不再使用 `?v=` 查詢字串；一般改動無需改版本號。

---

## UI 設計系統（`css/style.css`）

**主題：暗色 Glassmorphism，兩套配色**
- 預設綠：`:root`
- 海軍藍：`[data-theme="navy"]`，背景 `#001F3E`/`#073358`，主色黃 `#FFD716`，輔色綠 `#0DA574`（戒糖日底色）
- 顏色一律走 CSS 變數（`--accent-rgb`、`--bg-rgb`、`--input-bg`、`--scheme` 等），勿寫死；圖表顏色也從變數讀取；變數名 `--green*` 代表主色

```css
/* 主要 CSS 變數 */
--bg-base: #0A1A10        /* 最深背景 */
--green:   #4ADE80        /* 主色 */
--text:    #F0FFF4        /* 主文字色 */
```

**核心元件：**
- **Glass Card**：`background: rgba(255,255,255,0.05)` + `backdrop-filter: blur(20px)`，hover 時綠色邊框發光
- **Primary Button**：實心綠底，active 時 `scale(0.94)`，含波紋效果
- **Exercise Chip**：checkbox 觸發，選中時 `scale(1.05)` + 綠色背景
- **Modal**：從底部滑入，`max-height: 88vh`，頂部圓角 24px
- **Bottom Tab Bar**：fixed 底部，毛玻璃背景，兩個頁籤（歷史 / 匯出）

**動畫：**
- 葉片裝飾：6–8s 無限浮動
- 卡片淡入：0.55s `cubic-bezier(0.22, 1, 0.36, 1)`，staggered 0.05–0.33s
- Chip 選中：0.2s `cubic-bezier(0.34, 1.56, 0.64, 1)`（彈跳感）
- Modal 滑入：0.35s `ease-out`

---

## PWA 設定（`manifest.json`）

```json
{
  "name": "自律有力貓",
  "short_name": "自律有力貓",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#0A1A10",
  "background_color": "#0A1A10"
}
```

---

## 功能清單

| 功能 | 說明 |
|---|---|
| 每日體重輸入 | 20–300 kg，0.1 精度，儲存後觸發計數器動畫 |
| 連續戒糖日 | 每天早上勾「昨日戒糖」，顯示連續天數（含週末），中斷歸零；七日圖與月曆標示戒糖日 |
| 飲食紀錄 | 7 項勾選（健康組合/高蛋白/蘋果/碳水/海苔片/垃圾食物/菜飯）+ 文字備註 |
| 運動紀錄 | 3 種（重訓/爬樓機/游泳）+ 自訂備註 |
| 7 日折線圖 | Chart.js 顯示近 7 天體重趨勢，缺資料日斷線不補值 |
| 今昨對比 | 體重差異以紅▲/綠▼/灰標示 |
| 月曆歷史 | 有紀錄日期顯示點（戒糖日另色），可點選回溯編輯任意日期所有欄位 |
| 配色切換 | 深綠 / 海軍藍，記憶於 localStorage |
| Excel 匯出 | 選擇日期區間下載 .xlsx，完全在本機完成不上傳任何資料 |
| 離線使用 | Service Worker + IndexedDB，斷網後功能完整正常 |
| PWA 安裝 | 可加入手機主畫面，以 standalone 模式執行（無瀏覽器 UI） |

---

## 開發注意事項

1. **Service Worker**：本站檔案 Network First，一般改動不需改版本號。只有新增/刪除預快取檔案或改 CDN 版本時，才更新 `ASSETS` 與 `CACHE_NAME`（目前 `v11`）。
2. **IndexedDB Upsert**：`saveRecord` 採讀後寫模式，每個欄位獨立更新，傳 `undefined` 的欄位不會被覆寫。這是意圖設計，各儲存按鈕（戒糖/體重/飲食/運動）因此可以獨立運作。
3. **無後端**：所有資料留在使用者裝置，沒有同步機制，換裝置時需透過 Excel 匯出備份。
4. **語言**：UI 全部繁體中文，`lang="zh-TW"`。
