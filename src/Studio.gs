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
  return { manager: studioManager_(), canApprove: studioCanApprove_(), notifyNew: prop_('STUDIO_NOTIFY_NEW') !== '0', location: prop_('STUDIO_LOCATION') || '' };
}

function saveStudioSettings(s) {
  requireAdmin_();
  var email = String(s.manager || '').trim().toLowerCase();
  if (email && (!/^[^@\s]+@[^@\s]+$/.test(email) || !domainOk_(email))) throw new Error('Podaj firmowy adres e-mail zarządzającego.');
  var p = props_();
  p.setProperty('STUDIO_MANAGER', email);
  p.setProperty('STUDIO_CAN_APPROVE', s.canApprove ? '1' : '');
  p.setProperty('STUDIO_NOTIFY_NEW', s.notifyNew ? '1' : '0');
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
  t.date = String(t.date); t.ready = hmCell_(t.ready); t.start = hmCell_(t.start); t.end = hmCell_(t.end);
  t.teardownMin = Number(t.teardownMin) || 0; t.travelMin = Number(t.travelMin) || 0;
  t.outOfHours = t.outOfHours === true || t.outOfHours === 'TRUE' || t.outOfHours === 'true' || t.outOfHours === '1';
  t.proposed = json_(t.proposed, null); t.before = json_(t.before, null);
  return t;
}
function termEnd_(t) { return toDate_(t.date, sr_block(t).to); }

// Status zlecenia wyliczany z terminów. Czekające terminy, które minęły bez decyzji, się nie liczą (dailyStudio je anuluje).
// „Zrealizowane" od dnia po ostatnim zaakceptowanym terminie; zarządzający może to cofnąć (holdOpen).
function reaStatus_(terms, holdOpen) {
  var now = new Date(), today = ymd_(now);
  var live = function (t) { return toDate_(t.date, sr_block(t).from) > now; };
  var has = function (s, onlyLive) { return terms.some(function (t) { return t.status === s && (!onlyLive || live(t)); }); };
  if (has(TERM.proposal, true)) return REA.proposal;
  if (has(TERM.pending, true)) return REA.pending;
  if (has(TERM.ok)) {
    var allPast = terms.filter(function (t) { return t.status === TERM.ok; }).every(function (t) { return t.date < today; });
    return allPast && !holdOpen ? REA.done : REA.ok;
  }
  return has(TERM.rejected) ? REA.rejected : REA.cancelled;
}
function refreshStatus_(r) {
  var st = reaStatus_(termsOf_(r.id), r.holdOpen === '1' || r.holdOpen === 1 || r.holdOpen === true);
  if (st !== r.status) update_('Realizacje', r._row, { status: st, updatedAt: nowIso_() });
  r.status = st;
  return st;
}

// --- zajętość ---

// Zajętość dni z kalendarza + terminy czekające na akceptację / z propozycją (wstępnie zajęte, tylko w portalu).
// Zwraca { 'YYYY-MM-DD': [{start, end, label, tentative, reaId, termId}] }.
// opts.skipTerms: { termId: true } — pomiń te terminy (i ich wydarzenia), np. właśnie decydowane;
// opts.realOnly: tylko wydarzenia z kalendarza — przy decyzji czekające zgłoszenia innych nie blokują (to jest kolejka, nie rezerwacja).
function busyMap_(dates, u, opts) {
  opts = opts || {};
  var skip = opts.skipTerms || {};
  var out = {};
  dates.forEach(function (d) { out[d] = []; });
  if (!dates.length) return out;
  var sorted = dates.slice().sort();
  var showTitles = isStudio_(u) || canApproveAny_(u);
  var ownEvents = {}, eventTerm = {};
  var terms = rows_('Terminy').map(normTerm_);
  terms.forEach(function (t) {
    if (t.eventId) { eventTerm[t.eventId] = t; if (skip[t.id]) ownEvents[t.eventId] = true; }
  });
  // Zgłaszający widzi tytuły swoich realizacji (np. właśnie zgłoszony blok w kalendarzu), cudze — tylko „zajęte".
  var info = {};
  rows_('Realizacje').forEach(function (r) { info[r.id] = { title: r.title, mine: r.requesterEmail === u.email }; });
  var see = function (reaId) { return showTitles || !!(info[reaId] && info[reaId].mine); };
  // Kalendarz: jedno zapytanie na okno do 120 dni (długie serie dzielimy na kilka okien).
  var ranges = [];
  sorted.forEach(function (d) {
    var last = ranges[ranges.length - 1];
    if (last && sr_daysDiff(last[0], d) <= 120) last[1] = d; else ranges.push([d, d]);
  });
  ranges.forEach(function (rg) {
    calEvents_(rg[0], rg[1]).forEach(function (e) {
      var id = e[0];
      if (ownEvents[id]) return;
      var s = new Date(e[1]), en = new Date(e[2]), all = !!e[3];
      var first = ymd_(s) < rg[0] ? rg[0] : ymd_(s);
      for (var d = first; d <= rg[1] && d <= ymd_(new Date(en.getTime() - 1)); d = dl_addDays(d, 1)) {
        if (!out[d]) continue;
        var dayFrom = toDate_(d, 0), dayTo = toDate_(d, 1440);
        var from = all || s <= dayFrom ? '00:00' : hm_(s), to = all || en >= dayTo ? '24:00' : hm_(en);
        var et = eventTerm[id], vis = showTitles || (et && see(et.realizationId));
        out[d].push({ start: from, end: to, label: vis ? e[4] : 'Zajęte', tentative: false,
          reaId: vis && et ? et.realizationId : '', termId: vis && et ? et.id : '', mine: !!(et && info[et.realizationId] && info[et.realizationId].mine) });
      }
    });
  });
  var now = new Date();
  if (!opts.realOnly) terms.forEach(function (t) {
    if ((t.status !== TERM.pending && t.status !== TERM.proposal) || skip[t.id]) return;
    var x = t.status === TERM.proposal && t.proposed ? Object.assign({}, t, t.proposed) : t;
    if (!out[x.date]) return;
    var b = sr_block(x);
    if (toDate_(x.date, b.from) <= now) return;  // minął bez decyzji — nie blokuje
    var vis = see(t.realizationId);
    out[x.date].push({ start: sr_hm(b.from), end: sr_hm(b.to), label: vis ? ((info[t.realizationId] || {}).title || t.realizationId) + ' (czeka na akceptację)' : 'Wstępnie zajęte',
      tentative: true, reaId: vis ? t.realizationId : '', termId: vis ? t.id : '', mine: !!(info[t.realizationId] && info[t.realizationId].mine) });
  });
  Object.keys(out).forEach(function (d) { out[d].sort(function (a, b) { return a.start.localeCompare(b.start); }); });
  return out;
}

// Wydarzenia kalendarza studia w zakresie dni jako [id, startMs, endMs, całodniowe, tytuł].
// Calendar REST jednym zapytaniem (CalendarApp robi osobne wywołanie na każdy getter każdego wydarzenia) + cache na 90 s.
// Cache unieważnia bumpCal_() przy każdej zmianie wydarzeń przez portal; zmiany zrobione ręcznie w Google widać najpóźniej po 90 s.
function calEvents_(a, b) {
  var cache = CacheService.getScriptCache(), key = 'ev:' + (cache.get('calVer') || '0') + ':' + a + ':' + b;
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var list = null;
  if (!cache.get('calRestOff')) {
    try { list = calEventsRest_(a, b); } catch (e) { cache.put('calRestOff', String(e.message).slice(0, 200), 21600); }
  }
  if (!list) list = calEventsApp_(a, b);
  try { cache.put(key, JSON.stringify(list), 90); } catch (e) {}  // za duże na cache — trudno
  return list;
}
function bumpCal_() { try { CacheService.getScriptCache().put('calVer', String(Date.now()), 21600); } catch (e) {} }

function calEventsRest_(a, b) {
  var calId = prop_('STUDIO_CAL_ID') || studioCal_().getId(), out = [], page = '';
  var base = 'https:' + '/'.repeat(2) + 'www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calId) + '/events?singleEvents=true&maxResults=2500' +
    '&timeMin=' + encodeURIComponent(toDate_(a, 0).toISOString()) + '&timeMax=' + encodeURIComponent(toDate_(b, 1440).toISOString()) +
    '&fields=' + encodeURIComponent('nextPageToken,items(iCalUID,summary,start,end,status)');
  for (var guard = 0; guard < 10; guard++) {
    var res = UrlFetchApp.fetch(base + (page ? '&pageToken=' + encodeURIComponent(page) : ''), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('Calendar API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 150));
    var j = JSON.parse(res.getContentText());
    (j.items || []).forEach(function (e) {
      if (e.status === 'cancelled' || !e.start || !e.end) return;
      var all = !!e.start.date;
      var st = all ? toDate_(e.start.date, 0) : new Date(e.start.dateTime), en = all ? toDate_(e.end.date, 0) : new Date(e.end.dateTime);
      out.push([e.iCalUID, st.getTime(), en.getTime(), all ? 1 : 0, e.summary || '']);
    });
    page = j.nextPageToken;
    if (!page) return out;
  }
  return out;
}

function calEventsApp_(a, b) {
  return studioCal_().getEvents(toDate_(a, 0), toDate_(b, 1440)).map(function (e) {
    return [e.getId(), e.getStartTime().getTime(), e.getEndTime().getTime(), e.isAllDayEvent() ? 1 : 0, e.getTitle()];
  });
}

function checkDates_(dates, max) {
  if (!Array.isArray(dates) || !dates.length || dates.length > max) throw new Error('Nieprawidłowy zakres dat.');
  dates.forEach(function (d) { if (!sr_validDate(d)) throw new Error('Nieprawidłowa data: ' + d); });
}

function days_(dates, u) {
  var hs = holSet_(), busy = busyMap_(dates, u, {});
  var days = {};
  dates.forEach(function (d) { days[d] = { workday: dl_isWorkday(d, hs), busy: busy[d] }; });
  return days;
}

// Zajętość wybranych dni (kreator: oś dnia, pasek 5 dni, terminy serii).
function studioDays(dates) {
  var u = me_();
  checkDates_(dates, 40);
  return days_(dates, u);
}

// Widok kalendarza studia (tydzień / miesiąc).
function studioRange(from, n) {
  var u = me_();  // kalendarz widzą wszyscy; cudze tytuły tylko studio (busyMap_)
  n = Math.min(42, Math.max(1, Number(n) || 7));
  if (!sr_validDate(from)) throw new Error('Nieprawidłowa data.');
  var dates = [];
  for (var i = 0; i < n; i++) dates.push(dl_addDays(from, i));
  return days_(dates, u);
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
  if (String(p.meetingLink || '').length > 500) err.push('link do spotkania (maks. 500 znaków)');
  if (String(p.agendaText || '').length > 4000) err.push('agenda (maks. 4000 znaków)');
  if (err.length) throw new Error('Uzupełnij: ' + err.join(', ') + '.');
}

// Termin: format, kolejność godzin, mieści się w dobie, nie w przeszłości.
function validateTerm_(t) {
  if (!sr_validDate(t.date)) throw new Error('Nieprawidłowa data terminu: ' + t.date + '.');
  ['ready', 'start', 'end'].forEach(function (k) { if (!sr_validHm(t[k], k === 'end')) throw new Error('Nieprawidłowa godzina w terminie ' + t.date + '.'); });
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
  var teardown = 0, travel = 0;  // czas zwijania i dojazdu ustala studio przy akceptacji
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
    var busy = busyMap_(terms.map(function (t) { return t.date; }), u, {});
    var conflicts = 0;
    terms.forEach(function (t) {
      t.outOfHours = sr_outOfHours(t, hs);
      var c = sr_conflict(t, busy[t.date]);
      t.conflict = c ? c.start + '–' + c.end + (c.label && c.label !== 'Zajęte' && c.label !== 'Wstępnie zajęte' ? ' ' + c.label : '') : '';
      if (c) conflicts++;
    });
    var id = nextReaId_();
    var agenda = null;
    if (p.agendaFile && p.agendaFile.id) {
      var folder = reaFolder_(id);
      claimUpload_(p.agendaFile.id, u.email, folder);
      try { DriveApp.getFileById(p.agendaFile.id).setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
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
      notes: String(p.notes || '').trim(), agendaFile: agenda ? JSON.stringify(agenda) : '', seriesRule: terms.length > 1 ? JSON.stringify(cleanRule_(p.seriesRule)) : '',
      conflictReason: String(p.conflictReason || '').trim().slice(0, 1000), staffNeeded: 1, assignees: '[]', folderId: agenda ? reaFolder_(id).getId() : '', legacyId: '',
      holdOpen: '', linkedMontageId: '', agendaText: String(p.agendaText || '').trim().slice(0, 4000),
      logoBrand: (p.tech || []).indexOf('Tło z logo brandu') >= 0 && BRANDS.indexOf(p.logoBrand) >= 0 ? p.logoBrand : ''
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

// Reguła serii z klienta → tylko dozwolone pola i wartości (trafia do maili i na stronę zlecenia).
function cleanRule_(r) {
  r = r || {};
  var type = ['weekly', 'biweekly', 'monthlyDay', 'monthlyNth', 'manual'].indexOf(r.type) >= 0 ? r.type : 'manual';
  var int = function (v, lo, hi) { v = Math.round(Number(v)); return v >= lo && v <= hi ? v : null; };
  var out = { type: type };
  if (type === 'weekly' || type === 'biweekly') out.weekdays = (Array.isArray(r.weekdays) ? r.weekdays : []).map(function (w) { return int(w, 0, 6); }).filter(function (w) { return w !== null; });
  if (type === 'monthlyDay') out.day = int(r.day, 1, 31) || 1;
  if (type === 'monthlyNth') { out.nth = [1, 2, 3, 4, 5, -1].indexOf(Number(r.nth)) >= 0 ? Number(r.nth) : 1; out.weekday = int(r.weekday, 0, 6) || 1; }
  return out;
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
  out.agendaText = r.agendaText || ''; out.logoBrand = r.logoBrand || ''; out.holdOpen = String(r.holdOpen) === '1';
  out.linkedMontage = String(r.linkedMontageId || '').split(',').filter(String);
  out.terms = terms.map(function (t) {
    var future = toDate_(t.date, sr_block(t).from) > now;
    return { id: t.id, n: t.n, date: t.date, ready: t.ready, start: t.start, end: t.end, teardownMin: t.teardownMin, travelMin: t.travelMin,
      status: t.status, outOfHours: t.outOfHours, conflict: t.conflict, proposed: t.proposed, before: t.before, decidedBy: t.decidedBy,
      decidedAt: t.decidedAt, decisionNote: t.decisionNote, calChanged: t.calChanged, hasEvent: !!t.eventId,
      canApprove: (t.status === TERM.pending || t.status === TERM.proposal) && future && canApproveTerm_(u, t),
      canCancel: future && (t.status === TERM.pending || t.status === TERM.proposal || t.status === TERM.ok) && (r.requesterEmail === u.email || studio || canAny) };
  });
  var ids = [r.id].concat(r.legacyId ? [r.legacyId] : []);
  out.comments = rows_('Komentarze').filter(function (c) { return ids.indexOf(c.projectId) >= 0; })
    .map(function (c) { return { ts: c.ts, authorName: c.authorName, text: c.text, studio: c.authorEmail !== r.requesterEmail && isStudioSide_(c.authorEmail) }; });
  out.history = rows_('Historia').filter(function (h) { return ids.indexOf(h.projectId) >= 0 && (studio || canAny || h.action !== 'Mail'); })
    .map(function (h) { return { ts: h.ts, actor: h.actor, action: h.action, details: h.details }; });
  var mine = assignees.some(function (a) { return a.email === u.email; });
  var live = r.status === REA.pending || r.status === REA.ok || r.status === REA.proposal;
  out.can = {
    approve: out.terms.some(function (t) { return t.canApprove; }),
    approveAny: canAny, manager: isManager_(u), studio: studio,
    acceptProposal: r.requesterEmail === u.email && terms.some(function (t) { return t.status === TERM.proposal; }),
    edit: live && (r.requesterEmail === u.email || studio || canAny),
    claim: studio && live && !mine && assignees.length < out.staffNeeded,
    release: studio && mine && live,
    staff: canAny && live,
    reopen: isManager_(u) && (r.status === REA.done || (r.status === REA.ok && String(r.holdOpen) === '1')),
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
    var o = reaOut_(r, terms, u, false);
    if (scope !== 'pending' && scope !== 'all') o.termsLite = terms.map(function (t) { return { date: t.date, start: t.start, end: t.end, status: t.status }; });
    return o;
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
  if (tech.length) lines.push('Wymagania techniczne:', tech.map(function (x) { return '• ' + x + (x === 'Tło z logo brandu' && r.logoBrand ? ': ' + r.logoBrand : ''); }).join('\n'), '');
  if (r.agendaText) lines.push('Agenda:', r.agendaText, '');
  [['Format', r.format], ['Zakres', json_(r.scope, []).join(', ')], ['Liczba osób', r.guests], ['Platforma', r.platform], ['Link', r.meetingLink],
    ['Parking', r.parking], ['Forma oddania', r.delivery], ['Zgoda Zarządu TC', r.boardConsent], ['Brand', r.brand],
    ['Zgłasza', r.requesterName + ' (' + r.requesterEmail + ')'], ['Uwagi', r.notes]]
    .forEach(function (x) { if (x[1]) lines.push(x[0] + ': ' + x[1]); });
  lines.push('', 'Zlecenie ' + r.id + ': ' + reaLink_(r.id),
    'Pod tym linkiem edytujesz szczegóły realizacji (tytuł, opis, agenda, link do spotkania, lokalizacja, uwagi) — zmiany trafią też do tego wydarzenia. Zmianę godzin ustal w komentarzu pod zleceniem.');
  return lines.join('\n');
}

function eventGuests_(r) {
  return uniq_([r.requesterEmail].concat(json_(r.assignees, []).map(function (a) { return a.email; }))).join(',');
}

function createTermEvent_(r, t) {
  var b = sr_block(t);
  bumpCal_();
  var ev = studioCal_().createEvent(eventTitle_(r), toDate_(t.date, b.from), toDate_(t.date, b.to), {
    description: eventDesc_(r, t), location: r.location || prop_('STUDIO_LOCATION') || '', guests: eventGuests_(r), sendInvites: true
  });
  return ev.getId();
}

// true = wydarzenia już nie ma (usunięte albo nie istniało); false = błąd kalendarza, spróbuj później.
function deleteTermEvent_(t) {
  if (!t.eventId) return true;
  bumpCal_();
  try { var ev = studioCal_().getEventById(t.eventId); if (ev) ev.deleteEvent(); return true; } catch (e) { return false; }
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

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// Zwijanie sprzętu i dojazd: ustawia studio (zgłaszający ich nie podaje).
function extras_(it, t) {
  var lim = function (v, max, dflt) { v = Number(v); return v >= 0 && v <= max ? Math.round(v) : dflt; };
  return { teardownMin: lim(it.teardownMin, 180, t.teardownMin || 0), travelMin: lim(it.travelMin, 240, t.travelMin || 0) };
}

// Unikalne pozycje po id (ten sam termin dwa razy = dwa wydarzenia w kalendarzu).
function uniqItems_(items) {
  var seen = {};
  return (items || []).filter(function (it) { if (!it || seen[it.id]) return false; seen[it.id] = true; return true; });
}

// Wspólne dla akceptacji i przyjęcia propozycji: kolizje sprawdzane z prawdziwymi wydarzeniami (także innymi terminami
// tej samej realizacji) i między decydowanymi terminami; wydarzenie usuwane, jeśli zapis w arkuszu się nie uda.
function commitTerms_(r, picked, u, extraPatch) {
  var skip = {};
  picked.forEach(function (x) { skip[x.old.id] = true; });
  var busy = busyMap_(picked.map(function (x) { return x.t.date; }), u, { skipTerms: skip, realOnly: true });
  picked.forEach(function (x) {
    var c = sr_conflict(x.t, busy[x.t.date]);
    if (c) throw new Error(x.t.date + ': termin nachodzi na ' + c.start + '–' + c.end + ' (' + c.label + '). Skoryguj godziny albo zaproponuj inny termin.');
    var b = sr_block(x.t);
    busy[x.t.date].push({ start: sr_hm(b.from), end: sr_hm(b.to), label: r.title + ' (inny termin tej realizacji)' });
  });
  var done = [], failed = [];
  picked.forEach(function (x) {
    var evId = '';
    try {
      evId = createTermEvent_(r, x.t);
      var changed = ['date', 'ready', 'start', 'end', 'teardownMin', 'travelMin'].some(function (k) { return String(x.t[k]) !== String(x.old[k]); });
      update_('Terminy', x.old._row, Object.assign({ date: x.t.date, ready: x.t.ready, start: x.t.start, end: x.t.end, status: TERM.ok, eventId: evId,
        teardownMin: x.t.teardownMin, travelMin: x.t.travelMin, outOfHours: x.t.outOfHours ? '1' : '', conflict: '', proposed: '',
        before: changed ? JSON.stringify({ date: x.old.date, ready: x.old.ready, start: x.old.start, end: x.old.end, teardownMin: x.old.teardownMin, travelMin: x.old.travelMin }) : '' }, extraPatch(x)));
      done.push(Object.assign({}, x.t, { before: changed ? x.old : null }));
    } catch (e) {
      if (evId) deleteTermEvent_({ eventId: evId });
      failed.push(x.t.date + ': ' + e.message);
    }
  });
  return { done: done, failed: failed };
}

// Akceptacja wybranych terminów, opcjonalnie z korektą godzin. items: [{id, date, ready, start, end}].
function approveTerms(id, items, opts) {
  var u = me_();
  opts = opts || {};
  if (!canApproveAny_(u)) throw new Error('Akceptuje zarządzający studiem.');
  items = uniqItems_(items);
  if (!items.length) throw new Error('Zaznacz terminy do akceptacji.');
  var r, res;
  withLock_(function () {
    r = reaForDecision_(id, u);
    var terms = termsOf_(r.id), hs = holSet_(), now = new Date();
    var picked = items.map(function (it) {
      var t = terms.filter(function (x) { return x.id === it.id; })[0];
      if (!t || (t.status !== TERM.pending && t.status !== TERM.proposal)) throw new Error('Termin ' + it.id + ' nie czeka na akceptację.');
      var n = Object.assign({}, t, { date: String(it.date || t.date), ready: String(it.ready || t.ready), start: String(it.start || t.start), end: String(it.end || t.end) }, extras_(it, t));
      validateTerm_(n);
      n.outOfHours = sr_outOfHours(n, hs);
      if (n.outOfHours && !isManager_(u)) throw new Error(n.date + ': termin poza godzinami pracy akceptuje zarządzający studiem.');
      if (n.outOfHours && !opts.overtime) throw new Error('Zaznacz „Zgoda na pracę poza godzinami” — część terminów wypada poza ' + SR_WORK[0] + ':00–' + SR_WORK[1] + ':00.');
      return { old: t, t: n };
    });
    if (opts.staffNeeded) {
      var need = Math.max(1, Math.min(4, Number(opts.staffNeeded) || 1));
      if (json_(r.assignees, []).length <= need) { update_('Realizacje', r._row, { staffNeeded: need }); r.staffNeeded = need; }
    }
    res = commitTerms_(r, picked, u, function (x) {
      return { decidedBy: u.name, decidedAt: nowIso_(), decisionNote: x.t.outOfHours ? 'zgoda na pracę poza godzinami' : '' };
    });
    if (res.done.length) log_(r.id, u.email, 'Akceptacja', res.done.length + ' termin(y)' + (opts.overtime ? ' · zgoda na pracę poza godzinami' : ''));
    refreshStatus_(r);
  });
  if (res.done.length) sendReaApprovedMail_(findRea_(r.id), res.done, u);
  if (res.failed.length) throw new Error('Nie udało się zaakceptować: ' + res.failed.join('; ') + (res.done.length ? ' (pozostałe zaakceptowane)' : ''));
  return getRealization(r.id);
}

// Propozycja innego terminu: zgłaszający przyjmuje jednym kliknięciem.
function proposeTerms(id, items, comment) {
  var u = me_();
  if (!canApproveAny_(u)) throw new Error('Termin proponuje zarządzający studiem.');
  items = uniqItems_(items);
  if (!items.length) throw new Error('Zaznacz terminy, dla których proponujesz zmianę.');
  comment = String(comment || '').trim().slice(0, 1000);
  var r, list = [];
  withLock_(function () {
    r = reaForDecision_(id, u);
    var terms = termsOf_(r.id), hs = holSet_();
    var picked = items.map(function (it) {
      var t = terms.filter(function (x) { return x.id === it.id; })[0];
      if (!t || (t.status !== TERM.pending && t.status !== TERM.proposal)) throw new Error('Termin ' + it.id + ' nie czeka na akceptację.');
      var n = Object.assign({}, t, { date: String(it.date), ready: String(it.ready), start: String(it.start), end: String(it.end) }, extras_(it, t));
      validateTerm_(n);
      if (sr_outOfHours(n, hs) && !isManager_(u)) throw new Error(n.date + ': termin poza godzinami pracy proponuje zarządzający studiem.');
      return { t: t, prop: { date: n.date, ready: n.ready, start: n.start, end: n.end, teardownMin: n.teardownMin, travelMin: n.travelMin } };
    });
    picked.forEach(function (x) {
      update_('Terminy', x.t._row, { status: TERM.proposal, proposed: JSON.stringify(x.prop), decidedBy: u.name, decidedAt: nowIso_(), decisionNote: comment });
      list.push({ old: x.t, prop: x.prop });
    });
    if (comment) append_('Komentarze', { ts: nowIso_(), projectId: r.id, authorEmail: u.email, authorName: u.name, text: 'Propozycja terminu: ' + comment });
    log_(r.id, u.email, 'Propozycja terminu', list.map(function (x) { return x.prop.date + ' ' + x.prop.start + '–' + x.prop.end; }).join(', '));
    refreshStatus_(r);
  });
  sendReaProposalMail_(r, list, comment, u);
  return getRealization(r.id);
}

// Zgłaszający przyjmuje zaproponowany termin → akceptacja z wpisem do kalendarza.
function acceptProposal(id) {
  var u = me_();
  var r, res;
  withLock_(function () {
    r = findRea_(id);
    if (!r || r.requesterEmail !== u.email) throw new Error('Propozycję przyjmuje osoba zgłaszająca.');
    var now = new Date();
    var terms = termsOf_(r.id).filter(function (t) { return t.status === TERM.proposal && t.proposed; });
    if (!terms.length) throw new Error('Brak propozycji do przyjęcia.');
    var hs = holSet_();
    var picked = terms.map(function (t) { var n = Object.assign({}, t, t.proposed); validateTerm_(n); n.outOfHours = sr_outOfHours(n, hs); return { old: t, t: n }; });
    try {
      res = commitTerms_(r, picked, u, function () { return {}; });
    } catch (e) {
      throw new Error(String(e.message).replace('Skoryguj godziny albo zaproponuj inny termin.', 'Zaproponowany termin został w międzyczasie zajęty — napisz do studia w komentarzu.'));
    }
    if (res.done.length) log_(r.id, u.email, 'Przyjęcie terminu', res.done.length + ' termin(y)');
    refreshStatus_(r);
  });
  if (res.done.length) sendReaProposalAcceptedMail_(r, res.done, u);
  if (res.failed.length) throw new Error('Nie udało się przyjąć: ' + res.failed.join('; '));
  return getRealization(r.id);
}

function rejectTerms(id, termIds, reason) {
  var u = me_();
  if (!canApproveAny_(u)) throw new Error('Odrzuca zarządzający studiem.');
  reason = String(reason || '').trim().slice(0, 2000);
  if (reason.length < 10) throw new Error('Uzasadnij odrzucenie (min. 10 znaków).');
  termIds = Array.isArray(termIds) ? termIds : [];
  var r, list = [];
  withLock_(function () {
    r = reaForDecision_(id, u);
    termsOf_(r.id).forEach(function (t) {
      if (termIds.indexOf(t.id) < 0) return;
      if (t.status !== TERM.pending && t.status !== TERM.proposal) throw new Error('Termin ' + t.date + ' nie czeka na akceptację.');
      list.push(t);
    });
    if (!list.length) throw new Error('Zaznacz terminy do odrzucenia.');
    list.forEach(function (t) { update_('Terminy', t._row, { status: TERM.rejected, proposed: '', decidedBy: u.name, decidedAt: nowIso_(), decisionNote: reason }); });
    log_(r.id, u.email, 'Odrzucenie', reason);
    refreshStatus_(r);
  });
  sendReaRejectedMail_(r, list, reason, u);
  return getRealization(r.id);
}

// termIds: lista albo 'all' (wszystkie przyszłe aktywne terminy).
function cancelTerms(id, termIds) {
  var u = me_();
  var r, list = [], failed = [];
  withLock_(function () {
    r = reaForDecision_(id, u);
    if (r.requesterEmail !== u.email && !isStudio_(u) && !canApproveAny_(u)) throw new Error('Nie możesz anulować tego zlecenia.');
    var now = new Date();
    termsOf_(r.id).forEach(function (t) {
      if (termIds !== 'all' && (!Array.isArray(termIds) || termIds.indexOf(t.id) < 0)) return;
      if ([TERM.pending, TERM.proposal, TERM.ok].indexOf(t.status) < 0 || toDate_(t.date, sr_block(t).from) <= now) return;
      if (!deleteTermEvent_(t)) { failed.push(t.date); return; }
      update_('Terminy', t._row, { status: TERM.cancelled, eventId: '', proposed: '', decidedBy: u.name, decidedAt: nowIso_() });
      list.push(t);
    });
    if (!list.length && !failed.length) throw new Error('Nie ma przyszłych terminów do anulowania.');
    if (list.length) log_(r.id, u.email, 'Anulowanie', list.map(function (t) { return t.date; }).join(', '));
    refreshStatus_(r);
  });
  if (list.length) sendReaCancelledMail_(r, list, u);
  if (failed.length) throw new Error('Nie udało się usunąć wydarzenia z kalendarza (' + failed.join(', ') + ') — spróbuj ponownie za chwilę.');
  return getRealization(r.id);
}

// Zarządzający cofa „Zrealizowane" (np. materiał jeszcze do oddania) albo zamyka ręcznie.
function setRealizationOpen(id, open) {
  var u = me_();
  if (!isManager_(u)) throw new Error('To może zmienić zarządzający studiem.');
  withLock_(function () {
    var r = findRea_(id);
    if (!r) throw new Error('Nie znaleziono zlecenia.');
    update_('Realizacje', r._row, { holdOpen: open ? '1' : '', updatedAt: nowIso_() });
    r.holdOpen = open ? '1' : '';
    log_(r.id, u.email, open ? 'Cofnięto „Zrealizowane”' : 'Oznaczono jako zrealizowane', '');
    refreshStatus_(r);
  });
  return getRealization(id);
}

// --- obsada ---

function claimRealization(id) {
  var u = requireStudio_();
  var r;
  withLock_(function () {
    r = findRea_(id);
    if (!r) throw new Error('Nie znaleziono zlecenia.');
    if ([REA.pending, REA.ok, REA.proposal].indexOf(r.status) < 0) throw new Error('Ta realizacja nie jest już aktywna.');
    var a = json_(r.assignees, []);
    if (a.some(function (x) { return x.email === u.email; })) return;
    if (a.length >= (Number(r.staffNeeded) || 1)) throw new Error('Obsada jest już kompletna (' + a.map(function (x) { return x.name; }).join(', ') + ').');
    a.push({ email: u.email, name: u.name, at: nowIso_() });
    update_('Realizacje', r._row, { assignees: JSON.stringify(a), updatedAt: nowIso_() });
    r.assignees = JSON.stringify(a);
    log_(r.id, u.email, 'Obsada', u.name + ' bierze realizację');
  });
  syncGuests_(r, u.email, null);
  return getRealization(id);
}

function releaseRealization(id) {
  var u = requireStudio_();
  var r;
  withLock_(function () {
    r = findRea_(id);
    if (!r) throw new Error('Nie znaleziono zlecenia.');
    var a = json_(r.assignees, []).filter(function (x) { return x.email !== u.email; });
    update_('Realizacje', r._row, { assignees: JSON.stringify(a), updatedAt: nowIso_() });
    log_(r.id, u.email, 'Obsada', u.name + ' rezygnuje');
  });
  syncGuests_(r, null, u.email);
  return getRealization(id);
}

function setStaffNeeded(id, n) {
  var u = me_();
  if (!canApproveAny_(u)) throw new Error('Obsadę ustala zarządzający studiem.');
  n = Math.max(1, Math.min(4, Number(n) || 1));
  withLock_(function () {
    var r = findRea_(id);
    if (!r) throw new Error('Nie znaleziono zlecenia.');
    if (json_(r.assignees, []).length > n) throw new Error('Przypisanych osób jest więcej niż ' + n + ' — najpierw ktoś musi zrezygnować.');
    update_('Realizacje', r._row, { staffNeeded: n, updatedAt: nowIso_() });
  });
  return getRealization(id);
}

// Zlecenie montażowe założone z realizacji (kreator montażu dostaje id realizacji w szkicu).
function linkMontage_(reaId, projectId, u) {
  try {
    withLock_(function () {
      var r = findRea_(reaId);
      if (!r || !canSeeRea_(u, r)) return;
      var ids = String(r.linkedMontageId || '').split(',').filter(String);
      if (ids.indexOf(projectId) < 0) ids.push(projectId);
      update_('Realizacje', r._row, { linkedMontageId: ids.join(','), updatedAt: nowIso_() });
      log_(r.id, u.email, 'Zlecenie montażowe', projectId);
    });
  } catch (e) {}
}

// --- komentarze (wspólna zakładka Komentarze z montażem) ---

// Strona studia w dyskusji: osoba ze studia albo zarządzający.
function isStudioSide_(email) {
  email = String(email || '').toLowerCase();
  var a = findAccess_(email);
  return (a && isStudio_({ role: String(a.role) })) || (!!studioManager_() && email === studioManager_());
}

var REA_EDITABLE = [['title', 'tytuł'], ['description', 'opis'], ['agendaText', 'agenda'], ['meetingLink', 'link do spotkania'], ['platform', 'platforma'],
  ['location', 'lokalizacja'], ['parking', 'parking'], ['notes', 'uwagi']];

// Zgłaszający i studio poprawiają szczegóły (bez godzin — te idą przez akceptację). Przyszłe wydarzenia w kalendarzu dostają nowy tytuł/opis/miejsce.
function updateReaDetails(id, patch) {
  var u = me_();
  patch = patch || {};
  return withLock_(function () {
    var r = findRea_(id);
    if (!r || !canSeeRea_(u, r)) throw new Error('Nie znaleziono zlecenia albo nie masz do niego dostępu.');
    if ([REA.pending, REA.ok, REA.proposal].indexOf(r.status) < 0) throw new Error('To zlecenie jest zamknięte — nie można już zmienić szczegółów.');
    var away = !!String(r.location || '').trim() || r.kind === 'wyjazd';
    var allowed = { title: 1, description: 1, agendaText: 1, meetingLink: 1, notes: 1, platform: r.kind === 'webinar' || r.kind === 'live', location: away, parking: away };
    var next = {}, changed = [];
    REA_EDITABLE.forEach(function (x) {
      var k = x[0];
      if (!allowed[k] || patch[k] === undefined || patch[k] === null) return;
      var v = String(patch[k]).trim();
      if (v !== String(r[k] || '').trim()) { next[k] = v; changed.push(x[1]); }
    });
    if (!changed.length) return getRealization(r.id);
    var m = Object.assign({}, r, next), err = [];
    if (!String(m.title).trim() || String(m.title).length > 255) err.push('tytuł');
    if (String(m.description || '').trim().length < 40) err.push('opis (min. 40 znaków)');
    if (String(m.agendaText || '').length > 4000) err.push('agenda (maks. 4000 znaków)');
    if (String(m.meetingLink || '').length > 500) err.push('link do spotkania (maks. 500 znaków)');
    if (String(m.notes || '').length > 2000) err.push('uwagi (maks. 2000 znaków)');
    if (allowed.platform && (!String(m.platform || '').trim() || String(m.platform).length > 80)) err.push('platforma');
    if (allowed.location && (!String(m.location || '').trim() || String(m.location).length > 300)) err.push('lokalizacja');
    if (allowed.parking && ['Tak', 'Nie'].indexOf(m.parking) < 0) err.push('miejsce parkingowe');
    if (err.length) throw new Error('Popraw: ' + err.join(', ') + '.');
    next.updatedAt = nowIso_();
    update_('Realizacje', r._row, next);
    var now = new Date(), cal = null, failed = 0;
    termsOf_(r.id).forEach(function (t) {
      if (!t.eventId || t.status !== TERM.ok || toDate_(t.date, sr_block(t).to) < now) return;
      try {
        cal = cal || studioCal_();
        var ev = cal.getEventById(t.eventId);
        if (!ev) return;
        ev.setTitle(eventTitle_(m)); ev.setDescription(eventDesc_(m, t)); ev.setLocation(m.location || prop_('STUDIO_LOCATION') || '');
      } catch (e) { failed++; }
    });
    bumpCal_();
    log_(r.id, u.email, 'Zmiana szczegółów', changed.join(', ') + (failed ? ' · nie udało się zaktualizować ' + failed + ' wydarzeń' : ''));
    sendReaEditedMail_(m, changed, u);
    return getRealization(r.id);
  });
}

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

// Wyzwalacz czasowy (i ręczne uruchomienie z edytora). Z przeglądarki tylko admin; jedna instancja naraz.
function dailyStudio() {
  var active = String(Session.getActiveUser().getEmail() || '').toLowerCase(), owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (active && active !== owner) requireAdmin_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { dailyStudio_(); bumpCal_(); } finally { lock.releaseLock(); }
}

function dailyStudio_() {
  var cal = studioCal_(), now = new Date(), hs = holSet_();
  var reas = {};
  rows_('Realizacje').forEach(function (r) { reas[r.id] = r; });
  var touched = {};
  rows_('Terminy').map(normTerm_).forEach(function (t) {
    var r = reas[t.realizationId];
    if (!r) return;
    // Czekające / z propozycją, które minęły bez decyzji — wygasają.
    if ((t.status === TERM.pending || t.status === TERM.proposal) && toDate_(t.date, sr_block(t).from) <= now) {
      update_('Terminy', t._row, { status: TERM.cancelled, proposed: '', decisionNote: 'Termin minął bez decyzji' });
      log_(r.id, 'system', 'Termin wygasł', t.date + ' — minął bez decyzji');
      touched[r.id] = true;
      return;
    }
    if (t.status !== TERM.ok || !t.eventId || termEnd_(t) < now) return;
    var ev;
    try { ev = cal.getEventById(t.eventId); } catch (e) { return; }  // błąd kalendarza ≠ usunięte — spróbujemy jutro
    if (!ev) {
      update_('Terminy', t._row, { status: TERM.cancelled, eventId: '', calChanged: 'Wydarzenie usunięte w kalendarzu ' + nowIso_().slice(0, 10) });
      log_(r.id, 'system', 'Termin zmieniony w kalendarzu', t.date + ': wydarzenie usunięte');
      touched[r.id] = true;
      return;
    }
    // Przesunięcie w kalendarzu: liczone na czasie zegarowym (bez pułapek zmiany czasu). Blok = gotowość − dojazd … koniec + zwijanie + dojazd.
    var s = ev.getStartTime(), e = ev.getEndTime(), nd = ymd_(s);
    var fromMin = sr_min(hm_(s)), toMin = sr_min(hm_(e)) + sr_daysDiff(nd, ymd_(e)) * 1440;
    var lead = sr_min(t.start) - sr_min(t.ready);
    var ready = fromMin + t.travelMin, start = ready + lead, end = toMin - t.teardownMin - t.travelMin;
    if (ready < 0 || end > 1440 || end - start < 15) {
      var note = 'Wydarzenie w kalendarzu ma godziny, których portal nie odwzoruje (' + nd + ' ' + hm_(s) + '–' + hm_(e) + ') — sprawdź ręcznie';
      if (t.calChanged !== note) { update_('Terminy', t._row, { calChanged: note }); touched[r.id] = true; }
      return;
    }
    var n = { date: nd, ready: sr_hm(ready), start: sr_hm(start), end: sr_hm(end) };
    if (n.date === t.date && n.ready === t.ready && n.start === t.start && n.end === t.end) return;
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
    update_('Terminy', t._row, { staffAlerted: nowIso_() });
    sendReaStaffAlertMail_(r, t, a);
  });
  Object.keys(reas).forEach(function (id) {
    var r = reas[id];
    if (touched[id] || r.status === REA.ok || r.status === REA.pending || r.status === REA.proposal) refreshStatus_(r);
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
      seriesRule: '', conflictReason: '', staffNeeded: 1, assignees: '[]', folderId: '', legacyId: b.id, holdOpen: '', linkedMontageId: '', agendaText: '', logoBrand: '' };
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
  var d = String(t.date).split('-'), x = [];
  if (t.ready && t.ready !== t.start) x.push('gotowość ' + t.ready);
  if (Number(t.travelMin)) x.push('dojazd ' + t.travelMin + ' min');
  if (Number(t.teardownMin)) x.push('zwijanie ' + t.teardownMin + ' min');
  return ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][dl_weekday(String(t.date))] + ' ' + d[2] + '.' + d[1] + '.' + d[0] +
    ', ' + t.start + '–' + t.end + (x.length ? ' (' + x.join(', ') + ')' : '');
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
  var to = managerEmails_().concat(prop_('STUDIO_NOTIFY_NEW') !== '0' ? studioEmails_().filter(function (e) { return e !== r.requesterEmail; }) : []);  // domyślnie jak w montażu: całe studio
  var subj = 'Do akceptacji: ' + r.title + ' · ' + termWhen_(terms[0]).split(' (')[0] + (out ? ' · poza godzinami' : '') + (terms.length > 1 ? ' · seria ×' + terms.length : '');
  var warn = [];
  if (out) warn.push('część terminów wypada poza godzinami ' + SR_WORK[0] + ':00–' + SR_WORK[1] + ':00');
  if (terms.some(function (t) { return t.conflict; })) warn.push('kolizja z kalendarzem (' + esc_(terms.filter(function (t) { return t.conflict; }).map(function (t) { return t.date + ' ' + t.conflict; }).join('; ')) + ')' + (r.conflictReason ? ' — dlaczego ważne: „' + esc_(r.conflictReason) + '"' : ''));
  if (r.boardConsent === 'Nie') warn.push('brak zgody Zarządu TC na nagrywanie');
  send_(r.id, to, [], subj,
    mailHtml_('Nowe zlecenie studyjne', '<b>' + esc_(r.requesterName) + '</b> zgłasza realizację „' + esc_(r.title) + '".' + (warn.length ? '<br><br><b style="color:#b26a00">Uwaga:</b> ' + warn.join('; ') + '.' : '') +
      '<br><br><div style="white-space:pre-wrap">' + esc_(r.description) + '</div>', reaRows_(r, terms), ['Zaakceptuj lub zaproponuj termin', reaLink_(r.id)]), r.requesterEmail);
}

function sendReaApprovedMail_(r, done, u) {
  var changed = done.some(function (t) { return t.before; });
  send_(r.id, [r.requesterEmail], json_(r.assignees, []).map(function (a) { return a.email; }), 'Zaakceptowane: ' + r.title + ' · ' + termWhen_(done[0]).split(' (')[0] + (done.length > 1 ? ' i ' + (done.length - 1) + ' więcej' : ''),
    mailHtml_('Studio potwierdza realizację', '<b>' + esc_(u.name) + '</b> zaakceptował(a) „' + esc_(r.title) + '". ' + (changed ? 'Godziny zostały skorygowane — sprawdź „było → jest". ' : '') +
      'Termin jest w kalendarzu studia, zaproszenie przyjdzie osobno.<br><br>Pod linkiem do zlecenia (jest też w opisie wydarzenia w kalendarzu) możesz <b>edytować szczegóły</b>: tytuł, opis, agendę, link do spotkania, lokalizację i uwagi. Zmiany od razu trafią do wydarzenia. Zmianę godzin ustal ze studiem w komentarzu pod zleceniem.',
      reaRows_(r, done), ['Zobacz lub edytuj zlecenie', reaLink_(r.id)]), u.email);
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

function sendReaEditedMail_(r, changed, u) {
  var byRequester = u.email === r.requesterEmail;
  var to = byRequester ? json_(r.assignees, []).map(function (a) { return a.email; }).concat(managerEmails_()) : [r.requesterEmail];
  to = uniq_(to).filter(function (e) { return e && e !== u.email; });
  if (!to.length) return;
  send_(r.id, to, [], 'Zmiana szczegółów: ' + r.title,
    mailHtml_('Zmienione szczegóły realizacji', '<b>' + esc_(u.name) + '</b> zmienił(a) w „' + esc_(r.title) + '": ' + esc_(changed.join(', ')) + '. Wydarzenia w kalendarzu studia są zaktualizowane.',
      [['Zlecenie', r.id]], ['Zobacz zlecenie', reaLink_(r.id)]), u.email);
}

function sendReaCommentMail_(r, text, u) {
  var fromStudio = u.email !== r.requesterEmail;  // pisze zgłaszający → studio; ktokolwiek inny → zgłaszający
  var box = '<div style="padding:12px 14px;border-radius:10px;background:#f6f6f8;color:#16161a;white-space:pre-wrap">' + esc_(text) + '</div>';
  var intro = '<b>' + esc_(u.name) + '</b> dodał(a) komentarz do „' + esc_(r.title) + '":<br><br>' + box;
  var to = fromStudio ? [r.requesterEmail] : (json_(r.assignees, []).map(function (a) { return a.email; }).concat(managerEmails_()));
  send_(r.id, uniq_(to).filter(function (e) { return e !== u.email; }), [], 'Komentarz: ' + r.title,
    mailHtml_(fromStudio ? 'Nowy komentarz od studia' : 'Nowy komentarz od zgłaszającego', intro, [['Zlecenie', r.id]], ['Odpowiedz w portalu', reaLink_(r.id)]), u.email);
}
