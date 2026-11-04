// Dostęp do arkusza „Studio – Zlecenia". Każda zakładka = tabela z nagłówkiem w 1. wierszu.

var SHEETS = {
  Projekty: ['id', 'createdAt', 'updatedAt', 'status', 'title', 'description', 'requesterName', 'requesterEmail', 'ownerEmail',
    'brand', 'category', 'formats', 'platforms', 'priority', 'materialsLink', 'publishDate', 'presetKey', 'workDays',
    'deadline', 'confirmedDeadline', 'assigneeEmail', 'assigneeName', 'claimedAt', 'deliveryLink', 'folderId',
    'scriptFiles', 'timecodesFile', 'timecodes', 'coverFileId', 'coverThumb', 'viewToken', 'finalFile', 'revisions', 'acceptedAt', 'acceptedBy', 'rejectReason', 'rejectedAt', 'rejectedBy'],
  Historia: ['ts', 'projectId', 'actor', 'action', 'details'],
  Komentarze: ['ts', 'projectId', 'authorEmail', 'authorName', 'text'],
  Dostep: ['email', 'name', 'role', 'addedBy', 'addedAt'],
  Swieta: ['date', 'name']
};

var ss__ = null;
function ss_() { return ss__ || (ss__ = SpreadsheetApp.openById(prop_('SHEET_ID'))); }
function sh_(name) { return ss_().getSheetByName(name); }

function rows_(name) {
  var v = sh_(name).getDataRange().getValues();
  var h = v.shift() || [];
  return v.filter(function (r) { return r.join('') !== ''; }).map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j] instanceof Date ? Utilities.formatDate(r[j], TZ, 'yyyy-MM-dd') : r[j]; });
    return o;
  });
}

// Tekst zaczynający się od =,+,-,@ Sheets potraktowałby jak formułę.
function cell_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function append_(name, obj) {
  sh_(name).appendRow(SHEETS[name].map(function (k) { return cell_(obj[k]); }));
}

function update_(name, row, patch) {
  var cols = SHEETS[name];
  var rng = sh_(name).getRange(row, 1, 1, cols.length);
  var cur = rng.getValues()[0];
  cols.forEach(function (k, j) { if (Object.prototype.hasOwnProperty.call(patch, k)) cur[j] = cell_(patch[k]); });
  rng.setValues([cur]);
}

function deleteRow_(name, row) { sh_(name).deleteRow(row); }

function findProject_(id) {
  return rows_('Projekty').filter(function (r) { return r.id === id; })[0] || null;
}

function log_(projectId, actor, action, details) {
  append_('Historia', { ts: nowIso_(), projectId: projectId, actor: actor, action: action, details: details || '' });
}

function json_(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
}

function nextId_() {
  var y = Utilities.formatDate(new Date(), TZ, 'yyyy');
  var key = 'SEQ_' + y;
  var n = Number(prop_(key) || 0) + 1;
  props_().setProperty(key, String(n));
  return 'STU-' + y + '-' + ('000' + n).slice(-4);
}
