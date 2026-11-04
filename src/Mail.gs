// Maile portalu (MailApp, nadawca: konto wdrażające, nazwa „Studio TC"). Błąd wysyłki nie blokuje zapisu.

function fmtDeadline_(iso) {
  if (!iso) return '—';
  var p = String(iso).split('T'), d = p[0].split('-');
  var days = ['nd', 'pn', 'wt', 'śr', 'czw', 'pt', 'sob'];
  return days[dl_weekday(p[0])] + ' ' + d[2] + '.' + d[1] + ', ' + (p[1] || '17:00');
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

// Studio: zwykły link (ma dostęp do tablicy). Zgłaszający/owner: link z tokenem — otwiera tylko to jedno zlecenie.
function projectLink_(id) { return appUrl_() + '?p=' + encodeURIComponent(id); }
function guestLink_(r) { return projectLink_(r.id) + '&t=' + encodeURIComponent(r.viewToken); }

function mailHtml_(heading, intro, rows, button, note) {
  var tr = rows.map(function (r) {
    return '<tr><td style="padding:7px 0;color:#7a7a84;font-size:13px;width:150px;vertical-align:top">' + esc_(r[0]) +
      '</td><td style="padding:7px 0;color:#16161a;font-size:14px">' + r[1] + '</td></tr>';
  }).join('');
  return '<div style="background:#f4f4f6;padding:28px 12px;font-family:Roboto,Helvetica,Arial,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e6ea;border-radius:18px;overflow:hidden">' +
    '<div style="height:4px;background:#DC143C"></div><div style="padding:26px 28px">' +
    '<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#DC143C;margin-bottom:10px">Studio TC</div>' +
    '<div style="font-size:21px;color:#16161a;font-weight:500;line-height:1.3;margin-bottom:10px">' + heading + '</div>' +
    '<div style="font-size:14px;color:#4a4a52;line-height:1.55;margin-bottom:18px">' + intro + '</div>' +
    '<table style="width:100%;border-collapse:collapse;border-top:1px solid #ececf0">' + tr + '</table>' +
    (button ? '<div style="margin-top:22px"><a href="' + button[1] + '" style="display:inline-block;background:#DC143C;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500">' + esc_(button[0]) + '</a></div>' : '') +
    (note ? '<div style="margin-top:18px;font-size:12px;color:#7a7a84;line-height:1.5">' + note + '</div>' : '') +
    '</div></div></div>';
}

// replyTo (opcjonalnie): odpowiedź na maila trafia od razu do osoby ze studia, a nie do konta wysyłającego.
function send_(projectId, to, cc, subject, html, replyTo) {
  to = uniq_(to); cc = uniq_(cc).filter(function (e) { return to.indexOf(e) < 0; });
  if (!to.length) return;
  try {
    var msg = { to: to.join(','), cc: cc.join(','), subject: subject, htmlBody: html, name: APP_NAME,
      body: subject + '\n\n' + html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') };
    if (replyTo) msg.replyTo = replyTo;
    MailApp.sendEmail(msg);
    log_(projectId, 'system', 'Mail', subject + ' → ' + to.concat(cc).join(', '));
  } catch (e) {
    log_(projectId, 'system', 'Błąd maila', subject + ': ' + e.message);
  }
}

function uniq_(list) {
  var seen = {};
  return (list || []).map(function (e) { return String(e || '').trim().toLowerCase(); })
    .filter(function (e) { if (!e || seen[e]) return false; seen[e] = 1; return true; });
}

function studioEmails_() {
  return rows_('Dostep').filter(function (r) { return r.role === 'studio' || r.role === 'admin'; }).map(function (r) { return r.email; });
}

function briefRows_(r) {
  return [
    ['Brand', esc_(r.brand)], ['Kategoria', esc_(r.category)], ['Priorytet', esc_(r.priority)],
    ['Format', esc_(r.formats)], ['Platforma', esc_(r.platforms)],
    ['Preferowany termin', '<b>' + fmtDeadline_(r.deadline) + '</b>'],
    ['Zgłasza', esc_(r.requesterName) + ' · ' + esc_(r.requesterEmail)],
    ['Owner', esc_(r.ownerEmail)]
  ];
}

function sendNewRequestMails_(r) {
  var desc = esc_(String(r.description).slice(0, 400)) + (String(r.description).length > 400 ? '…' : '');
  send_(r.id, [r.requesterEmail], [r.ownerEmail],
    'Przyjęliśmy zlecenie: ' + r.title,
    mailHtml_('Mamy Twoje zlecenie: ' + esc_(r.title), 'Numer zlecenia: <b>' + r.id + '</b>. Studio dostało brief i wróci, gdy ktoś weźmie zadanie.<br><br>' + desc,
      briefRows_(r), ['Zobacz swoje zlecenie', guestLink_(r)],
      'Link otwiera tylko to zlecenie — możesz go przekazać osobie, która ma śledzić realizację. Preferowany termin nie jest gwarantowany — zależy od obłożenia studia. Studio potwierdzi go po przyjęciu zadania.'));
  var studio = studioEmails_().filter(function (e) { return e !== r.requesterEmail && e !== String(r.ownerEmail).toLowerCase(); });
  send_(r.id, studio, [],
    'Nowe zlecenie: ' + r.title + ' · ' + r.brand + ' · ' + r.category + ' · ' + r.priority,
    mailHtml_(esc_(r.title), desc, briefRows_(r), ['Otwórz na tablicy', projectLink_(r.id)]));
}

function sendClaimedMail_(r) {
  send_(r.id, [r.requesterEmail], [r.ownerEmail], r.title + ' — przyjął(-ęła): ' + r.assigneeName,
    mailHtml_('Twoje zlecenie przyjął(-ęła) ' + esc_(r.assigneeName), '<b>' + esc_(r.assigneeName) + '</b> realizuje „' + esc_(r.title) + '". W razie pytań pisz bezpośrednio: <a style="color:#DC143C" href="mailto:' + esc_(r.assigneeEmail) + '">' + esc_(r.assigneeEmail) + '</a>.',
      [['Zlecenie', r.id], ['Realizuje', esc_(r.assigneeName) + ' · ' + esc_(r.assigneeEmail)], ['Preferowany termin', fmtDeadline_(r.deadline)]],
      ['Zobacz swoje zlecenie', guestLink_(r)]));
}

function sendDeadlineMail_(r) {
  send_(r.id, [r.requesterEmail], [r.ownerEmail], r.title + ' — termin studia: ' + fmtDeadline_(r.confirmedDeadline),
    mailHtml_('Studio potwierdziło termin', esc_(r.assigneeName || 'Studio') + ' potwierdza termin dla „' + esc_(r.title) + '".',
      [['Twój preferowany', fmtDeadline_(r.deadline)], ['Potwierdzony przez studio', '<b>' + fmtDeadline_(r.confirmedDeadline) + '</b>']],
      ['Zobacz swoje zlecenie', guestLink_(r)]));
}

function sendReviewMail_(r) {
  var fin = json_(r.finalFile, null);
  var left = MAX_REVISIONS - json_(r.revisions, []).length;
  var rows = [['Zlecenie', r.id], ['Montuje', esc_(r.assigneeName) + ' · ' + esc_(r.assigneeEmail)],
    ['Poprawki', left > 0 ? 'zostało ' + left + ' z ' + MAX_REVISIONS + ' tur' : 'wykorzystano ' + MAX_REVISIONS + ' z ' + MAX_REVISIONS + ' tur']];
  if (fin) rows.push(['Plik do obejrzenia', esc_(fin.name) + ' — na stronie zlecenia']);
  if (r.deliveryLink) rows.push(['Link', '<a style="color:#DC143C" href="' + esc_(r.deliveryLink) + '">' + esc_(r.deliveryLink) + '</a>']);
  send_(r.id, [r.requesterEmail], [r.ownerEmail], 'Do akceptacji: ' + r.title,
    mailHtml_('Materiał czeka na Twoją akceptację', '„' + esc_(r.title) + '" jest gotowy do obejrzenia. Na stronie zlecenia kliknij <b>Akceptuję</b> albo wpisz poprawki i kliknij <b>Wyślij</b>.',
      rows, ['Obejrzyj i zdecyduj', guestLink_(r)],
      'Przysługują maksymalnie ' + MAX_REVISIONS + ' tury poprawek. Poprawki mogą wydłużyć czas realizacji.'), r.assigneeEmail);
}

function sendRevisionMail_(r, rev, u) {
  send_(r.id, [r.assigneeEmail || studioEmails_()[0]], [], 'Poprawki ' + rev.n + '/' + MAX_REVISIONS + ': ' + r.title,
    mailHtml_('Poprawki do „' + esc_(r.title) + '"', '<b>' + esc_(u.name) + '</b> zgłasza poprawki (tura ' + rev.n + ' z ' + MAX_REVISIONS + '). Zlecenie wróciło do statusu „W realizacji".<br><br><div style="padding:12px 14px;border-radius:10px;background:#f6f6f8;color:#16161a;white-space:pre-wrap">' + esc_(rev.text) + '</div>',
      [['Zlecenie', r.id], ['Zgłasza', esc_(r.requesterName) + ' · ' + esc_(r.requesterEmail)]],
      ['Otwórz zlecenie', projectLink_(r.id)],
      rev.n >= MAX_REVISIONS ? 'To była ostatnia przysługująca tura poprawek.' : ''), u.email);
}

function sendCommentMail_(r, text, u, fromStudio) {
  var box = '<div style="padding:12px 14px;border-radius:10px;background:#f6f6f8;color:#16161a;white-space:pre-wrap">' + esc_(text) + '</div>';
  var intro = '<b>' + esc_(u.name) + '</b> dodał(a) komentarz do „' + esc_(r.title) + '":<br><br>' + box;
  if (fromStudio) {
    send_(r.id, [r.requesterEmail], [r.ownerEmail], 'Komentarz: ' + r.title,
      mailHtml_('Nowy komentarz od studia', intro, [['Zlecenie', r.id]], ['Odpowiedz w portalu', guestLink_(r)]), u.email);
  } else {
    send_(r.id, [r.assigneeEmail || studioEmails_()[0]], [], 'Komentarz: ' + r.title,
      mailHtml_('Nowy komentarz od zgłaszającego', intro, [['Zlecenie', r.id], ['Zgłasza', esc_(r.requesterName) + ' · ' + esc_(r.requesterEmail)]],
        ['Odpowiedz w portalu', projectLink_(r.id)]), u.email);
  }
}

function sendAcceptedMail_(r, u) {
  if (!r.assigneeEmail) return;
  send_(r.id, [r.assigneeEmail], [], 'Zaakceptowane: ' + r.title,
    mailHtml_('Materiał zaakceptowany', '<b>' + esc_(u.name) + '</b> zaakceptował(a) „' + esc_(r.title) + '". Zlecenie jest zamknięte.',
      [['Zlecenie', r.id], ['Tury poprawek', json_(r.revisions, []).length + ' z ' + MAX_REVISIONS]],
      ['Otwórz zlecenie', projectLink_(r.id)]));
}

function sendDoneMail_(r) {
  var fin = json_(r.finalFile, null);
  var rows = [['Zlecenie', r.id], ['Montował(a)', esc_(r.assigneeName)]];
  if (fin) rows.push(['Plik finalny', esc_(fin.name) + ' — do obejrzenia na stronie zlecenia']);
  if (r.deliveryLink) rows.push(['Link', '<a style="color:#DC143C" href="' + esc_(r.deliveryLink) + '">' + esc_(r.deliveryLink) + '</a>']);
  send_(r.id, [r.requesterEmail], [r.ownerEmail], 'Gotowe: ' + r.title,
    mailHtml_('Materiał jest gotowy', '„' + esc_(r.title) + '" — zlecenie zamknięte. Materiał obejrzysz i pobierzesz na stronie zlecenia — link zostaje aktywny.',
      rows, ['Obejrzyj materiał', guestLink_(r)]));
}
