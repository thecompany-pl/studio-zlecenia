# Studio TC · Portal zleceń

**Link:** https://zlecenia-studio.tc.pl (przekierowanie przez Cloudflare Worker z `redirect/`)
GitHub: https://github.com/thecompany-pl/studio-zlecenia (prywatne; kod na gałęzi `portal-zlecen-v1`, `main` czeka na admina org.)
Script ID: 1y99UFhAKYBabtICYRJIu2E40B9U2qJbbTZX_tPJYODRSCHfH4Kq5PweQ · Deployment: `AKfycbxCuqT-codSSs1sPCR8WEH7U4sRDiSMIxEfX9Oalc8FjnVsh4FtuqDEAD1wcoAFHz1G`

Wewnętrzna web appka do zlecania zadań wideo studiu (zastępuje formularz monday „Brief do działu video").
Google Apps Script + Arkusz (baza) + Drive (załączniki) + MailApp (maile). Logowanie = konto Google tc.pl / bnipolska.pl.

## Jak to działa
- **Zgłaszający** (każdy z domeny): 4 kroki — tytuł → brief (blokujący) → scenariusz / czasówki / okładka → preferowany termin + podsumowanie → „Zatwierdź".
- **Termin**: 17:00 N-tego dnia roboczego po dniu zgłoszenia (rolka 1, trailer i showreel 3). Avatar: zgłoszony do 12:00 → gotowy tego samego dnia o 17:00, później → następnego dnia roboczego. Zgłoszenie po 17:00 lub w weekend/święto liczy się jak zgłoszone o 9:00 najbliższego dnia roboczego. Termin jest preferowany, nie gwarantowany.
- **Maile**: zgłaszający + owner (jeden mail, owner w DW) dostają link z tokenem (`?p=ID&t=…`), który otwiera tylko to jedno zlecenie. Studio (osoby z zakładki `Dostep`, bez duplikatów) dostaje link do tablicy. Przy „Biorę to": mail tylko do zgłaszającego (owner w DW), kto przyjął zadanie — bez maila do studia. Potem: „termin potwierdzony", „do akceptacji" (odpowiedź idzie prosto do montażysty) i „gotowe".
- **Plik finalny**: osoba przypisana wrzuca go na stronie projektu (do 2 GB, upload kawałkami prosto do folderu zlecenia na Drive). Zgłaszający ogląda go w odtwarzaczu Drive na stronie zlecenia. Plik jest udostępniany „w domenie z linkiem", a jeśli polityka Workspace na to nie pozwala — imiennie zgłaszającemu, ownerowi i studiu, bez powiadomień od Google.
- **Tablica** (tylko osoby z `Dostep`): kafelki, filtry, strona projektu, „Biorę to" (przypisuje do zalogowanego maila, z blokadą przed dwoma osobami naraz), status, link do gotowego materiału, komentarze wewnętrzne.
- **Ustawienia** (admin): dostęp po e-mailu, presety terminów, dni wolne.

## Pierwsze wdrożenie (raz)
1. Włącz Apps Script API: https://script.google.com/home/usersettings → „Google Apps Script API" → ON.
2. W terminalu:
   ```bash
   cd ~/Desktop/CLAUDE/Studio_Zlecenia && ./node_modules/.bin/clasp login
   ```
3. ```bash
   cd ~/Desktop/CLAUDE/Studio_Zlecenia && zsh tools/create.sh
   ```
4. Otwórz URL `/exec` z wdrożenia **swoim kontem** i zaakceptuj uprawnienia (Arkusze, Drive, wysyłka maili, połączenia zewnętrzne — potrzebne do uploadu pliku finalnego). Przy pierwszym wejściu appka sama zakłada arkusz „Studio – Zlecenia" i folder „Studio – Zlecenia (załączniki)" na Twoim Drive.
5. Wyślij testowe zlecenie i sprawdź maile.

## Aktualizacja po zmianach w kodzie
```bash
cd ~/Desktop/CLAUDE/Studio_Zlecenia && npm run push
```
`push` aktualizuje tylko wersję testową (`/dev`). Pod stały link `/exec` (link się nie zmienia):
```bash
cd ~/Desktop/CLAUDE/Studio_Zlecenia && npm run deploy
```

## Lokalny podgląd UI (bez Google)
```bash
cd ~/Desktop/CLAUDE/Studio_Zlecenia && npm run dev
```
http://localhost:8770/?as=m.lis@example.com — `?as=` udaje zalogowaną osobę (atrapa w `dev/mock.js`, dane tylko w pamięci).

## Pliki
- `src/Code.gs` — konfiguracja (brandy, kategorie, lista studia, domeny), `doGet`, setup, uprawnienia.
- `src/Api.gs` — funkcje wołane z przeglądarki. `src/Mail.gs` — maile. `src/Data.gs` — arkusz.
- `src/Deadline.gs` — liczenie terminów (współdzielone z przeglądarką przez `tools/build.mjs` → `deadline_js.html`; nie edytuj `deadline_js.html` ręcznie).
- `src/index.html`, `styles.html`, `app_js.html` — frontend. `logo_js.html` — oryginalne logo TC (z `MKT 90 Assets - Brand`).

## Znane ograniczenia
- Maile idą z konta osoby, która wdrożyła appkę (limit Workspace: 1500 odbiorców dziennie).
- Załączniki: do 10 MB na plik (scenariusz max 5 plików). Surówki tylko jako link.
- Domena `cc.pl` niepotwierdzona: jeśli to osobny Workspace, osoby z cc.pl nie wejdą. Wtedy zmień `access` w `appsscript.json` na `ANYONE` (ktokolwiek z kontem Google), a serwer i tak odrzuci adresy spoza `ALLOWED_DOMAINS`.
- Pliki leżą na Drive właściciela; pobieranie idzie przez appkę (sprawdza uprawnienia), więc nie trzeba niczego udostępniać.
- Szkic zlecenia trzyma się w przeglądarce; wgrane pliki szkicu wygasają po ~5 h.
