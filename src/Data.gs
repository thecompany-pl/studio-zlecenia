// Dostęp do arkusza „Studio – Zlecenia". Każda zakładka = tabela z nagłówkiem w 1. wierszu.

var SHEETS = {
  Projekty: ['id', 'createdAt', 'updatedAt', 'status', 'title', 'description', 'requesterName', 'requesterEmail', 'ownerEmail',
    'brand', 'category', 'formats', 'platforms', 'priority', 'materialsLink', 'publishDate', 'presetKey', 'workDays',
    'deadline', 'confirmedDeadline', 'assigneeEmail', 'assigneeName', 'claimedAt', 'deliveryLink', 'folderId',
    'scriptFiles', 'timecodesFile', 'timecodes', 'coverFileId', 'coverThumb', 'viewToken', 'finalFile', 'revisions', 'acceptedAt', 'acceptedBy', 'rejectReason', 'rejectedAt', 'rejectedBy'],
  Historia: ['ts', 'projectId', 'actor', 'action', 'details'],
  Komentarze: ['ts', 'projectId', 'authorEmail', 'authorName', 'text'],
  Dostep: ['email', 'name', 'role', 'addedBy', 'addedAt'],
  Swieta: ['date', 'name'],
  Rezerwacje: ['id', 'createdAt', 'updatedAt', 'status', 'title', 'description', 'requesterName', 'requesterEmail', 'brand',
    'guests', 'format', 'date', 'start', 'end', 'notes', 'eventId', 'decidedBy', 'decidedAt', 'decisionNote'],  // dawne, tylko do migracji
  Realizacje: ['id', 'createdAt', 'updatedAt', 'status', 'kind', 'title', 'description', 'requesterName', 'requesterEmail', 'brand', 'format',
    'scope', 'guests', 'platform', 'meetingLink', 'location', 'parking', 'boardConsent', 'tech', 'delivery', 'notes', 'agendaFile',
    'seriesRule', 'conflictReason', 'staffNeeded', 'assignees', 'folderId', 'legacyId', 'holdOpen', 'linkedMontageId', 'agendaText', 'logoBrand'],
  Terminy: ['id', 'realizationId', 'n', 'date', 'ready', 'start', 'end', 'teardownMin', 'travelMin', 'status', 'eventId', 'outOfHours',
    'conflict', 'proposed', 'before', 'decidedBy', 'decidedAt', 'decisionNote', 'calChanged', 'staffAlerted']
};

var ss__ = null;
function ss_() { return ss__ || (ss__ = SpreadsheetApp.openById(prop_('SHEET_ID'))); }
function sh_(name) { return ss_().getSheetByName(name); }

// Godzina z arkusza w dowolnej postaci → 'HH:MM': tekst ('9:00', "'10:00", '10:00:00'), ułamek doby (0.4166…), pusta → ''.
function hmCell_(x) {
  if (x === '' || x === null || x === undefined) return '';
  if (typeof x === 'number') { var m = Math.round(x * 1440) % 1440; return ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
  var s = String(x).replace(/^'/, '').trim(), r = /^(\d{1,2}):(\d{2})/.exec(s);
  return r ? ('0' + r[1]).slice(-2) + ':' + r[2] : s;
}

// Sheets potrafi zamienić tekst '12:00' / '2026-11-26' na czas / datę. Datę oddajemy jako 'yyyy-MM-dd',
// a samą godzinę (Date z roku 1899) — tak, jak ją widać w arkuszu ('12:00'), bez przeliczeń stref.
function rows_(name) {
  var rng = sh_(name).getDataRange();
  var v = rng.getValues(), disp = null;
  var h = v.shift() || [];
  v.forEach(function (r, i) { r._i = i; });
  return v.filter(function (r) { return r.join('') !== ''; }).map(function (r) {
    var i = r._i, o = { _row: i + 2 };
    h.forEach(function (k, j) {
      var x = r[j];
      if (x instanceof Date) {
        if (x.getFullYear() < 1901) { disp = disp || rng.getDisplayValues(); x = hmCell_(disp[r._i + 1][j]); }
        else x = Utilities.formatDate(x, TZ, 'yyyy-MM-dd');
      }
      o[k] = x;
    });
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
