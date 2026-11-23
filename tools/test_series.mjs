// node tools/test_series.mjs — serie cykliczne, godziny pracy i kolizje realizacji studyjnych.
import fs from 'fs';
import vm from 'vm';
const ctx = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(new URL('../src/Deadline.gs', import.meta.url), 'utf8') + '\n' +
  fs.readFileSync(new URL('../src/Series.gs', import.meta.url), 'utf8'), ctx);
const { sr_dates, sr_outOfHours, sr_conflict, sr_nthWeekday } = ctx.module.exports;
const { polishHolidays } = ctx;
const hol = [...polishHolidays(2026), ...polishHolidays(2027)].map(h => h.date);
const hs = Object.fromEntries(hol.map(d => [d, true]));

let fail = 0;
const eq = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `\n     got: ${JSON.stringify(got)}\n     exp: ${JSON.stringify(exp)}`}`);
};
const D = list => list.map(x => x.date);

// --- serie ---
eq('co tydzień wt+czw, 4 razy', D(sr_dates({ type: 'weekly', start: '2026-11-23', weekdays: [2, 4], count: 4 }, hol)),
  ['2026-11-24', '2026-11-26', '2026-12-01', '2026-12-03']);
eq('co 2 tygodnie pon, 3 razy (od pon)', D(sr_dates({ type: 'biweekly', start: '2026-11-23', weekdays: [1], count: 3 }, hol)),
  ['2026-11-23', '2026-12-07', '2026-12-21']);
eq('co 2 tygodnie śr, start w czw → pierwszy tydzień pominięty', D(sr_dates({ type: 'biweekly', start: '2026-11-26', weekdays: [3], count: 2 }, hol)),
  ['2026-12-09', '2026-12-23']);
eq('drugi wtorek miesiąca, 3 razy', D(sr_dates({ type: 'monthlyNth', start: '2026-11-01', weekday: 2, nth: 2, count: 3 }, hol)),
  ['2026-11-10', '2026-12-08', '2027-01-12']);
eq('ostatni piątek miesiąca; 25.12 święto → przesunięte na pon 28.12', D(sr_dates({ type: 'monthlyNth', start: '2026-11-01', weekday: 5, nth: -1, count: 2 }, hol)),
  ['2026-11-27', '2026-12-28']);
eq('5. wtorek: tylko miesiące, które go mają (sty–lut 2027 pominięte)', D(sr_dates({ type: 'monthlyNth', start: '2027-01-01', weekday: 2, nth: 5, count: 2 }, hol)),
  ['2027-03-30', '2027-06-29']);
eq('co miesiąc 31. → ostatni dzień krótszych miesięcy, weekend przesunięty', D(sr_dates({ type: 'monthlyDay', start: '2027-01-01', day: 31, count: 3 }, hol)),
  ['2027-02-01', '2027-03-01', '2027-03-31']);
eq('co tydzień środa przez 11.11 → przesunięte na czwartek', sr_dates({ type: 'weekly', start: '2026-11-04', weekdays: [3], count: 2 }, hol),
  [{ date: '2026-11-04', original: '2026-11-04', shifted: false }, { date: '2026-11-12', original: '2026-11-11', shifted: true }]);
eq('bez przesuwania świąt', D(sr_dates({ type: 'weekly', start: '2026-11-04', weekdays: [3], count: 2, shiftHolidays: false }, hol)),
  ['2026-11-04', '2026-11-11']);
eq('do daty (until włącznie)', D(sr_dates({ type: 'weekly', start: '2026-11-23', weekdays: [1], until: '2026-12-07' }, hol)),
  ['2026-11-23', '2026-11-30', '2026-12-07']);
eq('limit 26 wystąpień', sr_dates({ type: 'weekly', start: '2026-11-23', weekdays: [1, 2, 3, 4, 5], count: 100 }, hol).length, 26);
eq('ręczne daty: sortowanie, duplikaty, święto przesunięte', D(sr_dates({ type: 'manual', start: '2026-01-01', dates: ['2026-12-10', '2026-11-11', '2026-12-10', 'zle'] }, hol)),
  ['2026-11-12', '2026-12-10']);
eq('przesunięcie na dzień już w serii nie dubluje', D(sr_dates({ type: 'weekly', start: '2026-11-09', weekdays: [3, 4], count: 3 }, hol)),
  ['2026-11-12', '2026-11-18', '2026-11-19']);
eq('nth: pierwszy poniedziałek 06.2026', sr_nthWeekday(2026, 6, 1, 1), '2026-06-01');

// --- godziny pracy ---
const T = (date, ready, start, end, extra = {}) => ({ date, ready, start, end, ...extra });
eq('9:00–17:00 w dzień roboczy → w godzinach', sr_outOfHours(T('2026-11-24', '09:00', '09:30', '17:00'), hs), false);
eq('gotowość 8:45 → poza godzinami', sr_outOfHours(T('2026-11-24', '08:45', '10:00', '12:00'), hs), true);
eq('koniec 17:15 → poza godzinami', sr_outOfHours(T('2026-11-24', '15:00', '15:30', '17:15'), hs), true);
eq('zwijanie 30 min wypycha za 17:00', sr_outOfHours(T('2026-11-24', '15:00', '15:30', '16:45', { teardownMin: 30 }), hs), true);
eq('dojazd 60 min przed 9:30 → poza godzinami', sr_outOfHours(T('2026-11-24', '09:30', '10:00', '12:00', { travelMin: 60 }), hs), true);
eq('sobota → poza godzinami', sr_outOfHours(T('2026-11-28', '10:00', '10:30', '12:00'), hs), true);
eq('święto 11.11 → poza godzinami', sr_outOfHours(T('2026-11-11', '10:00', '10:30', '12:00'), hs), true);

// --- kolizje ---
const busy = [{ start: '10:00', end: '13:30', label: 'Szkolenie MSP' }, { start: '18:00', end: '19:30', label: 'Webinar' }];
eq('styk końca z początkiem to nie kolizja', sr_conflict(T('2026-11-24', '13:30', '14:00', '15:00'), busy), null);
eq('gotowość wchodzi w szkolenie', sr_conflict(T('2026-11-24', '13:00', '14:00', '15:00'), busy).label, 'Szkolenie MSP');
eq('zwijanie wchodzi w webinar', sr_conflict(T('2026-11-24', '16:00', '16:30', '17:45', { teardownMin: 30 }), busy).label, 'Webinar');
eq('dojazd na styk z końcem szkolenia → bez kolizji', sr_conflict(T('2026-11-24', '14:30', '15:00', '16:00', { travelMin: 60 }), busy), null);
eq('dojazd liczony w kolizji', sr_conflict(T('2026-11-24', '14:00', '15:00', '16:00', { travelMin: 60 }), busy).label, 'Szkolenie MSP');

process.exit(fail ? 1 : 0);
