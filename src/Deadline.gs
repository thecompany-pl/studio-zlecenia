// Liczenie preferowanego terminu. Plik współdzielony: tools/build.mjs kopiuje go do deadline_js.html dla przeglądarki.
// Termin = 17:00 N-tego dnia roboczego po dniu zgłoszenia. Daty jako 'YYYY-MM-DD', bez stref czasowych.

var DL_END_HOUR = 17;

function dl_pad(n) { return (n < 10 ? '0' : '') + n; }

function dl_ymd(d) { return d.getUTCFullYear() + '-' + dl_pad(d.getUTCMonth() + 1) + '-' + dl_pad(d.getUTCDate()); }

function dl_addDays(ymd, n) {
  var p = ymd.split('-').map(Number);
  return dl_ymd(new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)));
}

function dl_weekday(ymd) {
  var p = ymd.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}

function dl_holidaySet(holidays) {
  var s = {};
  (holidays || []).forEach(function (h) { s[typeof h === 'string' ? h : h.date] = true; });
  return s;
}

function dl_isWorkday(ymd, hs) {
  var w = dl_weekday(ymd);
  return w !== 0 && w !== 6 && !hs[ymd];
}

function dl_nextWorkday(ymd, hs) {
  do { ymd = dl_addDays(ymd, 1); } while (!dl_isWorkday(ymd, hs));
  return ymd;
}

var DL_START_HOUR = 9;

// date 'YYYY-MM-DD', hour jako liczba z ułamkiem (16:59 → 16.98), workDays ≥ 1. Zwraca 'YYYY-MM-DDT17:00'.
// Zgłoszenie po 17:00 / w weekend / w święto liczy się jak zgłoszone o 9:00 najbliższego dnia roboczego.
// cutoff (opcjonalnie, np. 12 dla avatara): zgłoszone przed tą godziną → pierwszy dzień liczy się już dziś.
function computeDeadline(date, hour, workDays, holidays, cutoff) {
  var hs = dl_holidaySet(holidays);
  var day = date, h = hour;
  if (!dl_isWorkday(day, hs) || h >= DL_END_HOUR) { day = dl_nextWorkday(day, hs); h = DL_START_HOUR; }
  var n = Math.max(1, workDays);
  if (cutoff && h < cutoff) n -= 1;
  for (var i = 0; i < n; i++) day = dl_nextWorkday(day, hs);
  return day + 'T' + dl_pad(DL_END_HOUR) + ':00';
}

// Liczba dni roboczych od dnia `fromYmd` (wyłącznie) do `toYmd` (włącznie). Ujemna, gdy termin minął.
function workdaysBetween(fromYmd, toYmd, holidays) {
  var hs = dl_holidaySet(holidays), n = 0, d = fromYmd;
  if (toYmd === fromYmd) return 0;
  if (toYmd > fromYmd) { while (d < toYmd) { d = dl_addDays(d, 1); if (dl_isWorkday(d, hs)) n++; } return n; }
  while (d > toYmd) { if (dl_isWorkday(d, hs)) n--; d = dl_addDays(d, -1); }
  return n;
}

// Polskie święta ustawowe (Wigilia wolna od 2025).
function polishHolidays(year) {
  var a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  var i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  var month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  var easter = year + '-' + dl_pad(month) + '-' + dl_pad(day);
  var list = [
    [year + '-01-01', 'Nowy Rok'], [year + '-01-06', 'Trzech Króli'],
    [easter, 'Wielkanoc'], [dl_addDays(easter, 1), 'Poniedziałek Wielkanocny'],
    [year + '-05-01', 'Święto Pracy'], [year + '-05-03', 'Święto Konstytucji 3 Maja'],
    [dl_addDays(easter, 49), 'Zielone Świątki'], [dl_addDays(easter, 60), 'Boże Ciało'],
    [year + '-08-15', 'Wniebowzięcie NMP'], [year + '-11-01', 'Wszystkich Świętych'],
    [year + '-11-11', 'Święto Niepodległości'], [year + '-12-24', 'Wigilia'],
    [year + '-12-25', 'Boże Narodzenie'], [year + '-12-26', 'Drugi dzień Bożego Narodzenia']
  ];
  return list.map(function (x) { return { date: x[0], name: x[1] }; });
}

if (typeof module !== 'undefined') module.exports = { computeDeadline: computeDeadline, workdaysBetween: workdaysBetween, polishHolidays: polishHolidays, dl_weekday: dl_weekday };
