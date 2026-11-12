// Combat / Quest 49.2–49.7. Private monthly sky indexes.
// Read-only projections of ACTUALLY SAVED personal pages and mutual-consent
// encounters. Never auto-generate memories, alter quest state or publish data.
import {isChroniclePhoto} from './echoChroniclePhoto.js';

export const ECHO_ALL_MONTHS = 'all';
export const ECHO_UNDATED_MONTH = 'undated';

const allowedRecord = entry => entry && typeof entry === 'object' &&
 typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 128;

export function echoChronicleMonthKey(date) {
 if (typeof date !== 'string' || !date.trim()) return ECHO_UNDATED_MONTH;
 const time = Date.parse(date);
 if (!Number.isFinite(time)) return ECHO_UNDATED_MONTH;
 const d = new Date(time);
 const year = d.getFullYear(), month = d.getMonth() + 1;
 if (!Number.isInteger(year) || year < 1 || year > 9999) return ECHO_UNDATED_MONTH;
 return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0');
}

export function echoChronicleMonthLabel(key) {
 if (key === ECHO_ALL_MONTHS) return 'All recorded months';
 if (key === ECHO_UNDATED_MONTH) return 'Date not recorded';
 if (typeof key !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(key))
  return 'Unknown month';
 const [year, month] = key.split('-').map(Number);
 const date=new Date(0);
 date.setFullYear(year,month-1,1);
 return date.toLocaleDateString(undefined, {year:'numeric',month:'long'});
}

const uniqueRecords = entries => {
 const records = Array.isArray(entries) ? entries : [];
 const seen = new Set();
 return records.filter(entry => {
  if (!allowedRecord(entry) || seen.has(entry.id)) return false;
  seen.add(entry.id);
  return true;
 });
};

export function getEchoChronicleMonthBuckets(entries = []) {
 const records = uniqueRecords(entries);
 const validIds = new Set(records.map(entry => entry.id));
 const months = new Map();
 for (const entry of records) {
  const key = echoChronicleMonthKey(entry.date);
  if (!months.has(key)) months.set(key, {
   key, count:0, personal:0, shared:0, photos:0, chosenBranches:0,
  });
  const group = months.get(key);
  group.count++;
  if (entry.source === 'personal') group.personal++;
  else group.shared++;
  if (isChroniclePhoto(entry.photoDataUri)) group.photos++;
  if (entry.source === 'personal' &&
      typeof entry.parentId === 'string' &&
      entry.parentId !== entry.id && validIds.has(entry.parentId))
   group.chosenBranches++;
 }
 return Object.freeze([...months.values()]
  .sort((a,b) => a.key === ECHO_UNDATED_MONTH ? 1 :
   b.key === ECHO_UNDATED_MONTH ? -1 : b.key.localeCompare(a.key))
  .map(entry => Object.freeze({...entry,
   label:echoChronicleMonthLabel(entry.key),
  })));
}

export function filterEchoChronicleByMonth(entries = [],month = ECHO_ALL_MONTHS) {
 const records = uniqueRecords(entries);
 if (month === ECHO_ALL_MONTHS) return records;
 if (month !== ECHO_UNDATED_MONTH &&
     (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)))
  return [];
 return records.filter(entry => echoChronicleMonthKey(entry.date) === month);
}
