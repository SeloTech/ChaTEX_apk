// ChaTEX build: склеивает js/*.js → один файл, обфусцирует, минифицирует HTML/CSS → dist/
// Запуск: npm run build
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const JavaScriptObfuscator = require('javascript-obfuscator');
const CleanCSS = require('clean-css');
const { minify } = require('html-minifier-terser');

// Домены, на которых разрешено работать коду (защита от копирования на чужой сайт).
// Если подключите свой домен — добавьте его сюда и пересоберите.
const ALLOWED_DOMAINS = ['chatex-8b404.web.app', 'chatex-8b404.firebaseapp.com', 'localhost', '127.0.0.1'];

const SRC = path.join(__dirname, 'src'), DIST = path.join(__dirname, 'dist');
(async () => {
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'tools', 'gen-i18n.js')], { stdio: 'inherit' });
  fs.rmSync(DIST, { recursive: true, force: true }); fs.mkdirSync(DIST, { recursive: true });
  let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');

  // 1) JS: берём локальные <script src="js/..."> в том же порядке, что в index.html
  const jsFiles = [...html.matchAll(/<script src="(js\/[^"]+)"><\/script>/g)].map(m => m[1]);
  const bundle = jsFiles.map(f => `/* ${f} */\n` + fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  const ob = JavaScriptObfuscator.obfuscate(bundle, {
    compact: true, simplify: true,
    renameGlobals: false,            // нельзя: HTML вызывает функции по имени (onclick="openDM(...)")
    identifierNamesGenerator: 'hexadecimal',
    stringArray: true, stringArrayThreshold: 1, stringArrayEncoding: ['rc4'], stringArrayWrappersCount: 2,
    stringArrayRotate: true, stringArrayShuffle: true, splitStrings: true, splitStringsChunkLength: 6,
    numbersToExpressions: true, transformObjectKeys: false,
    controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, debugProtection: false,
    domainLock: ALLOWED_DOMAINS, domainLockRedirectUrl: 'about:blank',
    target: 'browser', sourceMap: false
  }).getObfuscatedCode();
  const hash = crypto.createHash('sha1').update(ob).digest('hex').slice(0, 10);
  const jsName = `app.${hash}.js`;
  fs.writeFileSync(path.join(DIST, jsName), ob);

  // 2) CSS: встроенный <style> + css/telex.css → один минифицированный файл
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
  const telex = fs.readFileSync(path.join(SRC, 'css/telex.css'), 'utf8');
  const design = fs.readFileSync(path.join(SRC, 'css/design-v2.css'), 'utf8');   // дизайн v2 (переопределяет токены)
  const css = new CleanCSS({ level: 1 }).minify(inline + '\n' + telex + '\n' + design).styles;
  const cssName = `app.${crypto.createHash('sha1').update(css).digest('hex').slice(0, 10)}.css`;
  fs.writeFileSync(path.join(DIST, cssName), css);

  // 3) HTML: убираем исходные <style>, <link telex>, локальные <script>, ставим бандлы
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
             .replace(/<link rel="stylesheet" href="css\/telex.css">/, `<link rel="stylesheet" href="${cssName}">`)
             .replace(/<script src="js\/[^"]+"><\/script>\s*/g, '');
  html = html.replace('</body>', `<script src="${jsName}"></script>\n</body>`);
  html = await minify(html, { collapseWhitespace: true, conservativeCollapse: true, removeComments: true, minifyJS: false, minifyCSS: false });
  fs.writeFileSync(path.join(DIST, 'index.html'), html);

  // 4) звуки, PWA (manifest, иконки, service worker)
  fs.cpSync(path.join(SRC, 'sounds'), path.join(DIST, 'sounds'), { recursive: true });
  fs.cpSync(path.join(SRC, 'icons'), path.join(DIST, 'icons'), { recursive: true });
  ['manifest.webmanifest', 'sw.js'].forEach(f => fs.copyFileSync(path.join(SRC, f), path.join(DIST, f)));
  console.log(`OK → dist/  (${jsName} ${(ob.length / 1024) | 0} KB, ${cssName} ${(css.length / 1024) | 0} KB)`);
})().catch(e => { console.error(e); process.exit(1); });
