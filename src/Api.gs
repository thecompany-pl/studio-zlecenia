// Funkcje wywoływane z przeglądarki przez google.script.run. Funkcje z „_" na końcu są prywatne.

var MAX_FILE_BYTES = 10 * 1024 * 1024;
var EXT = {
  script: ['txt', 'md', 'docx', 'doc', 'pdf', 'rtf', 'odt'],
  timecodes: ['txt', 'csv', 'edl', 'xml'],
  cover: ['jpg', 'jpeg', 'png', 'webp']
};

function getBootstrap() {
  ensureSetup_();
  var u = me_();
  return {
    user: u,
    presets: presets_(),
    holidays: holidays_(),
    statuses: STATUSES, brands: BRANDS, categories: CATEGORIES, formats: FORMATS,
    platforms: PLATFORMS, priorities: PRIORITIES, domains: ALLOWED_DOMAINS,
    now: nowParts_(),
    appUrl: appUrl_()
  };
}

// --- upload w kawałkach: kawałki base64 lądują jako pliki tymczasowe, finalizacja skleja je w plik docelowy ---

function uploadChunk(uploadId, index, data) {
  me_();
  if (!/^[a-z0-9]{12,40}$/.test(uploadId) || index > 20) throw new Error('Nieprawidłowy upload.');
  DriveApp.getFolderById(prop_('TMP_FOLDER_ID')).createFile(uploadId + '.' + index + '.part', data, MimeType.PLAIN_TEXT);
  return true;
}

function finalizeUpload(uploadId, total, name, mime, kind) {
  var u = me_();
  if (!/^[a-z0-9]{12,40}$/.test(uploadId)) throw new Error('Nieprawidłowy upload.');
  var ext = String(name).split('.').pop().toLowerCase();
  if (!EXT[kind] || EXT[kind].indexOf(ext) < 0) throw new Error('Niedozwolony typ pliku: .' + ext);
  var tmp = DriveApp.getFolderById(prop_('TMP_FOLDER_ID'));
  var parts = [], b64 = '';
  for (var i = 0; i < total; i++) {
    var it = tmp.getFilesByName(uploadId + '.' + i + '.part');
    if (!it.hasNext()) throw new Error('Brakuje fragmentu pliku — spróbuj wgrać go ponownie.');
    var f = it.next();
    parts.push(f);
    b64 += f.getBlob().getDataAsString();
  }
  var bytes = Utilities.base64Decode(b64);
  parts.forEach(function (f) { f.setTrashed(true); });
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Plik jest większy niż 10 MB.');
  var file = tmp.createFile(Utilities.newBlob(bytes, mime || 'application/octet-stream', name));
  CacheService.getScriptCache().put('up_' + file.getId(), u.email, 21600);
  return { id: file.getId(), name: name, mime: mime, size: bytes.length };
}

function claimUpload_(fileId, email, folder) {
  if (CacheService.getScriptCache().get('up_' + fileId) !== email) throw new Error('Plik wygasł — wgraj go ponownie.');
  DriveApp.getFileById(fileId).moveTo(folder);
}

// --- zgłoszenie ---

function validateBrief_(p) {
  var err = [];
  var t = String(p.title || '').trim();
  if (!t || t.length > 255) err.push('tytuł');
  if (String(p.description || '').trim().length < 40) err.push('opis (min. 40 znaków)');
  if (!String(p.requesterName || '').trim()) err.push('osoba zgłaszająca');
  if (!/^[^@\s]+@[^@\s]+$/.test(p.ownerEmail || '') || !domainOk_(p.ownerEmail)) err.push('owner projektu');
  if (BRANDS.indexOf(p.brand) < 0) err.push('brand');
  if (CATEGORIES.indexOf(p.category) < 0) err.push('kategoria');
  if (!(p.formats || []).length || p.formats.some(function (f) { return FORMATS.indexOf(f) < 0; })) err.push('format');
  if (!(p.platforms || []).length || p.platforms.some(function (f) { return PLATFORMS.indexOf(f) < 0; })) err.push('platforma');
  if (!PRIORITIES.some(function (x) { return x.key === p.priority; })) err.push('priorytet');
  if (p.category !== 'avatar' && !/^https?:\/\/\S+$/.test(p.materialsLink || '')) err.push('link do materiałów');
  if (!(p.scriptFiles || []).length && !p.timecodesFile && !(p.timecodes || []).length) err.push('scenariusz lub czasówki');
  var d = Number(p.workDays);
  if (!(d >= 1 && d <= 60)) err.push('preferowany termin');
  if (err.length) throw new Error('Uzupełnij: ' + err.join(', ') + '.');
}

function submitRequest(p) {
  var u = me_();
  p.ownerEmail = String(p.ownerEmail || u.email).trim().toLowerCase();
  validateBrief_(p);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var id;
  try { id = nextId_(); } finally { lock.releaseLock(); }

  var title = String(p.title).trim();
  var folder = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID')).createFolder(id + ' · ' + title.slice(0, 80));
  var scriptFiles = (p.scriptFiles || []).slice(0, 5);
  scriptFiles.forEach(function (f) { claimUpload_(f.id, u.email, folder); });
  if (p.timecodesFile) claimUpload_(p.timecodesFile.id, u.email, folder);
  if (p.cover) claimUpload_(p.cover.id, u.email, folder);

  var n = nowParts_();
  var preset = presets_().filter(function (x) { return x.key === p.presetKey; })[0];
  var workDays = preset ? preset.days : Number(p.workDays);
  var deadline = computeDeadline(n.date, n.hour, workDays, holidays_(), preset ? preset.cutoff : 0);
  var now = nowIso_();
  var rec = {
    id: id, createdAt: now, updatedAt: now, status: 'Nowe', title: title,
    description: String(p.description).trim(), requesterName: String(p.requesterName).trim(), requesterEmail: u.email,
    ownerEmail: p.ownerEmail, brand: p.brand, category: p.category, formats: p.formats.join(', '),
    platforms: p.platforms.join(', '), priority: p.priority, materialsLink: p.materialsLink || '',
    publishDate: p.publishDate || '', presetKey: preset ? preset.key : 'wlasny', workDays: workDays,
    deadline: deadline, folderId: folder.getId(),
    scriptFiles: JSON.stringify(scriptFiles), timecodesFile: p.timecodesFile ? JSON.stringify(p.timecodesFile) : '',
    timecodes: (p.timecodes || []).length ? JSON.stringify(p.timecodes.slice(0, 300)) : '',
    coverFileId: p.cover ? p.cover.id : '',
    coverThumb: p.coverThumb && String(p.coverThumb).length < 48000 ? p.coverThumb : '',
    viewToken: Utilities.getUuid().replace(/-/g, '')
  };
  append_('Projekty', rec);
  log_(id, u.email, 'Zgłoszenie', 'Preferowany termin: ' + deadline.replace('T', ' '));
  sendNewRequestMails_(rec);
  return { id: id, deadline: deadline };
}

// --- listy ---

function tile_(r) {
  return {
    id: r.id, title: r.title, status: r.status, brand: r.brand, category: r.category,
    formats: String(r.formats).split(', ').filter(String), priority: r.priority, deadline: r.deadline,
    confirmedDeadline: r.confirmedDeadline, assigneeEmail: r.assigneeEmail, assigneeName: r.assigneeName,
    requesterName: r.requesterName, createdAt: r.createdAt, coverThumb: r.coverThumb
  };
}

function listBoard() {
  requireStudio_();
  return rows_('Projekty').map(tile_);
}

function listMine() {
  var u = me_();
  return rows_('Projekty').filter(function (r) {
    return r.requesterEmail === u.email || String(r.ownerEmail).toLowerCase() === u.email;
  }).map(tile_);
}

// Studio widzi wszystko; zgłaszający i owner — swoje; ktoś z linkiem z maila (token) — tylko to jedno zlecenie.
function canSee_(u, r, token) {
  return isStudio_(u) || r.requesterEmail === u.email || String(r.ownerEmail).toLowerCase() === u.email ||
    (!!token && String(token) === String(r.viewToken));
}

function getProject(id, token) {
  var u = me_();
  var r = findProject_(id);
  if (!r || !canSee_(u, r, token)) throw new Error('Nie znaleziono zlecenia albo nie masz do niego dostępu.');
  var studio = isStudio_(u);
  var out = {
    id: r.id, createdAt: r.createdAt, updatedAt: r.updatedAt, status: r.status, title: r.title, description: r.description,
    requesterName: r.requesterName, requesterEmail: r.requesterEmail, ownerEmail: r.ownerEmail, brand: r.brand,
    category: r.category, formats: String(r.formats).split(', ').filter(String),
    platforms: String(r.platforms).split(', ').filter(String), priority: r.priority, materialsLink: r.materialsLink,
    publishDate: r.publishDate, presetKey: r.presetKey, workDays: r.workDays, deadline: r.deadline,
    confirmedDeadline: r.confirmedDeadline, assigneeEmail: r.assigneeEmail, assigneeName: r.assigneeName,
    claimedAt: r.claimedAt, deliveryLink: r.deliveryLink,
    scriptFiles: json_(r.scriptFiles, []), timecodesFile: json_(r.timecodesFile, null),
    timecodes: json_(r.timecodes, []), coverFileId: r.coverFileId, coverThumb: r.coverThumb,
    finalFile: json_(r.finalFile, null),
    revisions: json_(r.revisions, []), maxRevisions: MAX_REVISIONS, acceptedAt: r.acceptedAt, acceptedBy: r.acceptedBy,
    history: rows_('Historia').filter(function (h) { return h.projectId === id; })
      .map(function (h) { return { ts: h.ts, actor: h.actor, action: h.action, details: h.details }; }),
    comments: studio ? rows_('Komentarze').filter(function (c) { return c.projectId === id; })
      .map(function (c) { return { ts: c.ts, authorName: c.authorName, authorEmail: c.authorEmail, text: c.text }; }) : [],
    can: {
      decide: canDecide_(u, r, token) && r.status === 'Do akceptacji',
      studio: studio,
      claim: studio && !r.assigneeEmail,
      edit: studio && (r.assigneeEmail === u.email || u.role === 'admin')
    }
  };
  return out;
}

function getFile(projectId, fileId, token) {
  var u = me_();
  var r = findProject_(projectId);
  if (!r || !canSee_(u, r, token)) throw new Error('Brak dostępu.');
  var ids = json_(r.scriptFiles, []).map(function (f) { return f.id; });
  if (r.timecodesFile) ids.push(json_(r.timecodesFile, {}).id);
  if (r.coverFileId) ids.push(r.coverFileId);
  if (ids.indexOf(fileId) < 0) throw new Error('Plik nie należy do tego zlecenia.');
  var b = DriveApp.getFileById(fileId).getBlob();
  return { name: b.getName(), mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) };
}

// --- decyzja zgłaszającego: akceptacja albo poprawki (maks. MAX_REVISIONS tur) ---

function canDecide_(u, r, token) {
  return r.requesterEmail === u.email || String(r.ownerEmail).toLowerCase() === u.email ||
    (!!token && String(token) === String(r.viewToken));
}

function acceptProject(id, token) {
  var u = me_();
  withProjectLock_(id, function (r) {
    if (!canDecide_(u, r, token)) throw new Error('Zaakceptować może zgłaszający albo owner zlecenia.');
    if (r.status !== 'Do akceptacji') throw new Error('To zlecenie nie czeka teraz na akceptację.');
    var patch = { status: 'Gotowe', acceptedAt: nowIso_(), acceptedBy: u.email, updatedAt: nowIso_() };
    update_('Projekty', r._row, patch);
    log_(id, u.email, 'Zaakceptowane', 'Zlecenie zamknięte przez zgłaszającego');
    for (var k in patch) r[k] = patch[k];
    sendAcceptedMail_(r, u);
    sendDoneMail_(r);
  });
  return getProject(id, token);
}

function requestRevision(id, text, token) {
  var u = me_();
  text = String(text || '').trim().slice(0, 4000);
  if (text.length < 10) throw new Error('Opisz poprawki (min. 10 znaków).');
  withProjectLock_(id, function (r) {
    if (!canDecide_(u, r, token)) throw new Error('Poprawki zgłasza zgłaszający albo owner zlecenia.');
    if (r.status !== 'Do akceptacji') throw new Error('Poprawki można zgłosić, gdy materiał czeka na akceptację.');
    var revs = json_(r.revisions, []);
    if (revs.length >= MAX_REVISIONS) throw new Error('Wykorzystano już ' + MAX_REVISIONS + ' z ' + MAX_REVISIONS + ' tur poprawek.');
    revs.push({ n: revs.length + 1, text: text, at: nowIso_(), by: u.email });
    var patch = { revisions: JSON.stringify(revs), status: 'W realizacji', updatedAt: nowIso_() };
    update_('Projekty', r._row, patch);
    log_(id, u.email, 'Poprawki ' + revs.length + '/' + MAX_REVISIONS, text.slice(0, 200));
    for (var k in patch) r[k] = patch[k];
    sendRevisionMail_(r, revs[revs.length - 1], u);
  });
  return getProject(id, token);
}

// --- akcje studia ---

function withProjectLock_(id, fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var r = findProject_(id);
    if (!r) throw new Error('Nie znaleziono zlecenia.');
    return fn(r);
  } finally { lock.releaseLock(); }
}

function claimProject(id) {
  var u = requireStudio_();
  withProjectLock_(id, function (r) {
    if (r.assigneeEmail && r.assigneeEmail !== u.email) throw new Error('Już przyjął: ' + r.assigneeName);
    if (r.assigneeEmail === u.email) return;
    var patch = { assigneeEmail: u.email, assigneeName: u.name, claimedAt: nowIso_(), updatedAt: nowIso_() };
    if (r.status === 'Nowe') patch.status = 'W realizacji';
    update_('Projekty', r._row, patch);
    log_(id, u.email, 'Przyjęte', u.name + ' bierze zadanie');
    for (var k in patch) r[k] = patch[k];
    sendClaimedMail_(r);
  });
  return getProject(id);
}

function releaseProject(id) {
  var u = requireStudio_();
  withProjectLock_(id, function (r) {
    if (r.assigneeEmail !== u.email && u.role !== 'admin') throw new Error('Zwolnić może tylko osoba przypisana albo admin.');
    update_('Projekty', r._row, { assigneeEmail: '', assigneeName: '', claimedAt: '', status: 'Nowe', updatedAt: nowIso_() });
    log_(id, u.email, 'Zwolnione', u.name + ' oddaje zadanie');
  });
  return getProject(id);
}

function updateProject(id, patch) {
  var u = requireStudio_();
  withProjectLock_(id, function (r) {
    if (r.assigneeEmail !== u.email && u.role !== 'admin') throw new Error('Edytować może osoba przypisana albo admin.');
    var clean = { updatedAt: nowIso_() }, notes = [];
    if (patch.status !== undefined && patch.status !== r.status) {
      if (STATUSES.indexOf(patch.status) < 0) throw new Error('Nieznany status.');
      if (patch.status === 'Gotowe' && !(patch.deliveryLink || r.deliveryLink || r.finalFile)) throw new Error('Przed „Gotowe" wrzuć plik finalny albo wklej link do materiału.');
      clean.status = patch.status; notes.push('status → ' + patch.status);
    }
    if (patch.deliveryLink !== undefined && patch.deliveryLink !== r.deliveryLink) {
      if (patch.deliveryLink && !/^https?:\/\/\S+$/.test(patch.deliveryLink)) throw new Error('Link musi zaczynać się od http(s)://');
      clean.deliveryLink = patch.deliveryLink; notes.push('link do materiału');
    }
    if (patch.confirmedDeadline !== undefined && patch.confirmedDeadline !== r.confirmedDeadline) {
      if (patch.confirmedDeadline && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(patch.confirmedDeadline)) throw new Error('Zła data.');
      clean.confirmedDeadline = patch.confirmedDeadline; notes.push('termin studia: ' + (patch.confirmedDeadline || '—').replace('T', ' '));
    }
    if (!notes.length) return;
    update_('Projekty', r._row, clean);
    log_(id, u.email, 'Zmiana', notes.join('; '));
    for (var k in clean) r[k] = clean[k];
    if (clean.status === 'Gotowe') sendDoneMail_(r);
    else if (clean.status === 'Do akceptacji') sendReviewMail_(r);
    else if (clean.confirmedDeadline) sendDeadlineMail_(r);
  });
  return getProject(id);
}

function addComment(id, text) {
  var u = requireStudio_();
  text = String(text || '').trim().slice(0, 4000);
  if (!text) throw new Error('Pusty komentarz.');
  if (!findProject_(id)) throw new Error('Nie znaleziono zlecenia.');
  append_('Komentarze', { ts: nowIso_(), projectId: id, authorEmail: u.email, authorName: u.name, text: text });
  return getProject(id);
}

// --- plik finalny: upload wznawialny prosto do Drive (kawałki po 4 MB, bez sklejania w pamięci) ---

var FINAL_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mxf', 'jpg', 'jpeg', 'png', 'gif', 'pdf'];
var FINAL_MAX = 2 * 1024 * 1024 * 1024;

function startFinalUpload(projectId, name, mime, size) {
  var u = requireStudio_();
  var r = findProject_(projectId);
  if (!r) throw new Error('Nie znaleziono zlecenia.');
  if (r.assigneeEmail !== u.email && u.role !== 'admin') throw new Error('Plik finalny wrzuca osoba przypisana albo admin.');
  var ext = String(name).split('.').pop().toLowerCase();
  if (FINAL_EXT.indexOf(ext) < 0) throw new Error('Niedozwolony typ pliku: .' + ext);
  if (!(size > 0 && size <= FINAL_MAX)) throw new Error('Plik finalny może mieć maks. 2 GB.');
  mime = mime || 'application/octet-stream';
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) },
    payload: JSON.stringify({ name: 'FINAL · ' + name, parents: [r.folderId] })
  });
  var url = res.getHeaders().Location || res.getHeaders().location;
  if (res.getResponseCode() !== 200 || !url) throw new Error('Drive nie przyjął uploadu (' + res.getResponseCode() + ').');
  var uploadId = Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('fu_' + uploadId, JSON.stringify({ url: url, projectId: projectId, email: u.email, size: size, name: name, mime: mime }), 21600);
  return uploadId;
}

function uploadFinalChunk(uploadId, offset, b64) {
  var u = requireStudio_();
  var s = json_(CacheService.getScriptCache().get('fu_' + uploadId), null);
  if (!s || s.email !== u.email) throw new Error('Sesja uploadu wygasła — zacznij od nowa.');
  var bytes = Utilities.base64Decode(b64);
  var end = offset + bytes.length - 1;
  var res = UrlFetchApp.fetch(s.url, {
    method: 'put', contentType: s.mime, payload: bytes, muteHttpExceptions: true,
    headers: { 'Content-Range': 'bytes ' + offset + '-' + end + '/' + s.size }
  });
  var code = res.getResponseCode();
  if (code === 308) return { done: false, next: end + 1 };
  if (code !== 200 && code !== 201) throw new Error('Błąd wysyłania do Drive (' + code + ').');
  var fileId = JSON.parse(res.getContentText()).id;
  CacheService.getScriptCache().remove('fu_' + uploadId);
  var meta = { id: fileId, name: s.name, mime: s.mime, size: s.size, at: nowIso_(), by: u.name };
  withProjectLock_(s.projectId, function (r) {
    update_('Projekty', r._row, { finalFile: JSON.stringify(meta), updatedAt: nowIso_() });
    log_(r.id, u.email, 'Plik finalny', s.name);
    shareFinal_(fileId, r);
  });
  return { done: true, project: getProject(s.projectId) };
}

// Podgląd w odtwarzaczu Drive wymaga prawa do odczytu: najpierw „każdy w domenie z linkiem", a jak polityka nie pozwala — imiennie, bez maili od Google.
function shareFinal_(fileId, r) {
  try { DriveApp.getFileById(fileId).setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); return; } catch (e) {}
  uniq_([r.requesterEmail, r.ownerEmail].concat(studioEmails_())).forEach(function (email) {
    UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '/permissions?sendNotificationEmail=false&supportsAllDrives=true', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({ role: 'reader', type: 'user', emailAddress: email })
    });
  });
}

// --- ustawienia (admin) ---

function getSettings() {
  requireAdmin_();
  return {
    access: rows_('Dostep').map(function (r) { return { email: r.email, name: r.name, role: r.role, addedBy: r.addedBy, addedAt: r.addedAt }; }),
    presets: presets_(),
    holidays: holidays_()
  };
}

function addAccess(email, name, role) {
  var u = requireAdmin_();
  email = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email) || !domainOk_(email)) throw new Error('Adres musi być w domenie: ' + ALLOWED_DOMAINS.join(', '));
  if (['studio', 'admin'].indexOf(role) < 0) throw new Error('Nieznana rola.');
  var cur = findAccess_(email);
  var rec = { email: email, name: String(name || '').trim() || nameFromEmail_(email), role: role, addedBy: u.email, addedAt: nowIso_() };
  if (cur) update_('Dostep', cur._row, rec); else append_('Dostep', rec);
  return getSettings();
}

function removeAccess(email) {
  var u = requireAdmin_();
  email = String(email).toLowerCase();
  if (email === u.email) throw new Error('Nie możesz usunąć samego siebie.');
  var cur = findAccess_(email);
  if (cur) deleteRow_('Dostep', cur._row);
  return getSettings();
}

function savePresets(list) {
  requireAdmin_();
  var clean = (list || []).map(function (p) {
    var days = Math.round(Number(p.days)), cutoff = Math.round(Number(p.cutoff) || 0);
    if (!p.label || !(days >= 1 && days <= 60)) throw new Error('Każdy preset musi mieć nazwę i 1–60 dni rob.');
    if (cutoff && !(cutoff > 9 && cutoff <= 17)) throw new Error('Godzina „do" musi być między 10 a 17.');
    var o = { key: String(p.key || p.label).toLowerCase().replace(/[^a-z0-9ąćęłńóśźż]+/g, '-'), label: String(p.label).trim(), hint: String(p.hint || '').trim(), days: days };
    if (cutoff) o.cutoff = cutoff;
    return o;
  });
  props_().setProperty('PRESETS', JSON.stringify(clean));
  return getSettings();
}

function addHoliday(date, name) {
  requireAdmin_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Zła data.');
  if (!holidays_().some(function (h) { return h.date === date; })) append_('Swieta', { date: date, name: String(name || 'Dzień wolny') });
  return getSettings();
}

function removeHoliday(date) {
  requireAdmin_();
  var r = rows_('Swieta').filter(function (h) { return String(h.date) === date; })[0];
  if (r) deleteRow_('Swieta', r._row);
  return getSettings();
}
