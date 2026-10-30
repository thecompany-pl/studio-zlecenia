#!/bin/zsh
# Jednorazowo: tworzy projekt Apps Script, wypycha kod i robi pierwsze wdrożenie web appki.
set -e
cd "$(dirname "$0")/.."
CLASP=./node_modules/.bin/clasp
if [ ! -f .clasp.json ]; then
  cp src/appsscript.json /tmp/studio_manifest.json
  $CLASP create --type webapp --title "Studio TC – Zlecenia" --rootDir src
  cp /tmp/studio_manifest.json src/appsscript.json   # clasp create nadpisuje manifest domyślnym
fi
node tools/build.mjs
node tools/test_deadline.mjs
$CLASP push -f
$CLASP create-deployment --description "v1 $(date +%Y-%m-%d)" 2>/dev/null || $CLASP deploy --description "v1 $(date +%Y-%m-%d)"
echo
echo "Wdrożenia:"
$CLASP list-deployments 2>/dev/null || $CLASP deployments
