// i18n-src.txt (ru || en || uk || de || pl) → src/js/33-i18n-dict.js
const fs = require('fs'), path = require('path');
const LANGS = ['en', 'uk', 'de', 'pl'];
const lines = fs.readFileSync(path.join(__dirname, '..', 'i18n-src.txt'), 'utf8').split(/\r?\n/).filter(l => l.trim());
const dict = {}; let bad = 0;
for (const l of lines) {
  const p = l.split(' || ').map(s => s.trim());
  if (p.length !== LANGS.length + 1) { console.warn('skip (cols=' + p.length + '):', l.slice(0, 60)); bad++; continue; }
  dict[p[0]] = p.slice(1);
}
const out = `// АВТОГЕНЕРАЦИЯ из i18n-src.txt (npm run build). Не править руками.\nwindow.TX_LANG_ORDER=${JSON.stringify(['ru', ...LANGS])};\nwindow.TX_DICT=${JSON.stringify(dict)};\n`;
fs.writeFileSync(path.join(__dirname, '..', 'src', 'js', '33-i18n-dict.js'), out);
console.log('i18n: ' + Object.keys(dict).length + ' строк × ' + LANGS.length + ' языка' + (bad ? ', пропущено ' + bad : ''));
