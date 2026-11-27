// ============================================================
//  ChaTEX — перевод интерфейса (ru · en · uk · de · pl)
//  Исходный язык интерфейса — русский. Движок подменяет известные строки
//  в тексте, placeholder и title, а также в toast()/alert()/confirm().
//  Сообщения пользователей, ники и названия чатов НЕ переводятся.
//  Добавить язык: строка в i18n-src.txt + LANGS в tools/gen-i18n.js.
// ============================================================
(function () {
  'use strict';
  const LANGS = [
    { code: 'ru', name: 'Русский',    flag: '🇷🇺', locale: 'ru-RU' },
    { code: 'en', name: 'English',    flag: '🇬🇧', locale: 'en-GB' },
    { code: 'uk', name: 'Українська', flag: '🇺🇦', locale: 'uk-UA' },
    { code: 'de', name: 'Deutsch',    flag: '🇩🇪', locale: 'de-DE' },
    { code: 'pl', name: 'Polski',     flag: '🇵🇱', locale: 'pl-PL' }
  ];
  const ORDER = window.TX_LANG_ORDER || ['ru', 'en', 'uk', 'de', 'pl'];
  const DICT = window.TX_DICT || {};
  const KEYS_PREFIX = Object.keys(DICT).filter(k => /[:：]$/.test(k)).sort((a, b) => b.length - a.length);
  const LEAD = /^[\s\u200d\ufe0f\p{Extended_Pictographic}✓✔✦✕↩↺➕✏⚠⛔❓⚙☁]+/u;
  const SKIP = 'script,style,textarea,input,code,pre,.msg-bubble,[data-no-i18n],.reply-bar-text,.pinned-preview,#pinned-preview';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} } };

  let lang = ls.get('chatex_lang');
  if (!lang || !ORDER.includes(lang)) {
    const nav = (navigator.language || 'ru').slice(0, 2).toLowerCase();
    lang = ORDER.includes(nav) ? nav : (nav === 'be' ? 'ru' : 'en');
    if (!ls.get('chatex_lang') && nav === 'ru') lang = 'ru';
  }
  const idx = () => ORDER.indexOf(lang) - 1; // ru → -1

  // Перевести строку (возвращает исходную, если перевода нет)
  function tr(src) {
    if (lang === 'ru' || typeof src !== 'string' || !src) return src;
    const m = src.match(/^(\s*)([\s\S]*?)(\s*)$/); const lead = m[1], core = m[2], tail = m[3];
    if (!core) return src;
    const i = idx(); let hit = DICT[core];
    if (hit && hit[i]) return lead + hit[i] + tail;
    const pm = core.match(LEAD);
    if (pm) { const rest = core.slice(pm[0].length); hit = DICT[rest]; if (hit && hit[i]) return lead + pm[0] + hit[i] + tail; }
    for (const k of KEYS_PREFIX) {
      const base = core.startsWith(k) ? core : (pm && core.slice(pm[0].length).startsWith(k) ? core.slice(pm[0].length) : null);
      if (base) { const e = DICT[k]; if (e && e[i]) return lead + (base === core ? '' : pm[0]) + e[i] + ' ' + base.slice(k.length).trimStart() + tail; }
    }
    return src;
  }

  // ───── обход DOM ─────
  const textOrig = new WeakMap();           // textNode → { ru, out }
  const attrOrig = new WeakMap();           // element → { attr: { ru, out } }
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  let busy = false;

  function doText(n) {
    const p = n.parentElement; if (!p || p.closest(SKIP)) return;
    let rec = textOrig.get(n);
    if (rec && n.nodeValue !== rec.out) rec = null;           // текст поменяла программа — новый оригинал
    const ru = rec ? rec.ru : n.nodeValue;
    if (!/[А-Яа-яЁёІіЇїЄє]/.test(ru) && lang !== 'ru' && !rec) { if (!/^[\s\S]*[+↑←↻]/.test(ru) && !/^(Enter|Esc|ADMIN)/.test(ru)) return; }
    const out = lang === 'ru' ? ru : tr(ru);
    if (out !== n.nodeValue) { n.nodeValue = out; }
    if (out !== ru) textOrig.set(n, { ru, out }); else if (rec) textOrig.delete(n);
  }
  function doAttrs(el) {
    if (el.closest && el.closest('[data-no-i18n]')) return;
    let rec = attrOrig.get(el);
    for (const a of ATTRS) {
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      const cur = el.getAttribute(a); const r = rec && rec[a];
      const ru = (r && cur === r.out) ? r.ru : cur;
      const out = lang === 'ru' ? ru : tr(ru);
      if (out !== cur) el.setAttribute(a, out);
      if (out !== ru) { rec = rec || {}; rec[a] = { ru, out }; attrOrig.set(el, rec); } else if (r) { delete rec[a]; }
    }
  }
  function walk(root) {
    if (!root) return; busy = true;
    try {
      if (root.nodeType === 3) { doText(root); return; }
      if (root.nodeType !== 1) return;
      if (root.matches && root.matches(SKIP) && !root.matches('textarea,input')) { if (root.matches('input,textarea')) doAttrs(root); return; }
      doAttrs(root);
      const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode: n => (n.nodeType === 1 && n.matches(SKIP) && !n.matches('input,textarea')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
      let n; while ((n = w.nextNode())) { n.nodeType === 3 ? doText(n) : doAttrs(n); }
    } finally { busy = false; }
  }
  const pending = new Set(); let raf = 0;
  function flush() { raf = 0; const arr = [...pending]; pending.clear(); arr.forEach(n => { if (n.isConnected !== false) walk(n); }); }
  const mo = new MutationObserver(muts => {
    if (busy) return;
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(n => pending.add(n));
      else if (m.type === 'characterData') pending.add(m.target);
      else if (m.type === 'attributes') pending.add(m.target);
    }
    if (!raf) raf = requestAnimationFrame(flush);
  });
  function start() {
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    walk(document.body);
  }

  // ───── перехват toast / alert / confirm / prompt ─────
  function hook(name) {
    const orig = window[name]; if (typeof orig !== 'function' || orig.__tx) return;
    const w = function (a, ...r) { return orig.call(this, typeof a === 'string' ? tr(a) : a, ...r); }; w.__tx = 1; window[name] = w;
  }
  function hookAll() { ['toast', 'alert', 'confirm', 'prompt'].forEach(hook); }

  function setLang(code) {
    if (!ORDER.includes(code)) return;
    lang = code; ls.set('chatex_lang', code);
    document.documentElement.lang = code;
    window.TX_LOCALE = (LANGS.find(l => l.code === code) || LANGS[0]).locale;
    walk(document.body);
    document.dispatchEvent(new CustomEvent('tx:lang', { detail: code }));
  }

  window.TX = { tr, setLang, getLang: () => lang, LANGS };
  window.t = tr;
  document.documentElement.lang = lang;
  window.TX_LOCALE = (LANGS.find(l => l.code === lang) || LANGS[0]).locale;

  hookAll();
  const init = () => { hookAll(); start(); };
  (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', init) : init();
})();
