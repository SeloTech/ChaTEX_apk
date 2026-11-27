// ============================================================
//  ChaTEX — пользовательское соглашение, «О нас» (соцсети пользователя)
//  users/{uid}/termsVersion, termsAcceptedAt — принятие соглашения
//  users/{uid}/socials — { tiktok, youtube, instagram }
// ============================================================
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // При изменении текста соглашения поднимите версию — все пользователи подтвердят его заново.
  const TERMS_VERSION = '2026-11-07';

  const TERMS_HTML = `
<p><b>Редакция от ${TERMS_VERSION}.</b> Соглашение заключается между вами и командой ChaTEX при регистрации и использовании сервиса. Пожалуйста, прочитайте его полностью. Продолжая, вы подтверждаете, что прочитали и принимаете его условия.</p>

<h4>1. Общие положения</h4>
<p>ChaTEX — сервис обмена сообщениями, файлами, изображениями и стикерами, а также публичных каналов и групп. Сервис предоставляется в том виде, в каком он есть на текущий момент. Если вы не согласны с условиями — не регистрируйтесь и не используйте сервис.</p>

<h4>2. Регистрация, псевдоним и возраст</h4>
<p>Для регистрации <b>не требуется</b> указывать настоящие фамилию, имя и отчество. Рекомендуется использовать псевдоним или никнейм (например, «Help Pet's», «Night_Fox»). Вы не должны выдавать себя за другого человека, журналиста, публичное лицо, сотрудника ChaTEX или организацию, использовать чужие фото, логотипы и бренды без права на это.</p>
<p>Пользоваться сервисом можно с 14 лет. Пользователи младше 18 лет используют сервис с согласия родителей или законных представителей. Указывая данные при регистрации, вы подтверждаете, что они достоверны и относятся к вам.</p>

<h4>3. Аккаунт и безопасность</h4>
<p>Вы отвечаете за сохранность пароля, облачного пароля, код-пароля и доступа к устройствам, с которых выполнен вход. Все действия, совершённые с вашего аккаунта, считаются совершёнными вами. Если вы заметили подозрительную активность, немедленно завершите сеансы в разделе «Устройства», смените пароль и сообщите в поддержку. Никому не передавайте свои пароли, коды и доступ к аккаунту.</p>
<p>Администрация никогда не попросит ваш пароль, облачный пароль или код-пароль. Любые просьбы об этом — мошенничество.</p>

<h4>4. Ваш контент</h4>
<p>Вы сами несёте полную ответственность за всё, что публикуете и отправляете: сообщения, файлы, изображения, стикеры, эмодзи, названия и описания каналов и групп, ссылки, био, значки и данные в профиле. Вы гарантируете, что имеете права на отправляемый контент.</p>
<p>Размещая контент, вы предоставляете ChaTEX неисключительное право хранить, технически обрабатывать и показывать его вам и участникам чатов, в которые он отправлен, исключительно для работы сервиса. Это право прекращается при удалении контента или аккаунта, за исключением копий в резервных хранилищах и случаев, когда контент уже получен другими участниками.</p>

<h4>5. Запрещённое поведение</h4>
<p>Запрещено: незаконный контент; угрозы, травля, доксинг (раскрытие чужих личных данных, адреса, телефона, места работы); порнография и сексуальный контент с участием несовершеннолетних (такие материалы немедленно удаляются, аккаунт блокируется, а информация передаётся в правоохранительные органы); разжигание ненависти и дискриминация; мошенничество, фишинг, поддельные сайты и «розыгрыши»; спам и массовые рассылки; вредоносное ПО и ссылки на него; попытки взлома, обхода ограничений, парсинга и перегрузки сервиса; продажа запрещённых товаров и услуг; выдача себя за других людей и организации.</p>

<h4>6. Переписка и конфиденциальность</h4>
<p><b>Сообщения не шифруются сквозным шифрованием.</b> Переписка, файлы и профиль хранятся на серверах и в облачной инфраструктуре, которую использует сервис (включая Google Firebase и Cloudinary). Технически доступ к данным может иметь администрация, в том числе для модерации жалоб, восстановления работы сервиса и выполнения требований закона.</p>
<p>Получатель сообщения, участники групп и каналов могут сохранить, переслать или скопировать ваш контент. Отправленное нельзя гарантированно «забрать» или удалить у других. Не отправляйте через ChaTEX данные, раскрытие которых может навредить вам или третьим лицам: пароли, номера банковских карт, коды подтверждения, паспортные данные, документы.</p>

<h4>7. Данные, которые собираются</h4>
<p>Для работы сервиса собираются: email, никнейм и имя пользователя, аватар, био, день рождения (по желанию), ссылки на соцсети (по желанию), сообщения и файлы, статусы присутствия, IP-адрес и сведения об устройстве и браузере при входе (раздел «Устройства»), дата и время входа, принятие соглашения. Данные используются для работы сервиса, безопасности, модерации и поддержки, но не для продажи третьим лицам.</p>
<p>Вы можете удалить аккаунт через поддержку. Часть данных может сохраняться в резервных копиях и в объёме, который требует закон.</p>

<h4>8. Отказ от ответственности</h4>
<p><b>Разработчики и команда ChaTEX не несут ответственности за:</b></p>
<ul>
  <li>содержание переписки, сообщений, файлов, названий и описаний каналов и групп, а также любой контент пользователей и последствия его использования;</li>
  <li>сделки, договорённости, переданные деньги, товары и услуги между пользователями, включая мошенничество;</li>
  <li>утечки, потерю, изменение, удаление или раскрытие переписки и данных, вызванные взломом, ошибками, сбоями, атаками, действиями третьих лиц или вашими собственными действиями (передачей паролей, установкой подозрительных программ, входом с чужих устройств);</li>
  <li>перебои в работе, недоступность, задержки и потерю уведомлений, а также ошибки отображения;</li>
  <li>работу сторонних сервисов (хостинг, аутентификация, хранилища файлов, определение страны по IP и т.д.), сайты и ссылки третьих лиц;</li>
  <li>решения, которые вы принимаете, опираясь на информацию из сервиса, включая сведения о других пользователях, их значки, верификацию и соцсети.</li>
</ul>
<p>Сервис предоставляется «как есть» и «как доступно», без гарантий бесперебойной работы, отсутствия ошибок и защищённости от всех угроз. В максимальной степени, допускаемой законом, совокупная ответственность команды ChaTEX перед вами ограничена суммой, которую вы уплатили за сервис за последние 12 месяцев (если платежей не было — нулём). Эти ограничения не применяются там, где закон не допускает их, в частности при умысле или грубой неосторожности.</p>

<h4>9. Возмещение ущерба</h4>
<p>Вы обязуетесь возместить команде ChaTEX ущерб, включая судебные расходы, которые возникли из-за вашего нарушения соглашения или законов, вашего контента или использования вами сервиса.</p>

<h4>10. Модерация, жалобы и блокировка</h4>
<p>Команда вправе без предварительного уведомления удалить контент, ограничить функции, заблокировать аккаунт, канал или группу, если они нарушают соглашение или закон. Жалобы подаются через раздел поддержки и рассматриваются в разумные сроки. Решения о блокировке могут быть обжалованы через поддержку.</p>

<h4>11. Права третьих лиц</h4>
<p>Если вы считаете, что контент нарушает ваши авторские или иные права, направьте уведомление через поддержку с указанием ссылки, описания нарушения и своих данных для связи. Администрация вправе удалить такой контент.</p>

<h4>12. Сторонние сервисы и ссылки</h4>
<p>Сервис может содержать ссылки на сайты, соцсети и сервисы третьих лиц, а также использовать их технологии. Команда ChaTEX не контролирует и не отвечает за их содержание, условия и политику конфиденциальности. Переходите по ссылкам на свой риск.</p>

<h4>13. Безопасность при использовании</h4>
<p>Рекомендуем: использовать уникальный пароль и включить код-пароль и облачный пароль; не переходить по подозрительным ссылкам; не передавать деньги и данные незнакомым людям; регулярно проверять список устройств; сохранять важные файлы и переписку самостоятельно.</p>

<h4>14. Изменения и прекращение работы</h4>
<p>Команда может менять функции сервиса, добавлять или отключать возможности, а также временно или полностью прекращать работу сервиса. О существенных изменениях мы постараемся сообщить в приложении. Прекращение работы не даёт права требовать компенсации, кроме случаев, прямо предусмотренных законом.</p>

<h4>15. Изменения соглашения</h4>
<p>Соглашение может меняться. Новая редакция вступает в силу после публикации в приложении. Для продолжения использования потребуется подтвердить её принятие. Продолжая пользоваться сервисом после подтверждения, вы соглашаетесь с изменениями.</p>

<h4>16. Применимое право и споры</h4>
<p>Соглашение регулируется законодательством [укажите юрисдикцию]. Споры решаются переговорами, а при их невозможности — в суде по месту нахождения команды, если иное не предусмотрено законом.</p>

<h4>17. Контакты</h4>
<p>Обращения, жалобы, запросы о данных и уведомления о нарушениях направляйте через раздел «Помощь» / поддержку в приложении.</p>

<p style="font-size:11.5px;color:var(--text3)">Этот текст носит общий характер и не заменяет консультацию юриста. Перед публичным запуском проверьте его с учётом законодательства вашей страны и стран пользователей.</p>`;

  // ---- модальное окно соглашения ----
  function openTerms(opts = {}) {
    return new Promise(resolve => {
      const ov = document.createElement('div'); ov.className = 'tx-sheet-ov';
      const accept = !!opts.accept;
      ov.innerHTML = `<div class="tx-sheet tx-terms" role="dialog">
        <div class="tx-sheet-t">Пользовательское соглашение</div>
        <div class="tx-terms-body">${TERMS_HTML}</div>
        ${accept ? `<label class="tx-terms-check"><input type="checkbox" id="tx-terms-ok"> Я прочитал(а) и принимаю соглашение</label>` : ''}
        <div class="tx-sheet-err" id="tx-terms-err"></div>
        <div class="tx-sheet-b">${accept ? '<button class="tx-b-cancel">Не принимаю</button><button class="tx-b-ok" disabled>Принять и продолжить</button>' : '<button class="tx-b-ok">Закрыть</button>'}</div>
      </div>`;
      document.body.appendChild(ov);
      const close = v => { ov.remove(); resolve(v); };
      if (!accept) { ov.querySelector('.tx-b-ok').onclick = () => close(true); return; }
      const chk = $('#tx-terms-ok', ov), ok = ov.querySelector('.tx-b-ok');
      // кнопка активна только после прокрутки до конца и галочки
      const body = ov.querySelector('.tx-terms-body');
      let scrolledEnd = false;
      const upd = () => { ok.disabled = !(chk.checked && scrolledEnd); };
      body.addEventListener('scroll', () => { if (body.scrollTop + body.clientHeight >= body.scrollHeight - 12) { scrolledEnd = true; upd(); } }, { passive: true });
      if (body.scrollHeight <= body.clientHeight + 12) scrolledEnd = true;
      chk.onchange = upd; upd();
      ov.querySelector('.tx-b-cancel').onclick = () => close(false);
      ok.onclick = () => close(true);
    });
  }

  // ---- вход: если версия соглашения не принята — показываем и требуем принять ----
  async function gate(user) {
    let ver = null;
    try { ver = (await db.ref('users/' + user.uid + '/termsVersion').once('value')).val(); } catch (_) { return true; }
    if (ver === TERMS_VERSION) return true;
    const ok = await openTerms({ accept: true });
    if (ok) {
      try { await db.ref('users/' + user.uid).update({ termsVersion: TERMS_VERSION, termsAcceptedAt: Date.now() }); } catch (_) {}
      return true;
    }
    try { await auth.signOut(); } catch (_) {}
    return false;
  }

  // ---- страницы настроек ----
  function renderTerms() {
    const h = $('#tg-terms-host'); if (!h) return;
    h.innerHTML = `<div class="tx-legal">${TERMS_HTML}</div>`;
  }

  const SOCIAL_FIELDS = [
    { key: 'tiktok', label: 'TikTok', ph: 'https://www.tiktok.com/@ваш_ник', ic: '🎵' },
    { key: 'youtube', label: 'YouTube', ph: 'https://www.youtube.com/@ваш_канал', ic: '▶️' },
    { key: 'instagram', label: 'Instagram', ph: 'https://www.instagram.com/ваш_ник', ic: '📸' },
    { key: 'telegram', label: 'Telegram', ph: 'https://t.me/ваш_ник', ic: '✈️' }
  ];
  const isUrl = s => !s || /^https:\/\/[^\s]{3,200}$/i.test(s);

  // Официальные страницы ChaTEX. Заполните позже: { title, url, ic }
  const APP_LINKS = [];

  function renderUs() {
    const h = $('#tg-us-host'); if (!h) return;
    const list = APP_LINKS.length
      ? `<div class="tg-group tx-us-group">${APP_LINKS.map(l => `<a class="tx-us-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(l.ic || '🔗')}</span> ${esc(l.title)}</a>`).join('')}</div>`
      : '<div class="tg-hint" style="text-align:center;padding:24px 12px">Официальные страницы ChaTEX скоро появятся здесь.</div>';
    h.innerHTML = list;
  }

  // ---- соцсети пользователя: поля внутри профиля (карандаш → «О себе») ----
  const SOCIAL_KEYS = SOCIAL_FIELDS.map(f => f.key);
  async function loadProfileSocials(uid) {
    if (!uid) return;
    const s = (await db.ref('users/' + uid + '/socials').once('value')).val() || {};
    SOCIAL_FIELDS.forEach(f => { const el = document.getElementById('pm-soc-' + f.key); if (el) el.value = s[f.key] || ''; });
  }
  // Возвращает { data } или { error }
  function readProfileSocials() {
    const data = {};
    for (const f of SOCIAL_FIELDS) {
      const el = document.getElementById('pm-soc-' + f.key);
      const v = el ? el.value.trim() : '';
      if (!isUrl(v)) return { error: `${f.label}: нужна ссылка, начинающаяся с https://` };
      if (v) data[f.key] = v;
    }
    return { data };
  }

  // ---- блок ссылок в профиле (просмотр) ----
  async function renderSocials(uid, host) {
    if (!uid || !host) return;
    const s = (await db.ref('users/' + uid + '/socials').once('value').catch(() => null))?.val() || {};
    const items = SOCIAL_FIELDS.filter(f => s[f.key]);
    const old = host.querySelector('.tx-socials'); if (old) old.remove();
    if (!items.length) return;
    const div = document.createElement('div'); div.className = 'tx-socials';
    div.innerHTML = items.map(f => `<a href="${esc(s[f.key])}" target="_blank" rel="noopener noreferrer" title="${f.label}">${f.ic} ${f.label}</a>`).join('');
    host.appendChild(div);
  }

  // ---- стили модалки соглашения (короткие) ----
  const st = document.createElement('style');
  st.textContent = `
    .tx-terms{max-width:520px;max-height:88vh;display:flex;flex-direction:column}
    .tx-terms-body{overflow-y:auto;max-height:52vh;font-size:12.5px;line-height:1.55;color:var(--text2);padding-right:4px}
    .tx-terms-body h4,.tx-legal h4{color:var(--text);font-size:13px;margin:14px 0 4px}
    .tx-terms-body ul,.tx-legal ul{padding-left:18px;margin:6px 0}
    .tx-terms-check{display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px;color:var(--text)}
    .tx-legal{font-size:13px;line-height:1.6;color:var(--text2);padding:4px 4px 16px}
    .tx-us-group{padding:4px 0}
    .tx-us-row{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.06)}
    .tx-us-row:last-child{border-bottom:0}
    .tx-us-lbl{font-size:12.5px;color:var(--text2);margin-bottom:6px}
    .tx-us-in{width:100%;box-sizing:border-box;background:var(--surface3);border:1px solid var(--border);border-radius:10px;padding:9px 11px;color:var(--text);font:13px var(--mono);outline:none}
    .tx-us-in:focus{border-color:var(--accent)}
    .tx-us-link{display:flex;gap:10px;align-items:center;padding:13px 14px;color:var(--text);text-decoration:none;border-bottom:1px solid rgba(255,255,255,.06)}
    .tx-us-link:last-child{border-bottom:0}
    .tx-socials{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:10px}
    .tx-socials a{font-size:12px;color:var(--text);text-decoration:none;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:5px 11px}
    .tx-socials a:hover{background:rgba(61,139,255,.2)}
  `;
  document.head.appendChild(st);

  // Ссылка на соглашение в форме регистрации и в самом низу настроек
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-open-terms]')) { e.preventDefault(); openTerms(); }
  });

  window.TXLegal = { TERMS_VERSION, openTerms, gate, renderTerms, renderUs, renderSocials, loadProfileSocials, readProfileSocials, SOCIAL_FIELDS };
})();
