// Portal zleceń Studia TC — wejście web appki, konfiguracja i jednorazowy setup.

var APP_NAME = 'Zlecenia Studio'; // nazwa nadawcy w mailach
var TZ = 'Europe/Warsaw';
var ALLOWED_DOMAINS = ['tc.pl', 'bnipolska.pl', 'cc.pl'];
var STATUSES = ['Nowe', 'W realizacji', 'Do akceptacji', 'Gotowe'];
var BRANDS = ['The Company', 'CC', 'BNI', 'BNI+', 'CC+', 'Fundacja', 'Think Tank'];
var CATEGORIES = ['rolka', 'trailer', 'showreel', 'avatar', 'inne'];
var FORMATS = ['4:5 1080×1350', 'Kwadrat 1080×1080', 'Pionowy 1080×1920', 'Poziomy 1920×1080'];
var PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'YT', 'Hubspot', 'Społeczność CC', 'Whatsapp'];
var PRIORITIES = [
  { key: 'krytyczny', label: 'Krytyczny', sla: 'poniżej 1 dnia rob., ASAP' },
  { key: 'wysoki', label: 'Wysoki', sla: 'do 2 dni rob.' },
  { key: 'średni', label: 'Średni', sla: 'do 3 dni rob.' },
  { key: 'niski', label: 'Niski', sla: '4–5 dni rob.' }
];
var DEFAULT_PRESETS = [
  { key: 'rolka', label: 'Rolka', hint: '24 h', days: 1 },
  { key: 'trailer', label: 'Trailer', hint: '72 h', days: 3 },
  { key: 'showreel', label: 'Showreel', hint: '72 h', days: 3 },
  { key: 'avatar', label: 'Avatar', hint: '1 dzień', days: 1, cutoff: 12 }
];

function doGet(e) {
  ensureSetup_();
  var t = HtmlService.createTemplateFromFile('index');
  t.initialProject = (e && e.parameter && e.parameter.p) || '';
  return t.evaluate()
    .setTitle('Studio TC · Zlecenia')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// Logo (base64) idzie osobnym wywołaniem, żeby nie puchła strona.
function getAsset(name) {
  if (name === 'logo') return include('logo_data').trim();
  throw new Error('Nieznany zasób.');
}

function props_() { return PropertiesService.getScriptProperties(); }
function prop_(k) { return props_().getProperty(k); }

// Krótki adres (Cloudflare Worker w redirect/ przekierowuje na ScriptApp.getService().getUrl()).
var PUBLIC_URL = 'https://zlecenia-studio.tc.pl/';
function appUrl_() { return PUBLIC_URL; }

// Uruchamia się samo przy pierwszym wejściu właściciela; można też odpalić ręcznie z edytora.
var SCHEMA_VERSION = '2';
var MAX_REVISIONS = 3;

function ensureSetup_() {
  if (prop_('SHEET_ID') && prop_('ROOT_FOLDER_ID') && prop_('SCHEMA') === SCHEMA_VERSION) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!prop_('SHEET_ID') || !prop_('ROOT_FOLDER_ID')) setup();
    if (prop_('SCHEMA') !== SCHEMA_VERSION) migrate_();
  } finally { lock.releaseLock(); }
}

// Dopisuje brakujące kolumny na końcu zakładek (nowe pola po aktualizacji kodu), bez ruszania danych.
function migrate_() {
  Object.keys(SHEETS).forEach(function (name) {
    var sh = sh_(name), cols = SHEETS[name];
    var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
    cols.forEach(function (c, i) {
      if (head[i] !== c) {
        sh.getRange(1, i + 1).setValue(c).setFontWeight('bold');
        sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat('@');
      }
    });
  });
  props_().setProperty('SCHEMA', SCHEMA_VERSION);
}

function setup() {
  var p = props_();
  if (!p.getProperty('SHEET_ID')) {
    var ss = SpreadsheetApp.create('Studio – Zlecenia');
    Object.keys(SHEETS).forEach(function (name, i) {
      var sh = i === 0 ? ss.getSheets()[0].setName(name) : ss.insertSheet(name);
      var cols = SHEETS[name];
      sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
      sh.setFrozenRows(1);
    });
    p.setProperty('SHEET_ID', ss.getId());
    var now = nowIso_();
    // Pierwszym adminem jest osoba wdrażająca; resztę studia dodaje się w Ustawieniach portalu.
    var admin = Session.getEffectiveUser().getEmail().toLowerCase();
    append_('Dostep', { email: admin, name: admin.split('@')[0], role: 'admin', addedBy: 'setup', addedAt: now });
    var y = Number(Utilities.formatDate(new Date(), TZ, 'yyyy'));
    [y, y + 1, y + 2].forEach(function (yr) {
      polishHolidays(yr).forEach(function (h) { append_('Swieta', h); });
    });
  }
  if (!p.getProperty('ROOT_FOLDER_ID')) {
    var root = DriveApp.createFolder('Studio – Zlecenia (załączniki)');
    var tmp = root.createFolder('_tmp_uploady');
    p.setProperty('ROOT_FOLDER_ID', root.getId());
    p.setProperty('TMP_FOLDER_ID', tmp.getId());
    DriveApp.getFileById(p.getProperty('SHEET_ID')).moveTo(root);
  }
  if (!p.getProperty('PRESETS')) p.setProperty('PRESETS', JSON.stringify(DEFAULT_PRESETS));
  Logger.log('Arkusz: ' + SpreadsheetApp.openById(p.getProperty('SHEET_ID')).getUrl());
  Logger.log('Folder: ' + DriveApp.getFolderById(p.getProperty('ROOT_FOLDER_ID')).getUrl());
}

function nowIso_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }

function nowParts_() {
  var d = new Date();
  return {
    date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'),
    hour: Number(Utilities.formatDate(d, TZ, 'H')) + Number(Utilities.formatDate(d, TZ, 'm')) / 60
  };
}

function presets_() {
  try { return JSON.parse(prop_('PRESETS')) || DEFAULT_PRESETS; } catch (e) { return DEFAULT_PRESETS; }
}

function holidays_() {
  return rows_('Swieta').map(function (r) { return { date: String(r.date), name: r.name }; });
}

// --- tożsamość i uprawnienia (sprawdzane w każdej funkcji API) ---

function domainOk_(email) {
  var d = String(email || '').toLowerCase().split('@')[1];
  return ALLOWED_DOMAINS.indexOf(d) >= 0;
}

function nameFromEmail_(email) {
  var local = email.split('@')[0].split(/[._-]/).filter(String);
  return local.map(function (s) { return s.charAt(0).toUpperCase() + s.slice(1) + (s.length === 1 ? '.' : ''); }).join(' ');
}

function me_() {
  var email = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  if (!email) throw new Error('Nie udało się rozpoznać Twojego konta Google. Zaloguj się kontem firmowym.');
  if (!domainOk_(email)) throw new Error('Portal jest dostępny tylko dla kont: ' + ALLOWED_DOMAINS.join(', '));
  var acc = findAccess_(email);
  return { email: email, name: acc ? acc.name : nameFromEmail_(email), role: acc ? String(acc.role) : 'user' };
}

function findAccess_(email) {
  email = String(email).toLowerCase();
  return rows_('Dostep').filter(function (r) { return String(r.email).toLowerCase() === email; })[0] || null;
}

function isStudio_(u) { return u.role === 'studio' || u.role === 'admin'; }

function requireStudio_() {
  var u = me_();
  if (!isStudio_(u)) throw new Error('Tablica studia jest dostępna tylko dla zespołu studia.');
  return u;
}

function requireAdmin_() {
  var u = me_();
  if (u.role !== 'admin') throw new Error('Tylko administrator może to zmienić.');
  return u;
}
