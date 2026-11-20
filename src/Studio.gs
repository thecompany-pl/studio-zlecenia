// Rezerwacje studia nagrań. Źródło prawdy o zajętości: kalendarz Google „Rezerwacja Studio Nagrań".
// W godzinach pracy (dni robocze 9–17) wolny slot rezerwuje się od razu; poza nimi rezerwacja czeka na zgodę zarządzającego studiem.

var STUDIO_CAL_NAME = 'Rezerwacja Studio Nagrań';
var BK_GUESTS = ['1 osoba', '2 osoby', '3 osoby', '4 osoby', '5 i więcej'];
var BK_FORMATS = ['Przebitki', 'TC Talks', 'Setki', 'Nagrania avatara', 'Nagranie zaproszenia'];
var BK = { ok: 'Potwierdzona', pending: 'Czeka na zgodę', rejected: 'Odrzucona', cancelled: 'Anulowana' };
var BK_WORK_FROM = 9, BK_WORK_TO = 17;      // godziny pracy studia
var BK_DAY_FROM = 7, BK_DAY_TO = 22;        // zakres, w którym w ogóle da się zarezerwować

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

// Zarządzający studiem: zgody na rezerwacje poza godzinami pracy. Ustawiany w Ustawieniach; bez niego zgody dają admini.
function studioManager_() { return String(prop_('STUDIO_MANAGER') || '').toLowerCase(); }
function managerEmails_() {
  var m = studioManager_();
  return m ? [m] : rows_('Dostep').filter(function (r) { return r.role === 'admin'; }).map(function (r) { return r.email; });
}
function canApprove_(u) { return u.role === 'admin' || (!!studioManager_() && u.email === studioManager_()); }

function bkDate_(ymd, hm) { return Utilities.parseDate(ymd + ' ' + hm, TZ, 'yyyy-MM-dd HH:mm'); }
function hm_(d) { return Utilities.formatDate(d, TZ, 'HH:mm'); }
function mins_(hm) { var p = String(hm).split(':'); return Number(p[0]) * 60 + Number(p[1]); }

function inWorkHours_(ymd, start, end) {
  return dl_isWorkday(ymd, dl_holidaySet(holidays_())) && mins_(start) >= BK_WORK_FROM * 60 && mins_(end) <= BK_WORK_TO * 60;
}

function nextBkId_() {
  var y = Utilities.formatDate(new Date(), TZ, 'yyyy');
  var key = 'BSEQ_' + y;
  var n = Number(prop_(key) || 0) + 1;
  props_().setProperty(key, String(n));
  return 'REZ-' + y + '-' + ('000' + n).slice(-4);
}

function findBooking_(id) { return rows_('Rezerwacje').filter(function (r) { return r.id === id; })[0] || null; }

// Zajętość dnia: wydarzenia z kalendarza + rezerwacje czekające na zgodę (trzymają slot, żeby nie zatwierdzić dwóch naraz).
function busy_(ymd, u, skipId) {
  var from = bkDate_(ymd, '00:00'), to = bkDate_(dl_addDays(ymd, 1), '00:00');
  var showTitles = isStudio_(u) || canApprove_(u);
  var out = studioCal_().getEvents(from, to).map(function (e) {
    var all = e.isAllDayEvent();
    var s = all || e.getStartTime() < from ? '00:00' : hm_(e.getStartTime());
    var en = all || e.getEndTime() >= to ? '24:00' : hm_(e.getEndTime());
    return { start: s, end: en, label: showTitles ? e.getTitle() : 'Zajęte', tentative: false, eventId: e.getId() };
  });
  rows_('Rezerwacje').forEach(function (r) {
    if (r.status === BK.pending && String(r.date) === ymd && r.id !== skipId) {
      out.push({ start: String(r.start), end: String(r.end), label: showTitles ? r.title + ' (czeka na zgodę)' : 'Wstępnie zajęte', tentative: true });
    }
  });
  return out.sort(function (a, b) { return a.start.localeCompare(b.start); });
}

function overlaps_(busy, start, end, skipEventId) {
  var s = mins_(start), e = mins_(end);
  return busy.filter(function (b) { return b.eventId !== skipEventId && mins_(b.start) < e && mins_(b.end) > s; })[0] || null;
}

function studioDay(ymd) {
  var u = me_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error('Nieprawidłowa data.');
  return { date: ymd, workday: dl_isWorkday(ymd, dl_holidaySet(holidays_())), busy: busy_(ymd, u).map(function (b) { delete b.eventId; return b; }) };
}

function validateBooking_(p) {
  var err = [];
  if (!String(p.title || '').trim() || String(p.title).length > 255) err.push('tytuł');
  if (String(p.description || '').trim().length < 20) err.push('opis (min. 20 znaków)');
  if (!String(p.requesterName || '').trim()) err.push('osoba zgłaszająca');
  if (p.brand && BRANDS.indexOf(p.brand) < 0) err.push('brand');
  if (BK_GUESTS.indexOf(p.guests) < 0) err.push('liczba gości');
  if (BK_FORMATS.indexOf(p.format) < 0) err.push('format wydarzenia');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) err.push('data');
  if (!/^\d{2}:\d{2}$/.test(p.start || '') || !/^\d{2}:\d{2}$/.test(p.end || '')) err.push('godziny');
  if (String(p.notes || '').length > 2000) err.push('uwagi (maks. 2000 znaków)');
  if (err.length) throw new Error('Uzupełnij: ' + err.join(', ') + '.');
  var s = mins_(p.start), e = mins_(p.end);
  if (e - s < 30) throw new Error('Rezerwacja musi trwać co najmniej 30 minut.');
  if (s < BK_DAY_FROM * 60 || e > BK_DAY_TO * 60) throw new Error('Studio można rezerwować w godzinach ' + BK_DAY_FROM + ':00–' + BK_DAY_TO + ':00.');
  if (bkDate_(p.date, p.start) <= new Date()) throw new Error('Ten termin już minął.');
}

function bookStudio(p) {
  var u = me_();
  validateBooking_(p);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var r;
  try {
    var clash = overlaps_(busy_(p.date, u), p.start, p.end);
    if (clash) throw new Error('Ten termin nachodzi na inną rezerwację (' + clash.start + '–' + clash.end + '). Wybierz wolny slot.');
    var inHours = inWorkHours_(p.date, p.start, p.end);
    r = {
      id: nextBkId_(), createdAt: nowIso_(), updatedAt: nowIso_(), status: inHours ? BK.ok : BK.pending,
      title: String(p.title).trim(), description: String(p.description).trim(), requesterName: String(p.requesterName).trim(),
      requesterEmail: u.email, brand: p.brand || '', guests: p.guests, format: p.format,
      date: p.date, start: p.start, end: p.end, notes: String(p.notes || '').trim(), eventId: '', decidedBy: '', decidedAt: '', decisionNote: ''
    };
    if (inHours) r.eventId = createStudioEvent_(r);
    append_('Rezerwacje', r);
    log_(r.id, u.email, inHours ? 'Rezerwacja potwierdzona' : 'Rezerwacja czeka na zgodę', r.date + ' ' + r.start + '–' + r.end);
  } finally { lock.releaseLock(); }
  if (r.status === BK.ok) { sendBookingConfirmedMail_(r); sendBookingStudioMail_(r); }
  else { sendBookingPendingMail_(r); sendBookingApprovalMail_(r); }
  return getBooking(r.id);
}

function createStudioEvent_(r) {
  var info = ['Format: ' + r.format, 'Liczba gości: ' + r.guests, r.brand ? 'Brand: ' + r.brand : '',
    'Zgłasza: ' + r.requesterName + ' (' + r.requesterEmail + ')', r.notes ? 'Uwagi: ' + r.notes : ''].filter(String);
  var desc = r.description + '\n\n' + info.join('\n') + '\n\nRezerwacja ' + r.id + ': ' + bookingLink_(r.id);
  var ev = studioCal_().createEvent(r.title + ' · ' + r.format, bkDate_(r.date, r.start), bkDate_(r.date, r.end),
    { description: desc, guests: r.requesterEmail, sendInvites: true });
  return ev.getId();
}

function bookingOut_(r, u) {
  return {
    id: r.id, createdAt: r.createdAt, status: r.status, title: r.title, description: r.description,
    requesterName: r.requesterName, requesterEmail: r.requesterEmail, brand: r.brand, guests: r.guests, format: r.format,
    date: String(r.date), start: String(r.start), end: String(r.end), notes: r.notes,
    decidedBy: r.decidedBy, decidedAt: r.decidedAt, decisionNote: r.decisionNote,
    inHours: inWorkHours_(String(r.date), String(r.start), String(r.end)),
    can: {
      approve: canApprove_(u) && r.status === BK.pending,
      cancel: (r.requesterEmail === u.email || isStudio_(u) || canApprove_(u)) && (r.status === BK.ok || r.status === BK.pending) &&
        bkDate_(String(r.date), String(r.end)) > new Date()
    }
  };
}

function canSeeBooking_(u, r) { return r.requesterEmail === u.email || isStudio_(u) || canApprove_(u); }

function getBooking(id) {
  var u = me_();
  var r = findBooking_(id);
  if (!r || !canSeeBooking_(u, r)) throw new Error('Nie znaleziono rezerwacji albo nie masz do niej dostępu.');
  return bookingOut_(r, u);
}

// Zgłaszający widzi swoje; studio i zarządzający — wszystkie (od wczoraj w przód + czekające na zgodę).
function listBookings() {
  var u = me_();
  var all = isStudio_(u) || canApprove_(u);
  var since = dl_addDays(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), -1);
  return {
    canApprove: canApprove_(u), all: all,
    manager: studioManager_() ? nameOf_(studioManager_()) : 'admin portalu',
    items: rows_('Rezerwacje').filter(function (r) {
      return r.requesterEmail === u.email || (all && (String(r.date) >= since || r.status === BK.pending));
    }).map(function (r) { return bookingOut_(r, u); })
  };
}

function nameOf_(email) { var a = findAccess_(email); return a ? a.name : nameFromEmail_(email); }

function approveBooking(id) {
  var u = me_();
  if (!canApprove_(u)) throw new Error('Zgodę na rezerwację poza godzinami pracy daje zarządzający studiem.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var r;
  try {
    r = findBooking_(id);
    if (!r || r.status !== BK.pending) throw new Error('Ta rezerwacja nie czeka na zgodę.');
    r.date = String(r.date); r.start = String(r.start); r.end = String(r.end);
    var clash = overlaps_(busy_(r.date, u, r.id), r.start, r.end);
    if (clash) throw new Error('Termin jest już zajęty (' + clash.start + '–' + clash.end + '). Odrzuć rezerwację z prośbą o inny termin.');
    var patch = { status: BK.ok, decidedBy: u.name, decidedAt: nowIso_(), updatedAt: nowIso_() };
    Object.assign(r, patch);
    patch.eventId = r.eventId = createStudioEvent_(r);
    update_('Rezerwacje', r._row, patch);
    log_(id, u.email, 'Zgoda na rezerwację', r.date + ' ' + r.start + '–' + r.end);
  } finally { lock.releaseLock(); }
  sendBookingConfirmedMail_(r, u); sendBookingStudioMail_(r);
  return getBooking(id);
}

function rejectBooking(id, reason) {
  var u = me_();
  if (!canApprove_(u)) throw new Error('Odrzucić rezerwację może zarządzający studiem.');
  reason = String(reason || '').trim().slice(0, 2000);
  if (reason.length < 10) throw new Error('Uzasadnij odrzucenie (min. 10 znaków).');
  var r = findBooking_(id);
  if (!r || r.status !== BK.pending) throw new Error('Ta rezerwacja nie czeka na zgodę.');
  var patch = { status: BK.rejected, decidedBy: u.name, decidedAt: nowIso_(), decisionNote: reason, updatedAt: nowIso_() };
  update_('Rezerwacje', r._row, patch);
  log_(id, u.email, 'Rezerwacja odrzucona', reason);
  sendBookingRejectedMail_(Object.assign(r, patch), u);
  return getBooking(id);
}

function cancelBooking(id) {
  var u = me_();
  var r = findBooking_(id);
  if (!r || !bookingOut_(r, u).can.cancel) throw new Error('Nie możesz anulować tej rezerwacji.');
  if (r.eventId) { try { studioCal_().getEventById(r.eventId).deleteEvent(); } catch (e) {} }
  var patch = { status: BK.cancelled, decidedBy: u.name, decidedAt: nowIso_(), updatedAt: nowIso_() };
  update_('Rezerwacje', r._row, patch);
  log_(id, u.email, 'Rezerwacja anulowana', '');
  Object.assign(r, patch);
  sendBookingCancelledMail_(r, u);
  return getBooking(id);
}

function saveStudioManager(email) {
  requireAdmin_();
  email = String(email || '').trim().toLowerCase();
  if (email && (!/^[^@\s]+@[^@\s]+$/.test(email) || !domainOk_(email))) throw new Error('Podaj firmowy adres e-mail.');
  props_().setProperty('STUDIO_MANAGER', email);
  return getSettings();
}

// --- maile rezerwacji ---

function bookingLink_(id) { return appUrl_() + '?r=' + encodeURIComponent(id); }

function bkWhen_(r) {
  var d = String(r.date).split('-');
  return ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'][dl_weekday(String(r.date))] + ' ' + d[2] + '.' + d[1] + '.' + d[0] + ', ' + r.start + '–' + r.end;
}

function bkRows_(r) {
  return [['Rezerwacja', r.id], ['Termin', '<b>' + bkWhen_(r) + '</b>'], ['Format', esc_(r.format)], ['Liczba gości', esc_(r.guests)],
    ['Brand', esc_(r.brand || '—')], ['Zgłasza', esc_(r.requesterName) + ' · ' + esc_(r.requesterEmail)]];
}

function sendBookingConfirmedMail_(r, approver) {
  send_(r.id, [r.requesterEmail], [], 'Studio zarezerwowane: ' + r.title,
    mailHtml_('Studio jest Twoje', (approver ? '<b>' + esc_(approver.name) + '</b> zgodził(a) się na rezerwację poza godzinami pracy. ' : '') +
      'Rezerwacja „' + esc_(r.title) + '" jest potwierdzona i wpisana do kalendarza studia. Zaproszenie do kalendarza przyjdzie osobno.',
      bkRows_(r), ['Zobacz rezerwację', bookingLink_(r.id)], 'Jeśli plany się zmienią, anuluj rezerwację w portalu — zwolni slot dla innych.'));
}

function sendBookingStudioMail_(r) {
  send_(r.id, studioEmails_(), [], 'Nagranie w studiu: ' + r.title + ' · ' + bkWhen_(r),
    mailHtml_('Nowa rezerwacja studia', '„' + esc_(r.title) + '" — ' + esc_(r.format) + '.<br><br><div style="white-space:pre-wrap">' + esc_(r.description) + '</div>',
      bkRows_(r).concat(r.notes ? [['Uwagi', esc_(r.notes)]] : []), ['Otwórz rezerwację', bookingLink_(r.id)]), r.requesterEmail);
}

function sendBookingPendingMail_(r) {
  send_(r.id, [r.requesterEmail], [], 'Rezerwacja czeka na zgodę: ' + r.title,
    mailHtml_('Rezerwacja czeka na zgodę', 'Wybrany termin wypada poza godzinami pracy studia (dni robocze ' + BK_WORK_FROM + ':00–' + BK_WORK_TO + ':00), więc potrzebna jest zgoda zarządzającego studiem. Slot jest wstępnie zablokowany — dostaniesz maila z decyzją.',
      bkRows_(r), ['Zobacz rezerwację', bookingLink_(r.id)]));
}

function sendBookingApprovalMail_(r) {
  send_(r.id, managerEmails_(), [], 'Prośba o zgodę: studio ' + bkWhen_(r) + ' · ' + r.title,
    mailHtml_('Rezerwacja poza godzinami pracy', '<b>' + esc_(r.requesterName) + '</b> chce zarezerwować studio poza godzinami ' + BK_WORK_FROM + ':00–' + BK_WORK_TO + ':00. Zatwierdź albo odrzuć z uzasadnieniem w portalu.<br><br><div style="white-space:pre-wrap">' + esc_(r.description) + '</div>',
      bkRows_(r).concat(r.notes ? [['Uwagi', esc_(r.notes)]] : []), ['Zatwierdź lub odrzuć', bookingLink_(r.id)]), r.requesterEmail);
}

function sendBookingRejectedMail_(r, u) {
  send_(r.id, [r.requesterEmail], [], 'Rezerwacja odrzucona: ' + r.title,
    mailHtml_('Rezerwacja odrzucona', '<b>' + esc_(u.name) + '</b> nie zgodził(a) się na rezerwację „' + esc_(r.title) + '". Powód:<br><br><div style="padding:12px 14px;border-radius:10px;background:#f6f6f8;color:#16161a;white-space:pre-wrap">' + esc_(r.decisionNote) + '</div>',
      bkRows_(r), ['Zarezerwuj inny termin', appUrl_()], 'Możesz wybrać termin w godzinach pracy studia — wtedy rezerwacja potwierdza się od razu.'), u.email);
}

function sendBookingCancelledMail_(r, u) {
  var to = uniq_([r.requesterEmail].concat(r.eventId ? studioEmails_() : managerEmails_())).filter(function (e) { return e !== u.email; });
  send_(r.id, to, [], 'Rezerwacja anulowana: ' + r.title + ' · ' + bkWhen_(r),
    mailHtml_('Rezerwacja anulowana', '<b>' + esc_(u.name) + '</b> anulował(a) rezerwację „' + esc_(r.title) + '". Slot w kalendarzu studia jest wolny.',
      bkRows_(r), ['Otwórz portal', appUrl_()]));
}

// Uruchom raz z edytora Apps Script po dodaniu rezerwacji: Google poprosi o zgodę na dostęp do kalendarza.
function autoryzujKalendarz() {
  var cal = studioCal_();
  Logger.log('OK: ' + cal.getName() + ' · edycja: ' + (cal.isOwnedByMe() || 'sprawdź uprawnienia „Wprowadzanie zmian w wydarzeniach"'));
}
