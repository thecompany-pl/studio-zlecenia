// node tools/build.mjs — generuje pliki współdzielone dla przeglądarki i lokalny podgląd dev/index.html (z atrapą backendu).
import fs from 'fs';
const root = new URL('../', import.meta.url);
const rd = p => fs.readFileSync(new URL(p, root), 'utf8');
const wr = (p, s) => fs.writeFileSync(new URL(p, root), s);

wr('src/deadline_js.html', '<script>\n// WYGENEROWANE z Deadline.gs przez tools/build.mjs — nie edytuj ręcznie.\n' + rd('src/Deadline.gs') + '</script>\n');
// Oryginał z paczki firmowej: TC AI Brain/90 Assets - Brand/The Company/TC_logo_kolor.svg (przezroczyste tło).
const logo = fs.readFileSync(new URL('tools/TC_logo_kolor.svg', root)).toString('base64');
wr('src/logo_data.html', `data:image/svg+xml;base64,${logo}\n`);

let html = rd('src/index.html').replace(/<\?!= include\('(\w+)'\) \?>/g, (_, n) => rd(`src/${n}.html`));
// W podglądzie nie ma getAsset — kod i logo wklejamy wprost w miejsce loadera.
html = html.replace(/<!--LOADER-->[\s\S]*<!--\/LOADER-->/, () => `<script>window.TC_LOGO='data:image/svg+xml;base64,${logo}';</script>`);
// Apps Script ucina stronę na pierwszym ukośniku z gwiazdką w skryptach — pilnujemy tego przy każdym buildzie.
// Wycina też wszystko od podwójnego ukośnika do końca linii — dozwolone tylko jako komentarz, nigdy w tekście (np. adres URL).
for (const f of ['app_js', 'deadline_js']) {
  const src = rd(`src/${f}.html`);
  if (src.includes('/' + '*')) { console.error(`BŁĄD: src/${f}.html zawiera ukośnik z gwiazdką — Apps Script utnie stronę.`); process.exit(1); }
  src.split('\n').forEach((line, i) => {
    if (/[:'"`=(]\s*\/\//.test(line) || /[a-z]:\/\//i.test(line)) { console.error(`BŁĄD: src/${f}.html:${i + 1} ma podwójny ukośnik w kodzie — Apps Script utnie tę linię.`); process.exitCode = 1; }
  });
}
if (process.exitCode) process.exit(1);
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">');
html = html.replace('<script>\n\'use strict\';', '<script src="mock.js"></script>\n<script>\n\'use strict\';');
wr('dev/index.html', html);
console.log('OK: src/deadline_js.html, src/logo_data.html, dev/index.html');
