// node tools/test_deadline.mjs
import fs from 'fs';
import vm from 'vm';
const ctx = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(new URL('../src/Deadline.gs', import.meta.url), 'utf8'), ctx);
const { computeDeadline, workdaysBetween, polishHolidays } = ctx.module.exports;

const hol = [...polishHolidays(2026), ...polishHolidays(2027)].map(h => h.date);
const cases = [
  ['pon 10:00 + rolka', '2026-10-26', 10, 1, '2026-10-27T17:00'],
  ['pon 10:00 + trailer', '2026-10-26', 10, 3, '2026-10-29T17:00'],
  ['pt 16:00 + rolka', '2026-10-30', 16, 1, '2026-11-02T17:00'],
  ['pt 18:00 + rolka', '2026-10-30', 18, 1, '2026-11-03T17:00'],
  ['wt 10.11 + rolka (11.11 święto)', '2026-11-10', 10, 1, '2026-11-12T17:00'],
  ['śr 23.12 + trailer (24–26.12)', '2026-12-23', 10, 3, '2026-12-30T17:00'],
  ['pt 16:59 + rolka', '2026-10-30', 16 + 59 / 60, 1, '2026-11-02T17:00'],
  ['sob 10:00 + rolka', '2026-10-31', 10, 1, '2026-11-03T17:00'],
  ['pon 11:00 + avatar (do 12 → dziś)', '2026-10-26', 11, 1, '2026-10-26T17:00', 12],
  ['pon 12:30 + avatar', '2026-10-26', 12.5, 1, '2026-10-27T17:00', 12],
  ['pt 18:00 + avatar', '2026-10-30', 18, 1, '2026-11-02T17:00', 12],
  ['sob 10:00 + avatar', '2026-10-31', 10, 1, '2026-11-02T17:00', 12],
  ['wt 10.11 11:59 + avatar', '2026-11-10', 11.98, 1, '2026-11-10T17:00', 12],
];
let fail = 0;
for (const [name, d, h, n, exp, cutoff] of cases) {
  const got = computeDeadline(d, h, n, hol, cutoff);
  const ok = got === exp;
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}: ${got}${ok ? '' : ' (oczekiwano ' + exp + ')'}`);
}
const easter = polishHolidays(2027).find(h => h.name === 'Wielkanoc').date;
console.log(`${easter === '2027-03-28' ? 'OK  ' : 'FAIL'} Wielkanoc 2027: ${easter}`); if (easter !== '2027-03-28') fail++;
const wb = workdaysBetween('2026-10-28', '2026-11-02', hol);
console.log(`${wb === 3 ? 'OK  ' : 'FAIL'} dni rob. 28.10→2.11: ${wb}`); if (wb !== 3) fail++;
process.exit(fail ? 1 : 0);
