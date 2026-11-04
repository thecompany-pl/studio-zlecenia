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
  const me = () => { const a = ACCESS.find(x => x.email === ME); return { email: ME, name: a ? a.name : 'Anna Kowalska', role: a ? a.role : 'user' }; };
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
  const full = p => { const u = me(); const studio = u.role !== 'user'; return Object.assign({}, p, { maxRevisions: 3, can: { decide: (p.requesterEmail === u.email || p.ownerEmail === u.email) && p.status === 'Do akceptacji', studio, claim: studio && !p.assigneeEmail, edit: studio && (p.assigneeEmail === u.email || u.role === 'admin') } }); };
  const get = id => { const p = P.find(x => x.id === id); if (!p) throw new Error('Nie znaleziono zlecenia.'); return p; };
  const settings = () => ({ access: ACCESS, presets: PRESETS, holidays: HOLS });
  const API = {
    getBootstrap: () => ({ user: me(), presets: PRESETS, holidays: HOLS, statuses: ['Nowe', 'W realizacji', 'Do akceptacji', 'Gotowe'], brands: ['The Company', 'CC', 'BNI', 'BNI+', 'CC+', 'Fundacja', 'Think Tank'], categories: ['rolka', 'trailer', 'showreel', 'avatar', 'inne'], formats: ['4:5 1080×1350', 'Kwadrat 1080×1080', 'Pionowy 1080×1920', 'Poziomy 1920×1080'], platforms: ['Facebook', 'Instagram', 'TikTok', 'YT', 'Hubspot', 'Społeczność CC', 'Whatsapp'], priorities: [{ key: 'krytyczny', label: 'Krytyczny', sla: 'poniżej 1 dnia rob., ASAP' }, { key: 'wysoki', label: 'Wysoki', sla: 'do 2 dni rob.' }, { key: 'średni', label: 'Średni', sla: 'do 3 dni rob.' }, { key: 'niski', label: 'Niski', sla: '4–5 dni rob.' }], domains: ['tc.pl', 'bnipolska.pl', 'cc.pl', 'example.com'], now: now(), appUrl: location.href }),
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
    addComment: (id, text) => { const p = get(id); p.comments.push({ ts: iso(), authorName: me().name, authorEmail: ME, text, studio: me().role !== 'user' }); return full(p); },
    startFinalUpload: (pid, name, mime, size) => { const p = get(pid); p._up = { name, mime, size }; return pid; },
    uploadFinalChunk: (id, offset, b64) => { const p = get(id); const n = offset + atob(b64).length; if (n < p._up.size) return { done: false, next: n }; p.finalFile = { id: 'demo', name: p._up.name, mime: p._up.mime, size: p._up.size, at: iso(), by: me().name }; p.history.push({ ts: iso(), actor: ME, action: 'Plik finalny', details: p._up.name }); return { done: true, project: full(p) }; },
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
      return (...args) => setTimeout(() => { try { const r = API[k](...JSON.parse(JSON.stringify(args))); persist(); ok && ok(JSON.parse(JSON.stringify(r ?? null))); } catch (e) { fail && fail(e); } }, 250);
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
    location.href = location.pathname + '?' + q + '#' + (studio ? '/tablica' : '/moje');
  };
  document.body.appendChild(box);
});
