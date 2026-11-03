# zlecenia-studio.tc.pl → portal

Worker Cloudflare, który przekierowuje krótki adres na portal (Apps Script), z zachowaniem `?p=…&t=…`.

```bash
cd ~/Desktop/CLAUDE/Studio_Zlecenia/redirect && ./node_modules/.bin/wrangler deploy
```

Wymaga w koncie Cloudflare „The Company" uprawnień Workers (Scripts + Routes – Edit) i DNS – Edit dla tc.pl.
