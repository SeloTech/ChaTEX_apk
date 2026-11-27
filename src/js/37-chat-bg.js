// ============================================================
//  ChaTEX — фоны чата (Настройки → Внешний вид → Фон чата)
//  Готовые фоны нарисованы кодом (без внешних картинок — работают офлайн),
//  а ещё можно загрузить свою картинку или вставить ссылку.
//  Выбор хранится на этом устройстве (localStorage), в БД ничего не пишется.
// ============================================================
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const KEY = 'tx_bg_v1', IMG = 'tx_bg_img';
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (_) { return null; } }, set: k_v => { try { localStorage.setItem(k_v[0], k_v[1]); return true; } catch (_) { return false; } }, del: k => { try { localStorage.removeItem(k); } catch (_) {} } };
  const uri = svg => 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';

  // детерминированные звёзды
  function stars(n, seed, size = 320) {
    let s = seed; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; let c = '';
    for (let i = 0; i < n; i++) c += `<circle cx="${(r() * size).toFixed(1)}" cy="${(r() * size).toFixed(1)}" r="${(r() * 1.2 + .3).toFixed(2)}" fill="#fff" opacity="${(r() * .7 + .25).toFixed(2)}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${c}</svg>`;
  }
  const waves = c1 => `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="140" viewBox="0 0 600 140"><path d="M0 70 Q75 20 150 70 T300 70 T450 70 T600 70 V140 H0Z" fill="${c1}" opacity=".16"/><path d="M0 95 Q75 55 150 95 T300 95 T450 95 T600 95 V140 H0Z" fill="${c1}" opacity=".16"/></svg>`;
  const grid = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><path d="M56 0H0V56" fill="none" stroke="#ff2d95" stroke-opacity=".28" stroke-width="1.2"/></svg>`;
  const peaks = (c, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="220" viewBox="0 0 700 220" preserveAspectRatio="none"><path d="M0 220V150L90 90 170 140 270 50 370 130 450 80 560 150 640 100 700 140V220Z" fill="${c}" opacity="${h}"/></svg>`;

  const PRESETS = [
    { id: 'aurora',  n: 'Аврора',          css: 'radial-gradient(60% 50% at 15% 10%,rgba(124,58,237,.8),transparent 70%),radial-gradient(50% 45% at 90% 85%,rgba(34,200,255,.55),transparent 70%),radial-gradient(40% 40% at 70% 20%,rgba(236,72,153,.35),transparent 70%),#140b2e' },
    { id: 'nebula',  n: 'Туманность',      css: `${uri(stars(70, 11))},radial-gradient(45% 40% at 25% 30%,rgba(236,72,153,.6),transparent 70%),radial-gradient(50% 45% at 75% 65%,rgba(59,130,246,.6),transparent 70%),radial-gradient(30% 30% at 55% 15%,rgba(168,85,247,.5),transparent 70%),#0b0620` },
    { id: 'sunset',  n: 'Закат',           css: 'radial-gradient(40% 25% at 50% 80%,rgba(255,225,150,.75),transparent 70%),linear-gradient(180deg,#2b1055 0%,#7b2d8b 32%,#e8537a 64%,#ffb15c 100%)' },
    { id: 'ocean',   n: 'Океан',           css: `${uri(waves('#9be7ff'))} repeat-x bottom/600px 140px,linear-gradient(180deg,#041c3a,#0a4a78 55%,#0e7fa8)` },
    { id: 'forest',  n: 'Лес',             css: 'radial-gradient(60% 40% at 30% 0%,rgba(120,255,180,.2),transparent 70%),linear-gradient(160deg,#04180f,#0c3a26 50%,#1b5e3a)' },
    { id: 'night',   n: 'Звёздная ночь',   css: `${uri(stars(110, 7))},linear-gradient(180deg,#02030a,#0b1230 70%,#18204a)` },
    { id: 'cherry',  n: 'Вишня',           css: 'radial-gradient(30% 30% at 80% 20%,rgba(255,200,220,.28),transparent 70%),linear-gradient(135deg,#3b0a2a,#8c1d54 55%,#e05a8a)' },
    { id: 'north',   n: 'Северное сияние', css: `${uri(stars(60, 3))},radial-gradient(70% 35% at 30% 20%,rgba(52,255,170,.55),transparent 70%),radial-gradient(60% 35% at 75% 30%,rgba(130,90,255,.55),transparent 70%),linear-gradient(180deg,#020a14,#06202e)` },
    { id: 'neon',    n: 'Неон-сетка',      css: `${uri(grid)},linear-gradient(180deg,#0a0220,#2a0a5c 60%,#ff2d95 130%)` },
    { id: 'mint',    n: 'Мята',            css: 'radial-gradient(50% 35% at 80% 10%,rgba(190,255,235,.25),transparent 70%),linear-gradient(150deg,#06302e,#0f6b62 55%,#2fb59a)' },
    { id: 'desert',  n: 'Пустыня',         css: 'radial-gradient(45% 30% at 20% 85%,rgba(255,200,120,.35),transparent 70%),linear-gradient(170deg,#2a1608,#7a3d14 50%,#d9893a)' },
    { id: 'mount',   n: 'Горы',            css: `${uri(peaks('#0a1426', .9))} bottom/100% 45% no-repeat,${uri(peaks('#16294a', .8))} bottom/100% 62% no-repeat,${uri(stars(50, 5))},linear-gradient(180deg,#0d1b3a,#35508a 70%,#9ab4e6)` },
    { id: 'black',   n: 'Чёрный',          css: '#000' }
  ];

  let layer, state = load();
  function load() { try { return JSON.parse(ls.get(KEY)) || { t: 'none', dim: 25, blur: 0 }; } catch (_) { return { t: 'none', dim: 25, blur: 0 }; } }
  const save = () => ls.set([KEY, JSON.stringify(state)]);

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    const ca = document.getElementById('chat-area'); if (!ca) return null;
    layer = document.createElement('div'); layer.id = 'tx-bg-layer'; ca.insertBefore(layer, ca.firstChild); return layer;
  }
  function cssFor(s) {
    if (s.t === 'preset') { const p = PRESETS.find(x => x.id === s.id); return p ? p.css : ''; }
    if (s.t === 'custom') { const d = ls.get(IMG); return d ? `url("${d}") center/cover no-repeat` : ''; }
    if (s.t === 'url' && s.url) return `url("${String(s.url).replace(/"/g, '%22')}") center/cover no-repeat`;
    return '';
  }
  function apply() {
    const L = ensureLayer(); if (!L) return;
    const bg = cssFor(state);
    document.documentElement.classList.toggle('tx-has-bg', !!bg);
    L.style.background = bg || 'none';
    L.style.setProperty('--tx-dim', String((state.dim || 0) / 100));
    L.style.setProperty('--tx-blur', (state.blur || 0) + 'px');
    L.classList.toggle('blur', (state.blur || 0) > 0);
  }

  // ───── загрузка своей картинки (сжимаем до ~1600px, чтобы влезло в хранилище) ─────
  function fromFile(file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('type'));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('read'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('img'));
        img.onload = () => {
          for (const [max, q] of [[1600, .82], [1280, .7], [960, .62]]) {
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            const data = c.toDataURL('image/jpeg', q);
            if (ls.set([IMG, data])) return res(data);
          }
          rej(new Error('quota'));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function fromUrl(u) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(u); i.onerror = () => rej(new Error('img')); i.referrerPolicy = 'no-referrer'; i.src = u; });
  }

  // ───── интерфейс в Настройки → Внешний вид ─────
  function inject() {
    const page = $('.tg-page[data-page="look"]'); if (!page || $('#tx-bg-box', page)) return;
    const box = document.createElement('div'); box.id = 'tx-bg-box'; box.className = 'settings-section';
    box.innerHTML = `
      <h4 style="display:block!important;margin-bottom:8px">Фон чата</h4>
      <div class="tx-bg-grid" id="tx-bg-grid"></div>
      <div class="settings-row"><div class="settings-row-info"><div class="settings-row-label">Затемнение</div></div><input type="range" id="tx-bg-dim" min="0" max="80" step="5"></div>
      <div class="settings-row"><div class="settings-row-info"><div class="settings-row-label">Размытие</div></div><input type="range" id="tx-bg-blur" min="0" max="20" step="1"></div>
      <div class="tx-bg-url"><input type="url" id="tx-bg-url" placeholder="Ссылка на картинку" data-no-i18n-off><button class="tg-btn" id="tx-bg-url-ok" style="width:auto;margin:0;padding:0 16px">Применить</button></div>
      <button class="tg-btn" id="tx-bg-reset">Сбросить фон</button>
      <div class="tg-hint" style="padding-top:10px">Фон хранится только на этом устройстве</div>
      <input type="file" id="tx-bg-file" accept="image/*" hidden>`;
    page.appendChild(box);
    const grid = $('#tx-bg-grid', box);
    const tile = (cls, style, label, attrs) => `<div class="tx-bg-tile ${cls}" ${attrs} style="${style}"><span>${label}</span></div>`;
    grid.innerHTML =
      tile('up', '', 'Загрузить своё', 'data-act="upload"') +
      tile('none', '', 'Без фона', 'data-act="none"') +
      PRESETS.map(p => tile('', `background:${p.css.replace(/"/g, '&quot;')}`, p.n, `data-id="${p.id}"`)).join('');
    const mark = () => {
      grid.querySelectorAll('.tx-bg-tile').forEach(t => t.classList.remove('on'));
      const on = state.t === 'preset' ? grid.querySelector(`[data-id="${state.id}"]`) : state.t === 'none' ? grid.querySelector('[data-act="none"]') : grid.querySelector('[data-act="upload"]');
      if (on) on.classList.add('on');
    };
    const dim = $('#tx-bg-dim', box), bl = $('#tx-bg-blur', box), url = $('#tx-bg-url', box), file = $('#tx-bg-file', box);
    dim.value = state.dim || 0; bl.value = state.blur || 0; if (state.t === 'url') url.value = state.url || '';
    const done = () => { save(); apply(); mark(); };
    grid.addEventListener('click', e => {
      const t = e.target.closest('.tx-bg-tile'); if (!t) return;
      if (t.dataset.act === 'upload') return file.click();
      if (t.dataset.act === 'none') state = { t: 'none', dim: state.dim, blur: state.blur };
      else state = { t: 'preset', id: t.dataset.id, dim: state.dim, blur: state.blur };
      done(); toast('Фон обновлён');
    });
    file.addEventListener('change', async () => {
      const f = file.files[0]; file.value = '';
      try { await fromFile(f); state = { t: 'custom', dim: Math.max(state.dim || 0, 15), blur: state.blur }; dim.value = state.dim; done(); toast('Фон обновлён'); }
      catch (err) { toast(err.message === 'type' ? 'Выберите файл-картинку' : 'Не удалось загрузить картинку'); }
    });
    $('#tx-bg-url-ok', box).addEventListener('click', async () => {
      const u = url.value.trim(); if (!/^https?:\/\//i.test(u)) return toast('Не удалось загрузить картинку');
      try { await fromUrl(u); state = { t: 'url', url: u, dim: Math.max(state.dim || 0, 15), blur: state.blur }; dim.value = state.dim; done(); toast('Фон обновлён'); }
      catch (_) { toast('Не удалось загрузить картинку'); }
    });
    dim.addEventListener('input', () => { state.dim = +dim.value; save(); apply(); });
    bl.addEventListener('input', () => { state.blur = +bl.value; save(); apply(); });
    $('#tx-bg-reset', box).addEventListener('click', () => { ls.del(IMG); state = { t: 'none', dim: 25, blur: 0 }; dim.value = 25; bl.value = 0; url.value = ''; done(); toast('Фон сброшен'); });
    mark();
  }

  function ready(fn) { (document.readyState === 'loading') ? document.addEventListener('DOMContentLoaded', fn) : fn(); }
  ready(() => {
    apply(); inject();
    const _open = window.openSettings;
    if (typeof _open === 'function') window.openSettings = function () { const r = _open.apply(this, arguments); inject(); return r; };
    // чат-область может пересоздаваться — следим, чтобы слой фона на месте
    setInterval(() => { if (state.t !== 'none' && (!layer || !layer.isConnected)) apply(); }, 1500);
  });
})();
