// Zlecenia studyjne (realizacje): nagrania w studiu, avatary, webinary, transmisje live, obsługa wyjazdowa.
// Każde zlecenie czeka na akceptację — godziny bywają płynne. Wydarzenie w kalendarzu „Rezerwacja Studio Nagrań"
// powstaje dopiero przy akceptacji (jedno na wystąpienie serii). Logika godzin i serii: Series.gs.

var STUDIO_CAL_NAME = 'Rezerwacja Studio Nagrań';
var REA_KINDS = [
  { key: 'studio', label: 'Nagranie w studiu', hint: 'setki, przebitki, TC Talks, zaproszenia, panel', where: 'studio' },
  { key: 'avatar', label: 'Nagranie avatara', hint: 'HeyGen: wideo + głos', where: 'studio' },
  { key: 'webinar', label: 'Webinar / szkolenie online', hint: 'Zoom/Teams prowadzony ze studia, realizacja na żywo', where: 'studio' },
  { key: 'live', label: 'Transmisja live', hint: 'stream na YouTube, Facebook lub inną platformę', where: 'any' },
  { key: 'wyjazd', label: 'Obsługa wyjazdowa', hint: 'ekipa z kamerą na evencie, w biurze, u klienta', where: 'location' }
];
var REA_FORMATS = ['Przebitki', 'TC Talks', 'Setki', 'Nagrania avatara', 'Nagranie zaproszenia'];
var REA_SCOPE = ['Nagranie setek', 'Nagranie przebitek', 'Nagranie panelu'];
var REA_GUESTS = ['1 osoba', '2 osoby', '3 osoby', '4 osoby', '5 i więcej'];
var REA_PLATFORMS = ['Zoom', 'Teams', 'YouTube Live', 'Facebook Live', 'inna'];
var REA_CONSENT = ['Tak', 'Nie', 'Nie jest wymagana'];
var REA_TECH = ['Osobny mikrofon dla każdej osoby', 'Monitor podglądu przy kamerze', 'Przełączanie źródeł (prezentacja / ekran / uczestnik)',
  'Telewizor z prezentacją w kadrze', 'Prompter', 'Tło z logo brandu', 'Zapis całości'];
var REA_DELIVERY = ['Surowy plik', 'Zmontowany materiał', 'Vimeo z hasłem', 'Bez zapisu'];
var REA = { pending: 'Czeka na akceptację', ok: 'Zaakceptowane', proposal: 'Propozycja terminu', rejected: 'Odrzucone', cancelled: 'Anulowane', done: 'Zrealizowane' };
var TERM = { pending: 'Czeka', ok: 'Zaakceptowany', proposal: 'Propozycja', rejected: 'Odrzucony', cancelled: 'Anulowany' };
var REA_DAY = [6, 24];         // w tych granicach musi się zmieścić blok ekipy

// --- konfiguracja i uprawnienia ---

function studioCal_() {
  var id = prop_('STUDIO_CAL_ID');
  var cal = id && CalendarApp.getCalendarById(id);
  if (!cal) {
    cal = CalendarApp.getCalendarsByName(STUDIO_CAL_NAME)[0];
    if (!cal) throw new Error('Nie znaleziono kalendarza „' + STUDIO_CAL_NAME + '" — osoba wdrażająca portal musi go mieć na liście kalendarzy.');
    props_().setProperty('STUDIO_CAL_ID', cal.getId());
  }
  return cal;
}

// Zarządzający studiem akceptuje wszystko, w tym pracę poza godzinami. Bez ustawionego zarządzającego robią to admini.
function studioManager_() { return String(prop_('STUDIO_MANAGER') || '').toLowerCase(); }
function managerEmails_() {
  var m = studioManager_();
  return m ? [m] : rows_('Dostep').filter(function (r) { return r.role === 'admin'; }).map(function (r) { return r.email; });
}
function isManager_(u) { return u.role === 'admin' || (!!studioManager_() && u.email === studioManager_()); }
function studioCanApprove_() { return prop_('STUDIO_CAN_APPROVE') === '1'; }
// Czy u może zaakceptować jakikolwiek termin; termin poza godzinami pracy zawsze wymaga zarządzającego.
function canApproveAny_(u) { return isManager_(u) || (isStudio_(u) && studioCanApprove_()); }
function canApproveTerm_(u, t) { return isManager_(u) || (!t.outOfHours && isStudio_(u) && studioCanApprove_()); }
function canSeeRea_(u, r) { return r.requesterEmail === u.email || isStudio_(u) || canApproveAny_(u); }
function canApprove_(u) { return canApproveAny_(u); }  // zgodność z getBootstrap

function studioSettings_() {
  return { manager: studioManager_(), canApprove: studioCanApprove_(), notifyNew: prop_('STUDIO_NOTIFY_NEW') === '1', location: prop_('STUDIO_LOCATION') || '' };
}

function saveStudioSettings(s) {
  requireAdmin_();
  var email = String(s.manager || '').trim().toLowerCase();
  if (email && (!/^[^@\s]+@[^@\s]+$/.test(email) || !domainOk_(email))) throw new Error('Podaj firmowy adres e-mail zarządzającego.');
  var p = props_();
  p.setProperty('STUDIO_MANAGER', email);
  p.setProperty('STUDIO_CAN_APPROVE', s.canApprove ? '1' : '');
  p.setProperty('STUDIO_NOTIFY_NEW', s.notifyNew ? '1' : '');
  p.setProperty('STUDIO_LOCATION', String(s.location || '').trim().slice(0, 200));
  return getSettings();
}
function saveStudioManager(email) { var s = studioSettings_(); s.manager = email; return saveStudioSettings(s); }

function reaConfig_() {
  return { kinds: REA_KINDS, formats: REA_FORMATS, scope: REA_SCOPE, guests: REA_GUESTS, platforms: REA_PLATFORMS, consent: REA_CONSENT,
    tech: REA_TECH, delivery: REA_DELIVERY, work: SR_WORK, day: REA_DAY, max: SR_MAX, statuses: REA, termStatuses: TERM };
}

// --- czas ---

function hm_(d) { return Utilities.formatDate(d, TZ, 'HH:mm'); }
function ymd_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
// Data z minut od północy danego dnia (24:00 = północ dnia następnego).
function toDate_(ymd, minutes) {
  if (minutes >= 1440) return Utilities.parseDate(dl_addDays(ymd, 1) + ' ' + sr_hm(minutes - 1440), TZ, 'yyyy-MM-dd HH:mm');
  return Utilities.parseDate(ymd + ' ' + sr_hm(minutes), TZ, 'yyyy-MM-dd HH:mm');
}
function holSet_() { return dl_holidaySet(holidays_()); }

function nextReaId_() {
  var y = Utilities.formatDate(new Date(), TZ, 'yyyy');
  var key = 'RSEQ_' + y;
  var n = Number(prop_(key) || 0) + 1;
  props_().setProperty(key, String(n));
  return 'REA-' + y + '-' + ('000' + n).slice(-4);
}

// --- dane ---

function findRea_(id) { return rows_('Realizacje').filter(function (r) { return r.id === id || (r.legacyId && r.legacyId === id); })[0] || null; }
function termsOf_(id) {
  return rows_('Terminy').filter(function (t) { return t.realizationId === id; }).map(normTerm_)
    .sort(function (a, b) { return (a.date + a.ready).localeCompare(b.date + b.ready); });
}
function normTerm_(t) {
  t.date = String(t.date); t.ready = String(t.ready); t.start = String(t.start); t.end = String(t.end);
  t.teardownMin = Number(t.teardownMin) || 0; t.travelMin = Number(t.travelMin) || 0;
  t.outOfHours = t.outOfHours === true || t.outOfHours === 'TRUE' || t.outOfHours === 'true' || t.outOfHours === '1';
  t.proposed = json_(t.proposed, null); t.before = json_(t.before, null);
  return t;
}
function termEnd_(t) { return toDate_(t.date, sr_block(t).to); }

// Status zlecenia wyliczany z terminów.
function reaStatus_(terms) {
  var has = function (s) { return terms.some(function (t) { return t.status === s; }); };
  if (has(TERM.proposal)) return REA.proposal;
  if (has(TERM.pending)) return REA.pending;
  if (has(TERM.ok)) {
    var now = new Date();
    return terms.filter(function (t) { return t.status === TERM.ok; }).every(function (t) { return termEnd_(t) < now; }) ? REA.done : REA.ok;
  }
  return has(TERM.rejected) ? REA.rejected : REA.cancelled;
}
function refreshStatus_(r) {
  var st = reaStatus_(termsOf_(r.id));
  if (st !== r.status) update_('Realizacje', r._row, { status: st, updatedAt: nowIso_() });
  r.status = st;
  return st;
}

// --- zajętość ---

// Zajętość dni z kalendarza + terminy czekające na akceptację / z propozycją (wstępnie zajęte, tylko w portalu).
// Zwraca { 'YYYY-MM-DD': [{start, end, label, tentative, reaId}] }. skipReaId: pomiń własne terminy realizacji.
function busyMap_(dates, u, skipReaId) {
  var out = {};
  dates.forEach(function (d) { out[d] = []; });
  if (!dates.length) return out;
  var sorted = dates.slice().sort();
  var showTitles = isStudio_(u) || canApproveAny_(u);
  var ownEvents = {}, eventRea = {};
  var terms = rows_('Terminy').map(normTerm_);
  terms.forEach(function (t) {
    if (t.eventId) { eventRea[t.eventId] = t.realizationId; if (t.realizationId === skipReaId) ownEvents[t.eventId] = true; }
  });
  var titles = {};
  if (showTitles) rows_('Realizacje').forEach(function (r) { titles[r.id] = r.title; });
  // Kalendarz: jedno zapytanie na ciągły zakres (do 120 dni), dłuższe serie — po dniu.
  var ranges = [];
  if (sr_daysDiff(sorted[0], sorted[sorted.length - 1]) <= 120) ranges.push([sorted[0], sorted[sorted.length - 1]]);
  else sorted.forEach(function (d) { ranges.push([d, d]); });
  var cal = studioCal_();
  ranges.forEach(function (rg) {
    cal.getEvents(toDate_(rg[0], 0), toDate_(rg[1], 1440)).forEach(function (e) {
      var id = e.getId();
      if (ownEvents[id]) return;
      var s = e.getStartTime(), en = e.getEndTime(), all = e.isAllDayEvent();
      for (var d = ymd_(s); d <= rg[1] && d <= ymd_(new Date(en.getTime() - 1)); d = dl_addDays(d, 1)) {
        if (!out[d]) continue;
        var dayFrom = toDate_(d, 0), dayTo = toDate_(d, 1440);
        var from = all || s <= dayFrom ? '00:00' : hm_(s), to = all || en >= dayTo ? '24:00' : hm_(en);
        out[d].push({ start: from, end: to, label: showTitles ? e.getTitle() : 'Zajęte', tentative: false, reaId: showTitles ? (eventRea[id] || '') : '' });
      }
    });
  });
  terms.forEach(function (t) {
    if ((t.status !== TERM.pending && t.status !== TERM.proposal) || t.realizationId === skipReaId) return;
    var x = t.status === TERM.proposal && t.proposed ? Object.assign({}, t, t.proposed) : t;
    if (!out[x.date]) return;
    var b = sr_block(x);
    out[x.date].push({ start: sr_hm(b.from), end: sr_hm(b.to), label: showTitles ? (titles[t.realizationId] || t.realizationId) + ' (czeka na akceptację)' : 'Wstępnie zajęte',
      tentative: true, reaId: showTitles ? t.realizationId : '' });
  });
  Object.keys(out).forEach(function (d) { out[d].sort(function (a, b) { return a.start.localeCompare(b.start); }); });
  return out;
}

function checkDates_(dates, max) {
  if (!Array.isArray(dates) || !dates.length || dates.length > max) throw new Error('Nieprawidłowy zakres dat.');
  dates.forEach(function (d) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('Nieprawidłowa data: ' + d); });
}

// Zajętość wybranych dni (kreator: oś dnia, pasek 5 dni, terminy serii).
function studioDays(dates) {
  var u = me_();
  checkDates_(dates, 40);
  var hs = holSet_(), busy = busyMap_(dates, u, '');
  var days = {};
  dates.forEach(function (d) { days[d] = { workday: dl_isWorkday(d, hs), busy: busy[d] }; });
  return days;
}

// Widok kalendarza studia (tydzień / miesiąc).
function studioRange(from, n) {
  var u = me_();
  if (!isStudio_(u) && !canApproveAny_(u)) throw new Error('Kalendarz studia jest dostępny dla zespołu studia.');
  n = Math.min(42, Math.max(1, Number(n) || 7));
  var dates = [];
  for (var i = 0; i < n; i++) dates.push(dl_addDays(from, i));
  return studioDays(dates);
}

// --- walidacja zlecenia ---

function kind_(key) { return REA_KINDS.filter(function (k) { return k.key === key; })[0] || null; }
function isAway_(p) { return p.kind === 'wyjazd' || (p.kind === 'live' && p.liveAway); }

function validateRea_(p) {
  var err = [], k = kind_(p.kind);
  if (!String(p.title || '').trim() || String(p.title).length > 255) err.push('tytuł');
  if (!k) err.push('rodzaj realizacji');
  if (String(p.description || '').trim().length < 40) err.push('opis (min. 40 znaków)');
  if (!String(p.requesterName || '').trim()) err.push('osoba zgłaszająca');
  if (p.brand && BRANDS.indexOf(p.brand) < 0) err.push('brand');
  if (REA_CONSENT.indexOf(p.boardConsent) < 0) err.push('zgoda Zarządu TC');
  if (k) {
    if (p.kind === 'studio' && REA_FORMATS.indexOf(p.format) < 0) err.push('format wydarzenia');
    if (k.where !== 'location' && !isAway_(p) && REA_GUESTS.indexOf(p.guests) < 0) err.push('liczba osób przed kamerą');
    if ((p.kind === 'webinar' || p.kind === 'live') && !String(p.platform || '').trim()) err.push('platforma');
    if (isAway_(p)) {
      if (!String(p.location || '').trim()) err.push('lokalizacja');
      if (['Tak', 'Nie'].indexOf(p.parking) < 0) err.push('miejsce parkingowe');
      if (!(p.scope || []).length || p.scope.some(function (x) { return REA_SCOPE.indexOf(x) < 0; })) err.push('zakres obsługi video');
    }
    var needsDelivery = p.kind === 'studio' || p.kind === 'avatar' || p.kind === 'wyjazd' || (p.tech || []).indexOf('Zapis całości') >= 0;
    if (needsDelivery && REA_DELIVERY.indexOf(p.delivery) < 0) err.push('forma oddania nagrania');
  }
  if ((p.tech || []).some(function (x) { return REA_TECH.indexOf(x) < 0; })) err.push('wymagania techniczne');
  if (String(p.notes || '').length > 2000) err.push('uwagi (maks. 2000 znaków)');
  if (String(p.meetingLink || '').length > 500) err.push('link do spotkania');
  if (err.length) throw new Error('Uzupełnij: ' + err.join(', ') + '.');
}

// Termin: format, kolejność godzin, mieści się w dobie, nie w przeszłości.
function validateTerm_(t) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) throw new Error('Nieprawidłowa data terminu.');
  ['ready', 'start', 'end'].forEach(function (k) { if (!/^\d{2}:\d{2}$/.test(t[k] || '')) throw new Error('Nieprawidłowa godzina w terminie ' + t.date + '.'); });
  var r = sr_min(t.ready), s = sr_min(t.start), e = sr_min(t.end);
  if (r > s) throw new Error(t.date + ': gotowość ekipy musi być przed startem wydarzenia.');
  if (e - s < 15) throw new Error(t.date + ': wydarzenie musi trwać co najmniej 15 minut.');
  var b = sr_block(t);
  if (b.from < REA_DAY[0] * 60 || b.to > REA_DAY[1] * 60) throw new Error(t.date + ': realizacja (z dojazdem i zwijaniem) musi zmieścić się między ' + REA_DAY[0] + ':00 a ' + REA_DAY[1] + ':00.');
  if (toDate_(t.date, b.from) <= new Date()) throw new Error(t.date + ' ' + t.ready + ': ten termin już minął.');
}

// --- tworzenie ---

function createRealization(p) {
  var u = me_();
  validateRea_(p);
  var list = (p.terms || []).slice(0, SR_MAX + 1);
  if (!list.length) throw new Error('Wybierz termin.');
  if (list.length > SR_MAX) throw new Error('Seria może mieć maksymalnie ' + SR_MAX + ' wystąpień.');
  var teardown = Math.max(0, Math.min(180, Number(p.teardownMin) || 0));
  var travel = isAway_(p) ? Math.max(0, Math.min(240, Number(p.travelMin) || 0)) : 0;
  var seen = {};
  var terms = list.map(function (x) {
    var t = { date: String(x.date), ready: String(x.ready), start: String(x.start), end: String(x.end), teardownMin: teardown, travelMin: travel };
    validateTerm_(t);
    if (seen[t.date]) throw new Error('Termin ' + t.date + ' występuje dwa razy.');
    seen[t.date] = true;
    return t;
  });
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var r;
  try {
    var hs = holSet_();
    var busy = busyMap_(terms.map(function (t) { return t.date; }), u, '');
    var conflicts = 0;
    terms.forEach(function (t) {
      t.outOfHours = sr_outOfHours(t, hs);
      var c = sr_conflict(t, busy[t.date]);
      t.conflict = c ? c.start + '–' + c.end + (c.label && c.label !== 'Zajęte' && c.label !== 'Wstępnie zajęte' ? ' ' + c.label : '') : '';
      if (c) conflicts++;
    });
    if (conflicts && String(p.conflictReason || '').trim().length < 10) throw new Error('Część terminów nachodzi na inne rezerwacje — napisz, dlaczego potrzebujesz właśnie tych godzin (min. 10 znaków), albo zmień termin.');
    var id = nextReaId_();
    var agenda = null;
    if (p.agendaFile && p.agendaFile.id) {
      var folder = reaFolder_(id);
      claimUpload_(p.agendaFile.id, u.email, folder);
      agenda = { id: p.agendaFile.id, name: p.agendaFile.name, size: p.agendaFile.size, mime: p.agendaFile.mime };
    }
    r = {
      id: id, createdAt: nowIso_(), updatedAt: nowIso_(), status: REA.pending, kind: p.kind,
      title: String(p.title).trim(), description: String(p.description).trim(), requesterName: String(p.requesterName).trim(), requesterEmail: u.email,
      brand: p.brand || '', format: p.kind === 'studio' ? p.format : (p.kind === 'avatar' ? 'Nagrania avatara' : ''),
      scope: isAway_(p) ? JSON.stringify(p.scope) : '', guests: isAway_(p) ? '' : (p.guests || ''),
      platform: p.kind === 'webinar' || p.kind === 'live' ? String(p.platform).trim().slice(0, 80) : '',
      meetingLink: String(p.meetingLink || '').trim(), location: isAway_(p) ? String(p.location).trim().slice(0, 300) : '',
      parking: isAway_(p) ? p.parking : '', boardConsent: p.boardConsent, tech: JSON.stringify(p.tech || []), delivery: p.delivery || '',
      notes: String(p.notes || '').trim(), agendaFile: agenda ? JSON.stringify(agenda) : '', seriesRule: p.seriesRule ? JSON.stringify(p.seriesRule) : '',
      conflictReason: conflicts ? String(p.conflictReason).trim().slice(0, 1000) : '', staffNeeded: 1, assignees: '[]', folderId: agenda ? reaFolder_(id).getId() : '', legacyId: ''
    };
    append_('Realizacje', r);
    terms.forEach(function (t, i) {
      append_('Terminy', { id: id + '-' + ('0' + (i + 1)).slice(-2), realizationId: id, n: i + 1, date: t.date, ready: t.ready, start: t.start, end: t.end,
        teardownMin: t.teardownMin, travelMin: t.travelMin, status: TERM.pending, eventId: '', outOfHours: t.outOfHours ? '1' : '', conflict: t.conflict,
        proposed: '', before: '', decidedBy: '', decidedAt: '', decisionNote: '', calChanged: '', staffAlerted: '' });
    });
    log_(id, u.email, 'Zgłoszenie realizacji', terms.length > 1 ? 'seria ×' + terms.length : terms[0].date + ' ' + terms[0].start + '–' + terms[0].end);
  } finally { lock.releaseLock(); }
  var all = termsOf_(r.id);
  sendReaSubmittedMail_(r, all);
  sendReaApprovalMail_(r, all);
  return getRealization(r.id);
}

function reaFolder_(id) {
  var root = DriveApp.getFolderById(prop_('ROOT_FOLDER_ID'));
  var it = root.getFoldersByName('Realizacje');
  var base = it.hasNext() ? it.next() : root.createFolder('Realizacje');
  var f = base.getFoldersByName(id);
  return f.hasNext() ? f.next() : base.createFolder(id);
}

// --- odczyt ---

function reaOut_(r, terms, u, full) {
  var studio = isStudio_(u), assignees = json_(r.assignees, []);
  var active = terms.filter(function (t) { return t.status !== TERM.cancelled && t.status !== TERM.rejected; });
  var next = active.filter(function (t) { return termEnd_(t) > new Date(); })[0] || active[0] || terms[0];
  var now = new Date();
  var out = {
    id: r.id, createdAt: r.createdAt, status: r.status, kind: r.kind, kindLabel: (kind_(r.kind) || {}).label || r.kind, title: r.title,
    requesterName: r.requesterName, requesterEmail: r.requesterEmail, brand: r.brand, boardConsent: r.boardConsent,
    staffNeeded: Number(r.staffNeeded) || 1, assignees: assignees, legacyId: r.legacyId,
    next: next ? { date: next.date, ready: next.ready, start: next.start, end: next.end } : null,
    count: terms.length, outOfHours: terms.some(function (t) { return t.outOfHours && t.status === TERM.pending; }),
    conflict: terms.some(function (t) { return t.conflict && t.status === TERM.pending; }),
    pendingCount: terms.filter(function (t) { return t.status === TERM.pending; }).length
  };
  if (!full) return out;
  var canAny = canApproveAny_(u);
  out.description = r.description; out.format = r.format; out.scope = json_(r.scope, []); out.guests = r.guests; out.platform = r.platform;
  out.meetingLink = r.meetingLink; out.location = r.location; out.parking = r.parking; out.tech = json_(r.tech, []); out.delivery = r.delivery;
  out.notes = r.notes; out.agendaFile = json_(r.agendaFile, null); out.seriesRule = json_(r.seriesRule, null); out.conflictReason = r.conflictReason;
  out.terms = terms.map(function (t) {
    var future = toDate_(t.date, sr_block(t).from) > now;
    return { id: t.id, n: t.n, date: t.date, ready: t.ready, start: t.start, end: t.end, teardownMin: t.teardownMin, travelMin: t.travelMin,
      status: t.status, outOfHours: t.outOfHours, conflict: t.conflict, proposed: t.proposed, before: t.before, decidedBy: t.decidedBy,
      decidedAt: t.decidedAt, decisionNote: t.decisionNote, calChanged: t.calChanged, hasEvent: !!t.eventId,
      canApprove: (t.status === TERM.pending || t.status === TERM.proposal) && future && canApproveTerm_(u, t),
      canCancel: future && (t.status === TERM.pending || t.status === TERM.proposal || t.status === TERM.ok) && (r.requesterEmail === u.email || studio || canAny) };
  });
  out.comments = rows_('Komentarze').filter(function (c) { return c.projectId === r.id; })
    .map(function (c) { return { ts: c.ts, authorName: c.authorName, text: c.text, studio: !!findAccess_(c.authorEmail) && isStudio_({ role: String(findAccess_(c.authorEmail).role) }) }; });
  out.history = rows_('Historia').filter(function (h) { return h.projectId === r.id && (studio || canAny || h.action !== 'Mail'); })
    .map(function (h) { return { ts: h.ts, actor: h.actor, action: h.action, details: h.details }; });
  var mine = assignees.some(function (a) { return a.email === u.email; });
  var live = r.status === REA.pending || r.status === REA.ok || r.status === REA.proposal;
  out.can = {
    approve: out.terms.some(function (t) { return t.canApprove; }),
    approveAny: canAny, manager: isManager_(u), studio: studio,
    acceptProposal: r.requesterEmail === u.email && terms.some(function (t) { return t.status === TERM.proposal; }),
    claim: studio && live && !mine && assignees.length < out.staffNeeded,
    release: studio && mine && live,
    staff: canAny && live,
    montage: (studio || r.requesterEmail === u.email) && r.status !== REA.rejected && r.status !== REA.cancelled
  };
  return out;
}

function getRealization(id) {
  var u = me_();
  var r = findRea_(id);
  if (!r || !canSeeRea_(u, r)) throw new Error('Nie znaleziono zlecenia albo nie masz do niego dostępu.');
  return reaOut_(r, termsOf_(r.id), u, true);
}

// scope: 'mine' — moje zgłoszenia; 'pending' — do akceptacji; 'all' — wszystkie aktywne (studio).
function listRealizations(scope) {
  var u = me_();
  var all = rows_('Terminy').map(normTerm_), by = {};
  all.forEach(function (t) { (by[t.realizationId] = by[t.realizationId] || []).push(t); });
  var since = dl_addDays(ymd_(new Date()), -30);
  return rows_('Realizacje').filter(function (r) {
    if (scope === 'pending') return canApproveAny_(u) && (r.status === REA.pending || r.status === REA.proposal);
    if (scope === 'all') return (isStudio_(u) || canApproveAny_(u)) && (by[r.id] || []).some(function (t) { return t.date >= since; });
    return r.requesterEmail === u.email;
  }).map(function (r) {
    var terms = (by[r.id] || []).sort(function (a, b) { return (a.date + a.ready).localeCompare(b.date + b.ready); });
    return reaOut_(r, terms, u, false);
  });
}

// --- kalendarz ---

function eventTitle_(r) {
  if (isAway_({ kind: r.kind, liveAway: !!r.location })) {
    var city = String(r.location || '').split(',').map(function (x) { return x.trim(); }).filter(String).pop() || r.location;
    return '[WYJAZD] ' + r.title + ' · ' + city;
  }
  return '[STD] ' + r.title + ' · ' + ((kind_(r.kind) || {}).label || r.kind);
}

function eventDesc_(r, t) {
  var lines = [r.description, ''];
  if (t.travelMin) lines.push('Wyjazd: ' + sr_hm(sr_min(t.ready) - t.travelMin) + ' (dojazd ' + t.travelMin + ' min)');
  lines.push('Gotowość ekipy: ' + t.ready, 'Start: ' + t.start, 'Koniec: ' + t.end);
  if (t.teardownMin) lines.push('Zwijanie sprzętu: ' + t.teardownMin + ' min');
  lines.push('');
  var tech = json_(r.tech, []);
  if (tech.length) lines.push('Wymagania techniczne:', tech.map(function (x) { return '• ' + x; }).join('\n'), '');
  [['Format', r.format], ['Zakres', json_(r.scope, []).join(', ')], ['Liczba osób', r.guests], ['Platforma', r.platform], ['Link', r.meetingLink],
    ['Parking', r.parking], ['Forma oddania', r.delivery], ['Zgoda Zarządu TC', r.boardConsent], ['Brand', r.brand],
    ['Zgłasza', r.requesterName + ' (' + r.requesterEmail + ')'], ['Uwagi', r.notes]]
    .forEach(function (x) { if (x[1]) lines.push(x[0] + ': ' + x[1]); });
  lines.push('', 'Zlecenie ' + r.id + ': ' + reaLink_(r.id));
  return lines.join('\n');
}

function eventGuests_(r) {
  return uniq_([r.requesterEmail].concat(json_(r.assignees, []).map(function (a) { return a.email; }))).join(',');
}

function createTermEvent_(r, t) {
  var b = sr_block(t);
  var ev = studioCal_().createEvent(eventTitle_(r), toDate_(t.date, b.from), toDate_(t.date, b.to), {
    description: eventDesc_(r, t), location: r.location || prop_('STUDIO_LOCATION') || '', guests: eventGuests_(r), sendInvites: true
  });
  return ev.getId();
}

function deleteTermEvent_(t) {
  if (!t.eventId) return;
  try { var ev = studioCal_().getEventById(t.eventId); if (ev) ev.deleteEvent(); } catch (e) {}
}

// Dopisuje / usuwa gościa we wszystkich przyszłych wydarzeniach realizacji (po zmianie obsady).
function syncGuests_(r, addEmail, removeEmail) {
  var now = new Date(), cal = studioCal_();
  termsOf_(r.id).forEach(function (t) {
    if (t.status !== TERM.ok || !t.eventId || termEnd_(t) < now) return;
    try {
      var ev = cal.getEventById(t.eventId);
      if (!ev) return;
      if (addEmail) ev.addGuest(addEmail);
      if (removeEmail) ev.removeGuest(removeEmail);
    } catch (e) {}
  });
}

// --- decyzje ---

function reaForDecision_(id, u) {
  var r = findRea_(id);
  if (!r || !canSeeRea_(u, r)) throw new Error('Nie znaleziono zlecenia.');
  return r;
}

// Akceptacja wybranych terminów, opcjonalnie z korektą godzin. items: [{id, date, ready, start, end}].
function approveTerms(id, items, opts) {
  var u = me_();
  opts = opts || {};
  if (!canApproveAny_(u)) throw new Error('Akceptuje zarządzający studiem.');
  if (!(items || []).length) throw new Error('Zaznacz terminy do akceptacji.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var r, done = [];
  try {
    r = reaForDecision_(id, u);
    if (opts.staffNeeded) update_('Realizacje', r._row, { staffNeeded: Math.max(1, Math.min(4, Number(opts.staffNeeded) || 1)) }), r.staffNeeded = opts.staffNeeded;
    var terms = termsOf_(r.id), hs = holSet_();
    var picked = items.map(function (it) {
      var t = terms.filter(function (x) { return x.id === it.id; })[0];
      if (!t || (t.status !== TERM.pending && t.status !== TERM.proposal)) throw new Error('Termin ' + it.id + ' nie czeka na akceptację.');
      var n = Object.assign({}, t, { date: String(it.date || t.date), ready: String(it.ready || t.ready), start: String(it.start || t.start), end: String(it.end || t.end) });
      validateTerm_(n);
      n.outOfHours = sr_outOfHours(n, hs);
      if (n.outOfHours && !isManager_(u)) throw new Error(n.date + ': termin poza godzinami pracy akceptuje zarządzający studiem.');
      if (n.outOfHours && !opts.overtime) throw new Error('Zaznacz „Zgoda na pracę poza godzinami” — część terminów wypada poza ' + SR_WORK[0] + ':00–' + SR_WORK[1] + ':00.');
      return { old: t, t: n };
    });
    var busy = busyMap_(picked.map(function (x) { return x.t.date; }), u, r.id);
    picked.forEach(function (x) {
      var c = sr_conflict(x.t, busy[x.t.date]);
      if (c) throw new Error(x.t.date + ': termin nachodzi na ' + c.start + '–' + c.end + ' (' + c.label + '). Skoryguj godziny albo zaproponuj inny termin.');
      // Terminy z tej samej akceptacji też nie mogą na siebie nachodzić.
      var b = sr_block(x.t);
      busy[x.t.date].push({ start: sr_hm(b.from), end: sr_hm(b.to), label: r.title });
    });
    var rFresh = findRea_(r.id);
    picked.forEach(function (x) {
      var changed = ['date', 'ready', 'start', 'end'].some(function (k) { return x.t[k] !== x.old[k]; });
      var evId = createTermEvent_(rFresh, x.t);
      var patch = { date: x.t.date, ready: x.t.ready, start: x.t.start, end: x.t.end, status: TERM.ok, eventId: evId, outOfHours: x.t.outOfHours ? '1' : '',
        conflict: '', proposed: '', before: changed ? JSON.stringify({ date: x.old.date, ready: x.old.ready, start: x.old.start, end: x.old.end }) : '',
        decidedBy: u.name, decidedAt: nowIso_(), decisionNote: x.t.outOfHours ? 'zgoda na pracę poza godzinami' : '' };
      update_('Terminy', x.old._row, patch);
      done.push(Object.assign({}, x.t, { before: changed ? x.old : null }));
    });
    log_(r.id, u.email, 'Akceptacja', done.length + ' termin(y)' + (opts.overtime ? ' · zgoda na pracę poza godzinami' : ''));
    refreshStatus_(r);
  } finally { lock.releaseLock(); }
  sendReaApprovedMail_(findRea_(r.id), done, u);
  return getRealization(r.id);
}

// Propozycja innego terminu: zgłaszający przyjmuje jednym kliknięciem.
function proposeTerms(id, items, comment) {
  var u = me_();
  if (!canApproveAny_(u)) throw new Error('Termin proponuje zarządzający studiem.');
  if (!(items || []).length) throw new Error('Zaznacz terminy, dla których proponujesz zmianę.');
  comment = String(comment || '').trim().slice(0, 1000);
  var r = reaForDecision_(id, u), terms = termsOf_(r.id), hs = holSet_(), list = [];
  items.forEach(function (it) {
    var t = terms.filter(function (x) { return x.id === it.id; })[0];
    if (!t || (t.status !== TERM.pending && t.status !== TERM.proposal)) throw new Error('Termin ' + it.id + ' nie czeka na akceptację.');
    var n = Object.assign({}, t, { date: String(it.date), ready: String(it.ready), start: String(it.start), end: String(it.end) });
    validateTerm_(n);
    if (sr_outOfHours(n, hs) && !isManager_(u)) throw new Error(n.date + ': termin poza godzinami pracy proponuje zarządzający studiem.');
    var prop = { date: n.date, ready: n.ready, start: n.start, end: n.end };
    update_('Terminy', t._row, { status: TERM.proposal, proposed: JSON.stringify(prop), decidedBy: u.name, decidedAt: nowIso_(), decisionNote: comment });
    list.push({ old: t, prop: prop });
  });
  if (comment) append_('Komentarze', { ts: nowIso_(), projectId: r.id, authorEmail: u.email, authorName: u.name, text: 'Propozycja terminu: ' + comment });
  log_(r.id, u.email, 'Propozycja terminu', list.map(function (x) { return x.prop.date + ' ' + x.prop.start + '–' + x.prop.end; }).join(', '));
  refreshStatus_(r);
  sendReaProposalMail_(r, list, comment, u);
  return getRealization(r.id);
}

// Zgłaszający przyjmuje zaproponowany termin → akceptacja z wpisem do kalendarza.
function acceptProposal(id) {
  var u = me_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var r, done = [];
  try {
    r = findRea_(id);
    if (!r || r.requesterEmail !== u.email) throw new Error('Propozycję przyjmuje osoba zgłaszająca.');
    var terms = termsOf_(r.id).filter(function (t) { return t.status === TERM.proposal && t.proposed; });
    if (!terms.length) throw new Error('Brak propozycji do przyjęcia.');
    var hs = holSet_();
    var picked = terms.map(function (t) { var n = Object.assign({}, t, t.proposed); validateTerm_(n); n.outOfHours = sr_outOfHours(n, hs); return { old: t, t: n }; });
    var busy = busyMap_(picked.map(function (x) { return x.t.date; }), u, r.id);
    picked.forEach(function (x) {
      var c = sr_conflict(x.t, busy[x.t.date]);
      if (c) throw new Error(x.t.date + ': zaproponowany termin został w międzyczasie zajęty. Napisz do studia w komentarzu.');
    });
    picked.forEach(function (x) {
      var evId = createTermEvent_(r, x.t);
      update_('Terminy', x.old._row, { date: x.t.date, ready: x.t.ready, start: x.t.start, end: x.t.end, status: TERM.ok, eventId: evId,
        outOfHours: x.t.outOfHours ? '1' : '', conflict: '', proposed: '', before: JSON.stringify({ date: x.old.date, ready: x.old.ready, start: x.old.start, end: x.old.end }) });
      done.push(Object.assign({}, x.t, { before: x.old }));
    });
    log_(r.id, u.email, 'Przyjęcie terminu', done.length + ' termin(y)');
    refreshStatus_(r);
  } finally { lock.releaseLock(); }
  sendReaProposalAcceptedMail_(r, done, u);
  return getRealization(r.id);
}

function rejectTerms(id, termIds, reason) {
  var u = me_();
  if (!canApproveAny_(u)) throw new Error('Odrzuca zarządzający studiem.');
  reason = String(reason || '').trim().slice(0, 2000);
  if (reason.length < 10) throw new Error('Uzasadnij odrzucenie (min. 10 znaków).');
  var r = reaForDecision_(id, u), list = [];
  termsOf_(r.id).forEach(function (t) {
    if (termIds.indexOf(t.id) < 0) return;
    if (t.status !== TERM.pending && t.status !== TERM.proposal) throw new Error('Termin ' + t.date + ' nie czeka na akceptację.');
    update_('Terminy', t._row, { status: TERM.rejected, proposed: '', decidedBy: u.name, decidedAt: nowIso_(), decisionNote: reason });
    list.push(t);
  });
  if (!list.length) throw new Error('Zaznacz terminy do odrzucenia.');
  log_(r.id, u.email, 'Odrzucenie', reason);
  refreshStatus_(r);
  sendReaRejectedMail_(r, list, reason, u);
  return getRealization(r.id);
}

// termIds: lista albo 'all' (wszystkie przyszłe aktywne terminy).
function cancelTerms(id, termIds) {
  var u = me_();
  var r = reaForDecision_(id, u);
  if (r.requesterEmail !== u.email && !isStudio_(u) && !canApproveAny_(u)) throw new Error('Nie możesz anulować tego zlecenia.');
  var now = new Date(), list = [];
  termsOf_(r.id).forEach(function (t) {
    if (termIds !== 'all' && termIds.indexOf(t.id) < 0) return;
    if ([TERM.pending, TERM.proposal, TERM.ok].indexOf(t.status) < 0 || toDate_(t.date, sr_block(t).from) <= now) return;
    deleteTermEvent_(t);
    update_('Terminy', t._row, { status: TERM.cancelled, eventId: '', proposed: '', decidedBy: u.name, decidedAt: nowIso_() });
    list.push(t);
  });
  if (!list.length) throw new Error('Nie ma przyszłych terminów do anulowania.');
  log_(r.id, u.email, 'Anulowanie', list.map(function (t) { return t.date; }).join(', '));
  refreshStatus_(r);
  sendReaCancelledMail_(r, list, u);
  return getRealization(r.id);
}

// --- obsada ---

function claimRealization(id) {
  var u = requireStudio_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var r;
  try {
    r = findRea_(id);
    if (!r) throw new Error('Nie znaleziono zlecenia.');
    var a = json_(r.assignees, []);
    if (a.some(function (x) { return x.email === u.email; })) return getRealization(id);
    if (a.length >= (Number(r.staffNeeded) || 1)) throw new Error('Obsada jest już kompletna (' + a.map(function (x) { return x.name; }).join(', ') + ').');
    a.push({ email: u.email, name: u.name, at: nowIso_() });
    update_('Realizacje', r._row, { assignees: JSON.stringify(a), updatedAt: nowIso_() });
    r.assignees = JSON.stringify(a);
    log_(r.id, u.email, 'Obsada', u.name + ' bierze realizację');
  } finally { lock.releaseLock(); }
  syncGuests_(r, u.email, null);
  return getRealization(id);
}

function releaseRealization(id) {
  var u = requireStudio_();
  var r = findRea_(id);
  if (!r) throw new Error('Nie znaleziono zlecenia.');
  var a = json_(r.assignees, []).filter(function (x) { return x.email !== u.email; });
  update_('Realizacje', r._row, { assignees: JSON.stringify(a), updatedAt: nowIso_() });
  log_(r.id, u.email, 'Obsada', u.name + ' rezygnuje');
  syncGuests_(r, null, u.email);
  return getRealization(id);
}

function setStaffNeeded(id, n) {
  var u = me_();
  if (!canApproveAny_(u)) throw new Error('Obsadę ustala zarządzający studiem.');
  var r = findRea_(id);
  if (!r) throw new Error('Nie znaleziono zlecenia.');
  n = Math.max(1, Math.min(4, Number(n) || 1));
  if (json_(r.assignees, []).length > n) throw new Error('Przypisanych osób jest więcej niż ' + n + ' — najpierw ktoś musi zrezygnować.');
  update_('Realizacje', r._row, { staffNeeded: n, updatedAt: nowIso_() });
  return getRealization(id);
}

// --- komentarze (wspólna zakładka Komentarze z montażem) ---

function addReaComment_(id, text, u) {
  var r = findRea_(id);
  if (!r || !canSeeRea_(u, r)) throw new Error('Nie znaleziono zlecenia albo nie masz do niego dostępu.');
  append_('Komentarze', { ts: nowIso_(), projectId: r.id, authorEmail: u.email, authorName: u.name, text: text });
  sendReaCommentMail_(r, text, u);
  return getRealization(r.id);
}

// --- codzienna rutyna: synchronizacja z kalendarzem, alert o obsadzie, statusy ---

function ensureStudioTrigger_() {
  if (prop_('STUDIO_TRIGGER')) return;
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailyStudio') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyStudio').timeBased().everyDays(1).atHour(7).inTimezone(TZ).create();
  props_().setProperty('STUDIO_TRIGGER', '1');
}

function dailyStudio() {
  var cal = studioCal_(), now = new Date(), hs = holSet_();
  var reas = {};
  rows_('Realizacje').forEach(function (r) { reas[r.id] = r; });
  var touched = {};
  rows_('Terminy').map(normTerm_).forEach(function (t) {
    var r = reas[t.realizationId];
    if (!r || t.status !== TERM.ok || !t.eventId || termEnd_(t) < now) return;
    var ev = null;
    try { ev = cal.getEventById(t.eventId); } catch (e) {}
    if (!ev) {
      update_('Terminy', t._row, { status: TERM.cancelled, eventId: '', calChanged: 'Wydarzenie usunięte w kalendarzu ' + nowIso_().slice(0, 10) });
      log_(r.id, 'system', 'Termin zmieniony w kalendarzu', t.date + ': wydarzenie usunięte');
      touched[r.id] = true;
      return;
    }
    // Przesunięcie w kalendarzu: przesuwamy gotowość/start o różnicę początku, koniec o różnicę końca.
    var b = sr_block(t), s = ev.getStartTime(), e = ev.getEndTime();
    var dFrom = Math.round((s - toDate_(t.date, b.from)) / 6e4), dTo = Math.round((e - toDate_(t.date, b.to)) / 6e4);
    if (!dFrom && !dTo) return;
    var nd = ymd_(s), shiftDays = sr_daysDiff(t.date, nd) * 1440;
    var n = { date: nd, ready: sr_hm(sr_min(t.ready) + dFrom - shiftDays), start: sr_hm(sr_min(t.start) + dFrom - shiftDays), end: sr_hm(Math.max(sr_min(t.start) + dFrom - shiftDays + 15, sr_min(t.end) + dTo - shiftDays)) };
    n.outOfHours = sr_outOfHours(Object.assign({}, t, n), hs);
    update_('Terminy', t._row, { date: n.date, ready: n.ready, start: n.start, end: n.end, outOfHours: n.outOfHours ? '1' : '',
      calChanged: 'Termin zmieniony w kalendarzu ' + nowIso_().slice(0, 10) + ' (było ' + t.date + ' ' + t.ready + '–' + t.end + ')' });
    log_(r.id, 'system', 'Termin zmieniony w kalendarzu', t.date + ' ' + t.ready + '–' + t.end + ' → ' + n.date + ' ' + n.ready + '–' + n.end);
    touched[r.id] = true;
  });
  // Alert o brakującej obsadzie: 2 dni robocze przed terminem.
  var today = ymd_(now), horizon = today;
  for (var i = 0; i < 2; i++) horizon = sr_nextWorkday(dl_addDays(horizon, 1), hs);
  rows_('Terminy').map(normTerm_).forEach(function (t) {
    var r = reas[t.realizationId];
    if (!r || t.status !== TERM.ok || t.staffAlerted || t.date < today || t.date > horizon) return;
    var a = json_(r.assignees, []);
    if (a.length >= (Number(r.staffNeeded) || 1)) return;
    sendReaStaffAlertMail_(r, t, a);
    update_('Terminy', t._row, { staffAlerted: nowIso_() });
  });
  Object.keys(reas).forEach(function (id) {
    var r = reas[id];
    if (touched[id] || r.status === REA.ok) refreshStatus_(r);
  });
}

// --- migracja z dawnych Rezerwacji (jednorazowo) ---

function migrateRezerwacje_() {
  if (prop_('REZ_MIGRATED') || !sh_('Rezerwacje')) return;
  var map = { 'Potwierdzona': TERM.ok, 'Czeka na zgodę': TERM.pending, 'Odrzucona': TERM.rejected, 'Anulowana': TERM.cancelled };
  var have = {};
  rows_('Realizacje').forEach(function (r) { if (r.legacyId) have[r.legacyId] = true; });
  rows_('Rezerwacje').forEach(function (b) {
    if (have[b.id]) return;
    var id = nextReaId_(), kind = b.format === 'Nagrania avatara' ? 'avatar' : 'studio';
    var r = { id: id, createdAt: b.createdAt, updatedAt: nowIso_(), status: REA.pending, kind: kind, title: b.title, description: b.description,
      requesterName: b.requesterName, requesterEmail: b.requesterEmail, brand: b.brand, format: b.format, scope: '', guests: b.guests, platform: '',
      meetingLink: '', location: '', parking: '', boardConsent: 'Nie jest wymagana', tech: '[]', delivery: '', notes: b.notes, agendaFile: '',
      seriesRule: '', conflictReason: '', staffNeeded: 1, assignees: '[]', folderId: '', legacyId: b.id };
    var t = { id: id + '-01', realizationId: id, n: 1, date: String(b.date), ready: String(b.start), start: String(b.start), end: String(b.end),
      teardownMin: 0, travelMin: 0, status: map[b.status] || TERM.cancelled, eventId: b.eventId || '', outOfHours: '', conflict: '', proposed: '', before: '',
      decidedBy: b.decidedBy || '', decidedAt: b.decidedAt || '', decisionNote: b.decisionNote || '', calChanged: '', staffAlerted: '' };
    t.outOfHours = sr_outOfHours(normTerm_(Object.assign({}, t)), holSet_()) ? '1' : '';
    r.status = reaStatus_([normTerm_(Object.assign({}, t))]);
    append_('Realizacje', r);
    append_('Terminy', t);
  });
  props_().setProperty('REZ_MIGRATED', '1');
}

// Uruchom raz z edytora Apps Script: zgody Google na kalendarz i wyzwalacze + codzienna rutyna o 7:00.
function autoryzujKalendarz() {
  var cal = studioCal_();
  ensureStudioTrigger_();
  Logger.log('OK: ' + cal.getName() + ' · codzienna synchronizacja o 7:00 włączona');
}

// --- maile ---

function reaLink_(id) { return appUrl_() + '?r=' + encodeURIComponent(id); }

function termWhen_(t) {
  var d = String(t.date).split('-');
  return ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][dl_weekday(String(t.date))] + ' ' + d[2] + '.' + d[1] + '.' + d[0] +
    ', ' + t.start + '–' + t.end + (t.ready !== t.start ? ' (gotowość ' + t.ready + ')' : '');
}
function termsHtml_(list, withBefore) {
  return list.map(function (t) {
    var line = '<b>' + termWhen_(t) + '</b>';
    if (withBefore && t.before) line += '<br><span style="color:#7a7a84">było: ' + termWhen_(t.before) + '</span>';
    return line;
  }).join('<br>');
}
function reaRows_(r, terms) {
  var k = (kind_(r.kind) || {}).label || r.kind;
  var rows = [['Zlecenie', r.id], ['Rodzaj', esc_(k)], [terms.length > 1 ? 'Terminy (' + terms.length + ')' : 'Termin', termsHtml_(terms, true)]];
  var rule = json_(r.seriesRule, null);
  if (rule && terms.length > 1) rows.push(['Seria', esc_(sr_describe(rule))]);
  if (r.location) rows.push(['Lokalizacja', esc_(r.location)]);
  if (r.platform) rows.push(['Platforma', esc_(r.platform)]);
  rows.push(['Zgoda Zarządu TC', esc_(r.boardConsent)], ['Zgłasza', esc_(r.requesterName) + ' · ' + esc_(r.requesterEmail)]);
  return rows;
}

function sendReaSubmittedMail_(r, terms) {
  send_(r.id, [r.requesterEmail], [], 'Przyjęliśmy zgłoszenie: ' + r.title,
    mailHtml_('Zgłoszenie czeka na akceptację', 'Dzięki! „' + esc_(r.title) + '" trafiło do studia. Godziny realizacji potwierdzamy indywidualnie — dostaniesz maila z decyzją albo propozycją terminu.',
      reaRows_(r, terms), ['Zobacz zgłoszenie', reaLink_(r.id)]));
}

function sendReaApprovalMail_(r, terms) {
  var out = terms.some(function (t) { return t.outOfHours; });
  var to = managerEmails_().concat(prop_('STUDIO_NOTIFY_NEW') === '1' ? studioEmails_() : []);
  var subj = 'Do akceptacji: ' + r.title + ' · ' + termWhen_(terms[0]).split(' (')[0] + (out ? ' · poza godzinami' : '') + (terms.length > 1 ? ' · seria ×' + terms.length : '');
  var warn = [];
  if (out) warn.push('część terminów wypada poza godzinami ' + SR_WORK[0] + ':00–' + SR_WORK[1] + ':00');
  if (terms.some(function (t) { return t.conflict; })) warn.push('kolizja z kalendarzem — uzasadnienie: „' + esc_(r.conflictReason) + '"');
  if (r.boardConsent === 'Nie') warn.push('brak zgody Zarządu TC na nagrywanie');
  send_(r.id, to, [], subj,
    mailHtml_('Nowe zlecenie studyjne', '<b>' + esc_(r.requesterName) + '</b> zgłasza realizację „' + esc_(r.title) + '".' + (warn.length ? '<br><br><b style="color:#b26a00">Uwaga:</b> ' + warn.join('; ') + '.' : '') +
      '<br><br><div style="white-space:pre-wrap">' + esc_(r.description) + '</div>', reaRows_(r, terms), ['Zaakceptuj lub zaproponuj termin', reaLink_(r.id)]), r.requesterEmail);
}

function sendReaApprovedMail_(r, done, u) {
  var changed = done.some(function (t) { return t.before; });
  send_(r.id, [r.requesterEmail], json_(r.assignees, []).map(function (a) { return a.email; }), 'Zaakceptowane: ' + r.title + ' · ' + termWhen_(done[0]).split(' (')[0] + (done.length > 1 ? ' i ' + (done.length - 1) + ' więcej' : ''),
    mailHtml_('Studio potwierdza realizację', '<b>' + esc_(u.name) + '</b> zaakceptował(a) „' + esc_(r.title) + '". ' + (changed ? 'Godziny zostały skorygowane — sprawdź „było → jest". ' : '') +
      'Termin jest w kalendarzu studia, zaproszenie przyjdzie osobno.', reaRows_(r, done), ['Zobacz zlecenie', reaLink_(r.id)]), u.email);
}

function sendReaProposalMail_(r, list, comment, u) {
  var shown = list.map(function (x) { return Object.assign({}, x.prop, { before: x.old }); });
  send_(r.id, [r.requesterEmail], [], 'Propozycja terminu: ' + r.title,
    mailHtml_('Studio proponuje inny termin', '<b>' + esc_(u.name) + '</b> proponuje zmianę terminu „' + esc_(r.title) + '".' + (comment ? '<br><br><div style="padding:12px 14px;border-radius:10px;background:#f6f6f8;color:#16161a;white-space:pre-wrap">' + esc_(comment) + '</div>' : '') +
      '<br><br>Jeśli pasuje, kliknij <b>Przyjmuję termin</b> w portalu. Jeśli nie — odpisz w komentarzu pod zleceniem.',
      [['Zlecenie', r.id], ['Proponowany termin', termsHtml_(shown, true)]], ['Przyjmuję termin', reaLink_(r.id)]), u.email);
}

function sendReaProposalAcceptedMail_(r, done, u) {
  send_(r.id, managerEmails_().concat(json_(r.assignees, []).map(function (a) { return a.email; })), [], 'Zaakceptowane: ' + r.title + ' · termin przyjęty',
    mailHtml_('Zgłaszający przyjął termin', '<b>' + esc_(u.name) + '</b> przyjął(-ęła) zaproponowany termin „' + esc_(r.title) + '". Wydarzenie jest w kalendarzu studia.',
      reaRows_(r, done), ['Otwórz zlecenie', reaLink_(r.id)]), u.email);
}

function sendReaRejectedMail_(r, list, reason, u) {
  send_(r.id, [r.requesterEmail], [], 'Odrzucone: ' + r.title,
    mailHtml_('Studio nie przyjmie tej realizacji', '<b>' + esc_(u.name) + '</b> odrzucił(a) ' + (list.length > 1 ? list.length + ' terminy' : 'termin') + ' „' + esc_(r.title) + '". Powód:<br><br><div style="padding:12px 14px;border-radius:10px;background:#f6f6f8;color:#16161a;white-space:pre-wrap">' + esc_(reason) + '</div>',
      [['Zlecenie', r.id], ['Odrzucone', termsHtml_(list, false)]], ['Zobacz zlecenie', reaLink_(r.id)]), u.email);
}

function sendReaCancelledMail_(r, list, u) {
  var to = uniq_([r.requesterEmail].concat(managerEmails_(), json_(r.assignees, []).map(function (a) { return a.email; }))).filter(function (e) { return e !== u.email; });
  send_(r.id, to, [], 'Anulowane: ' + r.title + ' · ' + termWhen_(list[0]).split(' (')[0] + (list.length > 1 ? ' i ' + (list.length - 1) + ' więcej' : ''),
    mailHtml_('Realizacja anulowana', '<b>' + esc_(u.name) + '</b> anulował(a) ' + (list.length > 1 ? list.length + ' terminy' : 'termin') + ' „' + esc_(r.title) + '". Sloty w kalendarzu studia są wolne.',
      [['Zlecenie', r.id], ['Anulowane', termsHtml_(list, false)]], ['Otwórz zlecenie', reaLink_(r.id)]));
}

function sendReaStaffAlertMail_(r, t, a) {
  send_(r.id, managerEmails_(), [], 'Brak obsady: ' + r.title + ' · ' + termWhen_(t).split(' (')[0],
    mailHtml_('Brakuje obsady realizacji', '„' + esc_(r.title) + '" ma ' + a.length + ' z ' + (Number(r.staffNeeded) || 1) + ' potrzebnych osób, a termin jest za 2 dni robocze lub wcześniej.',
      [['Zlecenie', r.id], ['Termin', '<b>' + termWhen_(t) + '</b>'], ['Obsada', a.length ? esc_(a.map(function (x) { return x.name; }).join(', ')) : 'nikt']], ['Otwórz zlecenie', reaLink_(r.id)]));
}

function sendReaCommentMail_(r, text, u) {
  var fromStudio = isStudio_(u) || canApproveAny_(u);
  var box = '<div style="padding:12px 14px;border-radius:10px;background:#f6f6f8;color:#16161a;white-space:pre-wrap">' + esc_(text) + '</div>';
  var intro = '<b>' + esc_(u.name) + '</b> dodał(a) komentarz do „' + esc_(r.title) + '":<br><br>' + box;
  var to = fromStudio ? [r.requesterEmail] : (json_(r.assignees, []).map(function (a) { return a.email; }).concat(managerEmails_()));
  send_(r.id, uniq_(to).filter(function (e) { return e !== u.email; }), [], 'Komentarz: ' + r.title,
    mailHtml_(fromStudio ? 'Nowy komentarz od studia' : 'Nowy komentarz od zgłaszającego', intro, [['Zlecenie', r.id]], ['Odpowiedz w portalu', reaLink_(r.id)]), u.email);
}
