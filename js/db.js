/**
 * db.js — IndexedDB 封裝
 * Database: WeightTracker, Store: records, keyPath: date (YYYY-MM-DD)
 */

const DB_NAME = 'WeightTracker';
const DB_VERSION = 1;
const STORE = 'records';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'date' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror  = e => reject(e.target.error);
  });
}

async function saveRecord(date, weight, notes, exerciseTypes, exerciseNotes) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const existing = store.get(date);
    existing.onsuccess = () => {
      const record = existing.result || { date };
      if (weight        !== undefined) record.weight        = weight;
      if (notes         !== undefined) record.notes         = notes;
      if (exerciseTypes !== undefined) record.exerciseTypes = exerciseTypes;
      if (exerciseNotes !== undefined) record.exerciseNotes = exerciseNotes;
      const put = store.put(record);
      put.onsuccess = () => resolve(record);
      put.onerror   = e => reject(e.target.error);
    };
    existing.onerror = e => reject(e.target.error);
  });
}

async function getRecord(date) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(date);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

async function getRecentRecords(days) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const results = [];
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor(null, 'prev');
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor && results.length < days) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results.reverse());
      }
    };
    req.onerror = e => reject(e.target.error);
  });
}

async function getRecordsByMonth(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end   = `${year}-${String(month).padStart(2, '0')}-31`;
  return getRecordsByRange(start, end);
}

async function getRecordsByRange(startDate, endDate) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const range = IDBKeyRange.bound(startDate, endDate);
    const results = [];
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).openCursor(range);
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (cursor) { results.push(cursor.value); cursor.continue(); }
      else resolve(results);
    };
    req.onerror = e => reject(e.target.error);
  });
}

async function getAllRecords() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = e => resolve(e.target.result.sort((a, b) => a.date.localeCompare(b.date)));
    req.onerror   = e => reject(e.target.error);
  });
}
