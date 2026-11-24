// Atrapa google.script.* do lokalnego podglądu UI (python3 -m http.server w dev/). Dane tylko w pamięci.
(function () {
  const params = new URLSearchParams(location.search);
  const ME = (params.get('as') || 'a.zielinski@example.com').toLowerCase();
  const ACCESS = [
    { email: 'p.nowicki@example.com', name: 'Piotr Nowicki', role: 'studio' },
    { email: 'm.lis@example.com', name: 'Marta Lis', role: 'studio' },
    { email: 'a.zielinski@example.com', name: 'Adam Zieliński', role: 'admin' },
    { email: 'k.wrona@example.com', name: 'Kamil Wrona', role: 'studio' },
    { email: 'e.sowa@example.com', name: 'Ewa Sowa', role: 'admin' }
  ];
  let PRESETS = [{ key: 'rolka', label: 'Rolka', hint: '24 h', days: 1 }, { key: 'trailer', label: 'Trailer', hint: '72 h', days: 3 }, { key: 'showreel', label: 'Showreel', hint: '72 h', days: 3 }, { key: 'avatar', label: 'Avatar', hint: '1 dzień', days: 1, cutoff: 12 }];
  let HOLS = [2026, 2027].flatMap(y => polishHolidays(y));
  const me = () => { const a = ACCESS.find(x => x.email === ME); return { email: ME, name: a ? a.name : ({ 'k.manager@example.com': 'Karol Manager', 't.nowak@example.com': 'Tomasz Nowak' })[ME] || 'Anna Kowalska', role: a ? a.role : 'user' }; };
  const now = () => { const d = new Date(); return { date: d.toISOString().slice(0, 10), hour: d.getHours() + d.getMinutes() / 60 }; };
  const iso = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 19);
  let seq = 3;
  const mk = (id, title, brand, category, priority, status, days, assignee, extra) => Object.assign({
    id, title, brand, category, priority, status, createdAt: iso(), updatedAt: iso(),
    description: 'Rolka podsumowująca wydarzenie: energia sali, 3 krótkie wypowiedzi uczestników, na końcu CTA do zapisów na kolejną edycję. Długość 30–45 s, napisy obowiązkowe.',
    requesterName: 'Anna Kowalska', requesterEmail: 'a.kowalska@example.com', ownerEmail: 'a.kowalska@example.com',
    formats: ['Pionowy 1080×1920', '4:5 1080×1350'], platforms: ['Instagram', 'Facebook'], materialsLink: 'https://drive.google.com/drive/folders/xyz',
    publishDate: '', presetKey: category, workDays: days, deadline: computeDeadline(now().date, now().hour, days, HOLS.map(h => h.date)),
    confirmedDeadline: '', assigneeEmail: assignee ? assignee.email : '', assigneeName: assignee ? assignee.name : '', claimedAt: assignee ? iso() : '',
    deliveryLink: '', scriptFiles: [{ id: 'f1', name: 'scenariusz_forum.docx', size: 48211 }], timecodesFile: null,
    timecodes: [{ from: '00:01:12', to: '00:01:45', note: 'wypowiedź prowadzącego' }, { from: '00:03:02:12', to: '00:03:20:00', note: 'ujęcie sali z góry' }],
    coverFileId: '', coverThumb: '', finalFile: null, revisions: [], acceptedAt: '', history: [{ ts: iso(), actor: 'a.kowalska@example.com', action: 'Zgłoszenie', details: '' }], comments: []
  }, extra || {});
  const P = [
    mk('STU-2026-0001', 'Rolka – podsumowanie Forum BNI Gdańsk', 'BNI', 'rolka', 'wysoki', 'Do akceptacji', 1, ACCESS[1],
      { finalFile: { id: 'demo', name: 'Rolka_Forum_BNI_v1.mp4', mime: 'video/mp4', size: 48200000, at: iso(), by: 'Marta Lis' } }),
    mk('STU-2026-0002', 'Trailer Kongresu CC 2027', 'CC', 'trailer', 'średni', 'W realizacji', 3, ACCESS[1],
      { requesterName: 'Tomasz Nowak', requesterEmail: 't.nowak@example.com', ownerEmail: 't.nowak@example.com' }),
    mk('STU-2026-0003', 'Avatar HeyGen – onboarding nowych członków BNI+', 'BNI+', 'avatar', 'krytyczny', 'Do akceptacji', 1, ACCESS[2],
      { requesterName: 'Karolina Wiśniewska', requesterEmail: 'k.wisniewska@example.com', ownerEmail: 'k.wisniewska@example.com' })
  ];
  // Dane atrapy przeżywają przeładowanie i zmianę ?as= (sessionStorage), żeby dało się przejść flow zgłaszający → studio.
  try { const saved = JSON.parse(sessionStorage.getItem('mockP3') || 'null'); if (saved) { P.splice(0, P.length, ...saved.P); seq = saved.seq; } } catch (e) {}
  const persist = () => { try { sessionStorage.setItem('mockP3', JSON.stringify({ P, seq })); } catch (e) {} };
  const tile = p => ({ id: p.id, title: p.title, status: p.status, brand: p.brand, category: p.category, formats: p.formats, priority: p.priority, deadline: p.deadline, confirmedDeadline: p.confirmedDeadline, assigneeEmail: p.assigneeEmail, assigneeName: p.assigneeName, requesterName: p.requesterName, createdAt: p.createdAt, coverThumb: p.coverThumb });
  const full = p => { const u = me(); const studio = u.role !== 'user'; return Object.assign({}, p, { maxRevisions: 3, can: { decide: (p.requesterEmail === u.email || p.ownerEmail === u.email) && p.status === 'Do akceptacji', studio, claim: studio && !p.assigneeEmail && p.status !== 'Odrzucone', reject: studio && p.status !== 'Odrzucone' && p.status !== 'Gotowe' && (!p.assigneeEmail || p.assigneeEmail === u.email || u.role === 'admin'), edit: studio && p.status !== 'Odrzucone' && (p.assigneeEmail === u.email || u.role === 'admin') } }); };
  const get = id => { const p = P.find(x => x.id === id); if (!p) throw new Error('Nie znaleziono zlecenia.'); return p; };
  // --- zlecenia studyjne (realizacje): zajętość jak w prawdziwym kalendarzu studia ---
  const STS = { manager: 'k.manager@example.com', canApprove: false, notifyNew: false, location: 'ul. Przykładowa 1, Warszawa' };
  const isMgr = () => me().role === 'admin' || ME === STS.manager;
  const canAppr = () => isMgr() || (me().role !== 'user' && STS.canApprove);
  const hsM = () => dl_holidaySet(HOLS);
  const wd = n => { let d = now().date, k = 0; while (k < n) { d = dl_addDays(d, 1); if (dl_isWorkday(d, hsM())) k++; } return d; };
  const CAL = [];  // wydarzenia kalendarza: { id, date, start, end, title }
  [[1, '11:00', '11:45', 'Avatar — nagranie głosu'], [1, '18:00', '19:30', 'Webinar dla Gości BNI'], [2, '10:00', '13:30', 'Warsztat W6 Networking'],
   [2, '17:30', '20:00', 'TC Talks — gość z CC'], [3, '10:30', '11:15', 'Avatar MT'], [4, '10:00', '13:30', 'Szkolenie MSP'], [5, '18:00', '19:30', 'Webinar dla Członków BNI']]
    .forEach(([n, s, e, t], i) => CAL.push({ id: 'ev' + i, date: wd(n), start: s, end: e, title: t }));
  const REAL = [], TERMS = [];
  let rseq = 0;
  const addRea = (r, terms) => {
    const id = 'REA-2026-' + String(++rseq).padStart(4, '0');
    REAL.push(Object.assign({ id, createdAt: iso(), kind: 'studio', brand: '', format: '', scope: [], guests: '', platform: '', meetingLink: '', location: '', parking: '', boardConsent: 'Nie jest wymagana', tech: [], delivery: '', notes: '', agendaFile: null, seriesRule: null, conflictReason: '', staffNeeded: 1, assignees: [], legacyId: '' }, r, { id }));
    terms.forEach((t, i) => TERMS.push(Object.assign({ id: id + '-' + String(i + 1).padStart(2, '0'), realizationId: id, n: i + 1, teardownMin: 0, travelMin: 0, status: 'Czeka', eventId: '', outOfHours: false, conflict: '', proposed: null, before: null, decidedBy: '', decidedAt: '', decisionNote: '', calChanged: '' }, t)));
    TERMS.filter(t => t.realizationId === id).forEach(t => { t.outOfHours = sr_outOfHours(t, hsM()); });
    return id;
  };
  addRea({ title: 'Podcast CC — odcinek 12', description: 'Nagranie podcastu z dwoma gośćmi, ustawienie na trzy kamery, tło z logo CC. Agenda: 17:30 wejście, 18:00–19:00 rozmowa.', requesterName: 'Tomasz Nowak', requesterEmail: 't.nowak@example.com', brand: 'CC', format: 'Setki', guests: '2 osoby', tech: ['Osobny mikrofon dla każdej osoby', 'Tło z logo brandu'], delivery: 'Zmontowany materiał' },
    [{ date: wd(3), ready: '17:00', start: '17:30', end: '19:00' }]);
  addRea({ kind: 'webinar', title: 'Szkolenie AI dla wsparcia', description: 'Szkolenie online na Zoomie, dwie osoby prowadzą ze studia, uczestnicy zdalnie. Przełączanie między prezentacją i ekranami.', requesterName: 'Anna Kowalska', requesterEmail: 'a.kowalska@example.com', brand: 'The Company', platform: 'Zoom', guests: '2 osoby', tech: ['Osobny mikrofon dla każdej osoby', 'Monitor podglądu przy kamerze', 'Przełączanie źródeł (prezentacja / ekran / uczestnik)', 'Zapis całości'], delivery: 'Vimeo z hasłem', seriesRule: { type: 'weekly', weekdays: [dl_weekday(wd(2))], count: 3 } },
    [{ date: wd(2), ready: '13:00', start: '14:00', end: '16:00' }, { date: dl_addDays(wd(2), 7), ready: '13:00', start: '14:00', end: '16:00' }, { date: dl_addDays(wd(2), 14), ready: '13:00', start: '14:00', end: '16:00' }]);
  const reaSt = terms => { const has = s => terms.some(t => t.status === s); if (has('Propozycja')) return 'Propozycja terminu'; if (has('Czeka')) return 'Czeka na akceptację'; if (has('Zaakceptowany')) return 'Zaakceptowane'; return has('Odrzucony') ? 'Odrzucone' : 'Anulowane'; };
  const tOf = id => TERMS.filter(t => t.realizationId === id).sort((a, b) => (a.date + a.ready).localeCompare(b.date + b.ready));
  const reaGet = id => { const r = REAL.find(x => x.id === id || x.legacyId === id); if (!r) throw new Error('Nie znaleziono zlecenia.'); return r; };
  const evTitle = r => (r.kind === 'wyjazd' || r.location ? '[WYJAZD] ' : '[STD] ') + r.title;
  const busyOf = (date, skip) => {
    const show = me().role !== 'user' || canAppr();
    const mineR = id => { const r = REAL.find(x => x.id === id); return !!(r && r.requesterEmail === ME); };
    const evs = CAL.filter(e => e.date === date && !(skip && e.termId === skip)).map(e => { const v = show || (e.reaId && mineR(e.reaId)); return { start: e.start, end: e.end, label: v ? e.title : 'Zajęte', tentative: false, reaId: v ? (e.reaId || '') : '', termId: v ? (e.termId || '') : '', mine: !!(e.reaId && mineR(e.reaId)) }; });
    const tent = TERMS.filter(t => (t.status === 'Czeka' || t.status === 'Propozycja') && t.id !== skip).map(t => t.status === 'Propozycja' && t.proposed ? Object.assign({}, t, t.proposed) : t)
      .filter(t => t.date === date).map(t => { const b = sr_block(t); const v = show || mineR(t.realizationId); return { start: sr_hm(b.from), end: sr_hm(b.to), label: v ? reaGet(t.realizationId).title + ' (czeka na akceptację)' : 'Wstępnie zajęte', tentative: true, reaId: v ? t.realizationId : '', termId: v ? t.id : '', mine: mineR(t.realizationId) }; });
    return evs.concat(tent).sort((a, b) => a.start.localeCompare(b.start));
  };
  const kindL = k => ({ studio: 'Nagranie w studiu', avatar: 'Nagranie avatara', webinar: 'Webinar / szkolenie online', live: 'Transmisja live', wyjazd: 'Obsługa wyjazdowa' })[k] || k;
  const reaOut = (r, full) => {
    const u = me(), terms = tOf(r.id), studio = u.role !== 'user', live = ['Czeka na akceptację', 'Zaakceptowane', 'Propozycja terminu'].includes(reaSt(terms));
    const act = terms.filter(t => t.status !== 'Anulowany' && t.status !== 'Odrzucony'), next = act[0] || terms[0];
    const out = Object.assign({}, r, { status: reaSt(terms), kindLabel: kindL(r.kind), next: next && { date: next.date, ready: next.ready, start: next.start, end: next.end }, count: terms.length,
      outOfHours: terms.some(t => t.outOfHours && t.status === 'Czeka'), conflict: terms.some(t => t.conflict && t.status === 'Czeka'), pendingCount: terms.filter(t => t.status === 'Czeka').length });
    if (!full) return out;
    const mine = r.assignees.some(a => a.email === ME);
    out.terms = terms.map(t => Object.assign({}, t, { hasEvent: !!t.eventId, canApprove: (t.status === 'Czeka' || t.status === 'Propozycja') && (isMgr() || (!t.outOfHours && studio && STS.canApprove)),
      canCancel: ['Czeka', 'Propozycja', 'Zaakceptowany'].includes(t.status) && (r.requesterEmail === ME || studio || canAppr()) }));
    out.comments = (COMMENTS[r.id] || []); out.linkedMontage = r.linkedMontage || []; out.agendaText = r.agendaText || ''; out.logoBrand = r.logoBrand || ''; out.holdOpen = !!r.holdOpen; out.history = HIST[r.id] || [{ ts: r.createdAt, actor: r.requesterEmail, action: 'Zgłoszenie realizacji', details: '' }];
    out.can = { edit: ['Czeka na akceptację', 'Zaakceptowane', 'Propozycja terminu'].includes(reaSt(terms)) && (r.requesterEmail === ME || studio || canAppr()), approve: out.terms.some(t => t.canApprove), approveAny: canAppr(), manager: isMgr(), studio, acceptProposal: r.requesterEmail === ME && terms.some(t => t.status === 'Propozycja'), reopen: isMgr() && reaSt(terms) === 'Zaakceptowane' && !!r.holdOpen,
      claim: studio && live && !mine && r.assignees.length < r.staffNeeded, release: studio && mine && live, staff: canAppr() && live, montage: studio || r.requesterEmail === ME };
    return out;
  };
  const COMMENTS = {}, HIST = {};
  const hist = (id, action, details) => { (HIST[id] = HIST[id] || [{ ts: reaGet(id).createdAt, actor: reaGet(id).requesterEmail, action: 'Zgłoszenie realizacji', details: '' }]).push({ ts: iso(), actor: ME, action, details: details || '' }); };
  const settings = () => ({ access: ACCESS, presets: PRESETS, holidays: HOLS, studioManager: STS.manager, studio: Object.assign({}, STS) });
  try { const sv = JSON.parse(sessionStorage.getItem('mockREA') || 'null'); if (sv) { REAL.splice(0, REAL.length, ...sv.REAL); TERMS.splice(0, TERMS.length, ...sv.TERMS); CAL.splice(0, CAL.length, ...sv.CAL); Object.assign(COMMENTS, sv.COMMENTS); Object.assign(HIST, sv.HIST); Object.assign(STS, sv.STS); rseq = sv.rseq; } } catch (e) {}
  const persistRea = () => { try { sessionStorage.setItem('mockREA', JSON.stringify({ REAL, TERMS, CAL, COMMENTS, HIST, STS, rseq })); } catch (e) {} };
  const REA_API = {
    studioDays: dates => Object.fromEntries(dates.map(d => [d, { workday: dl_isWorkday(d, hsM()), busy: busyOf(d) }])),
    studioRange: (from, n) => REA_API.studioDays(Array.from({ length: n }, (_, i) => dl_addDays(from, i))),
    createRealization: p => {
      if (!p.terms.length) throw new Error('Wybierz termin.');
      const terms = p.terms.map(t => Object.assign({}, t, { teardownMin: 0, travelMin: 0 }));
      terms.forEach(t => { const c = sr_conflict(t, busyOf(t.date)); t.conflict = c ? c.start + '–' + c.end + ' ' + c.label : ''; });
      const id = addRea(Object.assign({}, p, { requesterEmail: ME, agendaFile: p.agendaFile ? { id: p.agendaFile.id, name: p.agendaFile.name, size: p.agendaFile.size } : null }), terms);
      return reaOut(reaGet(id), true);
    },
    listRealizations: scope => REAL.filter(r => scope === 'pending' ? canAppr() && ['Czeka na akceptację', 'Propozycja terminu'].includes(reaSt(tOf(r.id))) : scope === 'all' ? true : r.requesterEmail === ME).map(r => Object.assign(reaOut(r, false), scope === 'mine' ? { termsLite: tOf(r.id).map(t => ({ date: t.date, start: t.start, end: t.end, status: t.status })) } : {})),
    updateReaDetails: (id, patch) => {
      const r = reaGet(id);
      if (String(patch.description || '').trim().length < 40) throw new Error('Popraw: opis (min. 40 znaków).');
      const ch = Object.keys(patch).filter(k => String(patch[k]).trim() !== String(r[k] || '').trim());
      ch.forEach(k => { r[k] = String(patch[k]).trim(); });
      if (ch.length) hist(id, 'Zmiana szczegółów', ch.join(', '));
      return reaOut(r, true);
    },
    getRealization: id => reaOut(reaGet(id), true),
    approveTerms: (id, items, opts) => {
      const r = reaGet(id);
      if (opts && opts.staffNeeded) r.staffNeeded = opts.staffNeeded;
      items.forEach(it => {
        const t = TERMS.find(x => x.id === it.id), n = Object.assign({}, t, it);
        n.outOfHours = sr_outOfHours(n, hsM());
        if (n.outOfHours && !isMgr()) throw new Error(n.date + ': termin poza godzinami pracy akceptuje zarządzający studiem.');
        if (n.outOfHours && !(opts && opts.overtime)) throw new Error('Zaznacz „Zgoda na pracę poza godzinami”.');
        const c = sr_conflict(n, busyOf(n.date, t.id).filter(b => !b.tentative));
        if (c) throw new Error(n.date + ': termin nachodzi na ' + c.start + '–' + c.end + ' (' + c.label + ').');
        const changed = ['date', 'ready', 'start', 'end'].some(k => n[k] !== t[k]);
        const evId = 'ev' + Math.round(Math.random() * 1e6), b = sr_block(n);
        CAL.push({ id: evId, date: n.date, start: sr_hm(b.from), end: sr_hm(b.to), title: evTitle(r), reaId: r.id, termId: t.id });
        Object.assign(t, { date: n.date, ready: n.ready, start: n.start, end: n.end, status: 'Zaakceptowany', eventId: evId, outOfHours: n.outOfHours, conflict: '', proposed: null, before: changed ? { date: t.date, ready: t.ready, start: t.start, end: t.end } : null, decidedBy: me().name, decidedAt: iso() });
      });
      hist(id, 'Akceptacja', items.length + ' termin(y)');
      return reaOut(r, true);
    },
    proposeTerms: (id, items, comment) => { items.forEach(it => { const t = TERMS.find(x => x.id === it.id); Object.assign(t, { status: 'Propozycja', proposed: { date: it.date, ready: it.ready, start: it.start, end: it.end }, decisionNote: comment || '', decidedBy: me().name }); }); hist(id, 'Propozycja terminu', ''); return reaOut(reaGet(id), true); },
    acceptProposal: id => { const r = reaGet(id); tOf(id).filter(t => t.status === 'Propozycja').forEach(t => { const n = Object.assign({}, t, t.proposed); const b = sr_block(n); const evId = 'ev' + Math.round(Math.random() * 1e6); CAL.push({ id: evId, date: n.date, start: sr_hm(b.from), end: sr_hm(b.to), title: evTitle(r), reaId: id, termId: t.id }); Object.assign(t, { date: n.date, ready: n.ready, start: n.start, end: n.end, status: 'Zaakceptowany', eventId: evId, outOfHours: sr_outOfHours(n, hsM()), before: { date: t.date, ready: t.ready, start: t.start, end: t.end }, proposed: null }); }); hist(id, 'Przyjęcie terminu', ''); return reaOut(r, true); },
    rejectTerms: (id, ids, reason) => { if (String(reason).trim().length < 10) throw new Error('Uzasadnij odrzucenie (min. 10 znaków).'); ids.forEach(x => Object.assign(TERMS.find(t => t.id === x), { status: 'Odrzucony', decisionNote: reason, decidedBy: me().name, decidedAt: iso(), proposed: null })); hist(id, 'Odrzucenie', reason); return reaOut(reaGet(id), true); },
    cancelTerms: (id, ids) => { tOf(id).filter(t => (ids === 'all' || ids.includes(t.id)) && ['Czeka', 'Propozycja', 'Zaakceptowany'].includes(t.status)).forEach(t => { const i = CAL.findIndex(e => e.id === t.eventId); if (i >= 0) CAL.splice(i, 1); Object.assign(t, { status: 'Anulowany', eventId: '' }); }); hist(id, 'Anulowanie', ''); return reaOut(reaGet(id), true); },
    claimRealization: id => { const r = reaGet(id); if (r.assignees.length >= r.staffNeeded) throw new Error('Obsada jest już kompletna.'); r.assignees.push({ email: ME, name: me().name }); return reaOut(r, true); },
    releaseRealization: id => { const r = reaGet(id); r.assignees = r.assignees.filter(a => a.email !== ME); return reaOut(r, true); },
    setRealizationOpen: (id, open) => { const r = reaGet(id); r.holdOpen = !!open; hist(id, open ? 'Cofnięto „Zrealizowane”' : 'Oznaczono jako zrealizowane', ''); return reaOut(r, true); },
    setStaffNeeded: (id, n) => { const r = reaGet(id); r.staffNeeded = n; return reaOut(r, true); },
    saveStudioSettings: s => { Object.assign(STS, { manager: s.manager, canApprove: !!s.canApprove, notifyNew: !!s.notifyNew, location: s.location }); return settings(); },
    startDirectUpload: () => { throw new Error('direct-network'); },
    startFinalDirect: () => { throw new Error('direct-network'); }
  };
  const API = {
    getBootstrap: () => ({ user: me(), presets: PRESETS, holidays: HOLS, statuses: ['Nowe', 'W realizacji', 'Do akceptacji', 'Gotowe'], brands: ['The Company', 'CC', 'BNI', 'BNI+', 'CC+', 'Fundacja', 'Think Tank'], categories: ['rolka', 'trailer', 'showreel', 'avatar', 'inne'], formats: ['4:5 1080×1350', 'Kwadrat 1080×1080', 'Pionowy 1080×1920', 'Poziomy 1920×1080'], platforms: ['Facebook', 'Instagram', 'TikTok', 'YT', 'Hubspot', 'Społeczność CC', 'Whatsapp'], priorities: [{ key: 'krytyczny', label: 'Krytyczny', sla: 'poniżej 1 dnia rob., ASAP' }, { key: 'wysoki', label: 'Wysoki', sla: 'do 2 dni rob.' }, { key: 'średni', label: 'Średni', sla: 'do 3 dni rob.' }, { key: 'niski', label: 'Niski', sla: '4–5 dni rob.' }], domains: ['tc.pl', 'bnipolska.pl', 'cc.pl', 'example.com'], rea: { kinds: [{ key: 'studio', label: 'Nagranie w studiu', hint: 'setki, przebitki, TC Talks, zaproszenia, panel', where: 'studio' }, { key: 'avatar', label: 'Nagranie avatara', hint: 'HeyGen: wideo + głos', where: 'studio' }, { key: 'webinar', label: 'Webinar / szkolenie online', hint: 'Zoom/Teams prowadzony ze studia, realizacja na żywo', where: 'studio' }, { key: 'live', label: 'Transmisja live', hint: 'stream na YouTube, Facebook lub inną platformę', where: 'any' }, { key: 'wyjazd', label: 'Obsługa wyjazdowa', hint: 'ekipa z kamerą na evencie, w biurze, u klienta', where: 'location' }], formats: ['Przebitki', 'TC Talks', 'Setki', 'Nagrania avatara', 'Nagranie zaproszenia'], scope: ['Nagranie setek', 'Nagranie przebitek', 'Nagranie panelu'], guests: ['1 osoba', '2 osoby', '3 osoby', '4 osoby', '5 i więcej'], platforms: ['Zoom', 'Teams', 'YouTube Live', 'Facebook Live', 'inna'], consent: ['Tak', 'Nie', 'Nie jest wymagana'], tech: ['Osobny mikrofon dla każdej osoby', 'Monitor podglądu przy kamerze', 'Przełączanie źródeł (prezentacja / ekran / uczestnik)', 'Telewizor z prezentacją w kadrze', 'Prompter', 'Tło z logo brandu', 'Zapis całości'], delivery: ['Surowy plik', 'Zmontowany materiał', 'Vimeo z hasłem', 'Bez zapisu'], work: [9, 17], day: [6, 24], max: 26, statuses: { pending: 'Czeka na akceptację', ok: 'Zaakceptowane', proposal: 'Propozycja terminu', rejected: 'Odrzucone', cancelled: 'Anulowane', done: 'Zrealizowane' }, termStatuses: { pending: 'Czeka', ok: 'Zaakceptowany', proposal: 'Propozycja', rejected: 'Odrzucony', cancelled: 'Anulowany' } }, canApproveRea: canAppr(), isManager: isMgr(), now: now(), appUrl: location.href }),
    uploadChunk: () => true,
    finalizeUpload: (id, total, name, mime) => ({ id: 'up_' + id, name, mime, size: 1000 }),
    submitRequest: d => {
      const id = 'STU-2026-' + String(++seq).padStart(4, '0');
      const p = mk(id, d.title, d.brand, d.category, d.priority, 'Nowe', d.workDays, null, { description: d.description, requesterName: d.requesterName, requesterEmail: ME, ownerEmail: d.ownerEmail, formats: d.formats, platforms: d.platforms, materialsLink: d.materialsLink, publishDate: d.publishDate, scriptFiles: d.scriptFiles, timecodesFile: d.timecodesFile, timecodes: d.timecodes, coverThumb: d.coverThumb, coverFileId: d.cover ? d.cover.id : '' });
      P.push(p); return { id, deadline: p.deadline };
    },
    listBoard: () => P.map(tile),
    listMine: () => P.filter(p => me().role !== 'user' ? p.assigneeEmail === ME : (p.requesterEmail === ME || p.ownerEmail === ME)).map(tile),
    getProject: id => full(get(id)),
    claimProject: id => { const p = get(id), u = me(); if (p.assigneeEmail && p.assigneeEmail !== u.email) throw new Error('Już przyjął: ' + p.assigneeName); Object.assign(p, { assigneeEmail: u.email, assigneeName: u.name, claimedAt: iso(), status: p.status === 'Nowe' ? 'W realizacji' : p.status }); p.history.push({ ts: iso(), actor: u.email, action: 'Przyjęte', details: u.name + ' bierze zadanie' }); return full(p); },
    releaseProject: id => { const p = get(id); Object.assign(p, { assigneeEmail: '', assigneeName: '', status: 'Nowe' }); p.history.push({ ts: iso(), actor: ME, action: 'Zwolnione', details: '' }); return full(p); },
    updateProject: (id, patch) => { const p = get(id); if (patch.status === 'Gotowe' && !(patch.deliveryLink || p.deliveryLink || p.finalFile)) throw new Error('Przed „Gotowe" wklej link do gotowego materiału.'); Object.assign(p, patch); p.history.push({ ts: iso(), actor: ME, action: 'Zmiana', details: JSON.stringify(patch) }); return full(p); },
    addComment: (id, text) => { if (/^RE[AZ]-/.test(id)) { (COMMENTS[id] = COMMENTS[id] || []).push({ ts: iso(), authorName: me().name, text, studio: me().role !== 'user' || canAppr() }); return reaOut(reaGet(id), true); } const p = get(id); p.comments.push({ ts: iso(), authorName: me().name, authorEmail: ME, text, studio: me().role !== 'user' }); return full(p); },
    startFinalUpload: (pid, name, mime, size) => { const p = get(pid); p._up = { name, mime, size }; return pid; },
    uploadFinalChunk: (id, offset, b64) => { const p = get(id); const n = offset + atob(b64).length; if (n < p._up.size) return { done: false, next: n }; p.finalFile = { id: 'demo', name: p._up.name, mime: p._up.mime, size: p._up.size, at: iso(), by: me().name }; p.history.push({ ts: iso(), actor: ME, action: 'Plik finalny', details: p._up.name }); return { done: true, project: full(p) }; },
    rejectProject: (id, reason) => { const p = get(id); if (String(reason).trim().length < 10) throw new Error('Uzasadnij odrzucenie (min. 10 znaków).'); Object.assign(p, { status: 'Odrzucone', rejectReason: reason, rejectedAt: iso(), rejectedBy: me().name }); p.history.push({ ts: iso(), actor: ME, action: 'Odrzucone', details: reason }); return full(p); },
    acceptProject: id => { const p = get(id); if (p.status !== 'Do akceptacji') throw new Error('To zlecenie nie czeka teraz na akceptację.'); Object.assign(p, { status: 'Gotowe', acceptedAt: iso() }); p.history.push({ ts: iso(), actor: ME, action: 'Zaakceptowane', details: '' }); return full(p); },
    requestRevision: (id, text) => { const p = get(id); if (p.revisions.length >= 3) throw new Error('Wykorzystano już 3 z 3 tur poprawek.'); p.revisions.push({ n: p.revisions.length + 1, text, at: iso(), by: ME }); p.status = 'W realizacji'; p.history.push({ ts: iso(), actor: ME, action: 'Poprawki ' + p.revisions.length + '/3', details: text }); return full(p); },
    getFile: (pid, fid) => ({ name: 'plik.txt', mime: 'text/plain', b64: btoa('demo') }),
    getSettings: settings,
    addAccess: (email, name, role) => { ACCESS.push({ email, name: name || email, role }); return settings(); },
    removeAccess: email => { const i = ACCESS.findIndex(a => a.email === email); if (i >= 0) ACCESS.splice(i, 1); return settings(); },
    savePresets: list => { PRESETS = list; return settings(); },
    addHoliday: (date, name) => { HOLS.push({ date, name }); return settings(); },
    removeHoliday: date => { HOLS = HOLS.filter(h => h.date !== date); return settings(); }
  };
  function runner(ok, fail) {
    return new Proxy({}, { get(_, k) {
      if (k === 'withSuccessHandler') return f => runner(f, fail);
      if (k === 'withFailureHandler') return f => runner(ok, f);
      return (...args) => setTimeout(() => { try { const r = (API[k] || REA_API[k])(...JSON.parse(JSON.stringify(args))); persist(); persistRea(); ok && ok(JSON.parse(JSON.stringify(r ?? null))); } catch (e) { fail && fail(e); } }, 250);
    } });
  }
  let handler = null;
  window.google = { script: {
    get run() { return runner(null, null); },
    history: {
      push(s, p, h) { history.pushState(null, '', '#' + (h || '')); },
      replace(s, p, h) { history.replaceState(null, '', '#' + (h || '')); },
      setChangeHandler(f) { handler = f; }
    },
    url: { getLocation(cb) { cb({ hash: location.hash.slice(1), parameter: Object.fromEntries(params) }); } }
  } };
  window.addEventListener('popstate', () => handler && handler({ location: { hash: location.hash.slice(1) } }));
})();

// Przełącznik osób — tylko w podglądzie (prawdziwy portal zawsze pokazuje zalogowane konto Google).
window.addEventListener('DOMContentLoaded', () => {
  const people = [
    ['a.kowalska@example.com', 'Anna Kowalska', 'zgłaszająca'],
    ['k.manager@example.com', 'Karol Manager', 'zarządzający studiem'],
    ['m.lis@example.com', 'Marta Lis', 'studio'],
    ['k.wrona@example.com', 'Kamil Wrona', 'studio'],
    ['p.nowicki@example.com', 'Piotr Nowicki', 'studio'],
    ['a.zielinski@example.com', 'Adam Zieliński', 'admin']
  ];
  const cur = (new URLSearchParams(location.search).get('as') || 'a.zielinski@example.com').toLowerCase();
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:100;background:#16161a;color:#fff;border-radius:14px;padding:10px 12px;font:400 12.5px Roboto,sans-serif;box-shadow:0 14px 34px -12px rgba(0,0,0,.45);display:flex;align-items:center;gap:10px';
  box.innerHTML = '<span style="opacity:.6">PODGLĄD · jestem:</span>' +
    '<select style="background:#2a2a30;color:#fff;border:0;border-radius:8px;padding:6px 8px;font:inherit">' +
    people.map(([e, n, r]) => `<option value="${e}" ${e === cur ? 'selected' : ''}>${n} (${r})</option>`).join('') + '</select>';
  box.querySelector('select').onchange = e => {
    const q = new URLSearchParams(location.search); q.set('as', e.target.value);
    const studio = !e.target.value.startsWith('a.');
    location.href = location.pathname + '?' + q + location.hash;
  };
  document.body.appendChild(box);
});
