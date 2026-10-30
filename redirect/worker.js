// zlecenia-studio.tc.pl → portal zleceń Studia TC (Google Apps Script).
// Przekazuje dalej parametry (?p=ID&t=TOKEN), więc krótkie linki do konkretnego zlecenia też działają.
const PORTAL = 'https://script.google.com/a/macros/tc.pl/s/AKfycbxCuqT-codSSs1sPCR8WEH7U4sRDiSMIxEfX9Oalc8FjnVsh4FtuqDEAD1wcoAFHz1G/exec';

export default {
  fetch(request) {
    const target = new URL(PORTAL);
    target.search = new URL(request.url).search;
    return Response.redirect(target.toString(), 302);
  }
};
