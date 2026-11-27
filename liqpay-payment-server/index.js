// ============================================================
//  ChaTEX — сервер оплаты Premium через LiqPay (гривна, UAH)
//
//  Почему не принимаем рубли напрямую:
//  Российский эквайринг (ЮKassa/CloudPayments/Робокасса и т.п.) не может
//  зачислять деньги на украинский счёт — банковские рельсы РФ и Украины
//  сейчас не связаны. LiqPay (сервис ПриватБанка) наоборот: принимает
//  ЛЮБУЮ карту мира (включая российские Мир/Visa/MC, если у эмитента ещё
//  остался международный процессинг) и зачисляет продавцу сразу в гривне.
//  Поэтому цена показывается в UAH, а не в RUB.
//
//  Зачем отдельный сервер, а не просто кнопка на сайте:
//  Секретный private_key LiqPay нельзя класть в клиентский JS — иначе
//  кто угодно сам посчитает подпись и "оплатит" без реальной оплаты.
//  Поэтому подпись считает только этот сервер, а подтверждение оплаты
//  (server_url callback) тоже приходит сюда, а не в браузер пользователя.
//
//  Как это работает:
//   1. Пользователь жмёт "Купить Premium" -> клиент шлёт сюда свой
//      Firebase ID-token в POST /createPayment.
//   2. Сервер проверяет токен (значит, платит именно тот, кем назвался),
//      формирует данные платежа LiqPay и подписывает их private_key.
//   3. Клиент отправляет пользователя на checkout.liqpay.ua с этими
//      данными — там ввод карты и оплата, сервер карту не видит.
//   4. LiqPay после оплаты сам стучится на POST /liqpayCallback
//      (server_url) — сервер проверяет подпись, чтобы не поверить
//      подделанному запросу, и включает Premium уже здесь, на бэкенде.
//
//  Нужные переменные окружения (задаются на хостинге, НЕ в коде):
//   - FIREBASE_SERVICE_ACCOUNT — тот же JSON, что уже используется для
//     email-admin-server (можно переиспользовать один и тот же ключ)
//   - FIREBASE_DATABASE_URL    — https://chatex-8b404-default-rtdb.firebaseio.com
//   - ALLOWED_ORIGIN           — https://ваш-домен-хостинга (или * на первое время)
//   - LIQPAY_PUBLIC_KEY        — из личного кабинета liqpay.ua (Меню -> API)
//   - LIQPAY_PRIVATE_KEY       — оттуда же, НИКОМУ не показывать
//   - SERVER_URL               — публичный адрес ЭТОГО сервера после деплоя,
//                                 например https://chatex-payments.onrender.com
//   - PREMIUM_PRICE_UAH        — необязательно, по умолчанию 50 (можно менять
//                                 без передеплоя кода, просто сменить переменную)
// ============================================================
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});
const db = admin.database();

const LIQPAY_PUBLIC_KEY  = process.env.LIQPAY_PUBLIC_KEY;
const LIQPAY_PRIVATE_KEY = process.env.LIQPAY_PRIVATE_KEY;
const SERVER_URL         = process.env.SERVER_URL || '';
const PREMIUM_PRICE_UAH  = Number(process.env.PREMIUM_PRICE_UAH || 50);
const PREMIUM_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 1 месяц — как в клиенте

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());
// LiqPay шлёт callback как обычную HTML-форму (application/x-www-form-urlencoded)
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.send('ChaTEX liqpay-payment server работает ✅'));

function liqpaySign(data) {
  return crypto.createHash('sha1').update(LIQPAY_PRIVATE_KEY + data + LIQPAY_PRIVATE_KEY).digest('base64');
}

// ── Шаг 1: клиент запрашивает данные для оплаты ───────────────
app.post('/createPayment', async (req, res) => {
  try {
    if (!LIQPAY_PUBLIC_KEY || !LIQPAY_PRIVATE_KEY) {
      return res.status(500).json({ error: 'LiqPay ещё не настроен на сервере (нет ключей)' });
    }
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Нет токена авторизации' });

    // uid берём ТОЛЬКО из проверенного токена, а не из тела запроса —
    // иначе можно было бы подставить чужой uid и включить премиум не себе
    const decoded = await admin.auth().verifyIdToken(idToken);
    const uid = decoded.uid;
    const returnUrl = (req.body && typeof req.body.returnUrl === 'string' && req.body.returnUrl.startsWith('http'))
      ? req.body.returnUrl : undefined;

    const orderId = `premium_${uid}_${Date.now()}`;
    const payload = {
      public_key: LIQPAY_PUBLIC_KEY,
      version: 3,
      action: 'pay',
      amount: PREMIUM_PRICE_UAH,
      currency: 'UAH',
      description: 'ChaTEX Premium — 1 месяц',
      order_id: orderId,
      server_url: SERVER_URL ? SERVER_URL + '/liqpayCallback' : undefined,
      result_url: returnUrl,
      sandbox: process.env.LIQPAY_SANDBOX === '1' ? 1 : undefined
    };
    const data = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = liqpaySign(data);

    // Записываем платёж как "ожидает оплаты" — пригодится для отладки
    // и чтобы видеть в базе, что человек вообще пытался купить
    await db.ref('payments/' + uid + '/' + orderId).set({ status: 'created', amount: PREMIUM_PRICE_UAH, currency: 'UAH', createdAt: Date.now() });

    res.json({ data, signature, checkoutUrl: 'https://www.liqpay.ua/api/3/checkout' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Внутренняя ошибка сервера' });
  }
});

// ── Шаг 2: LiqPay сам сообщает сюда результат оплаты ──────────
app.post('/liqpayCallback', async (req, res) => {
  try {
    const { data, signature } = req.body || {};
    if (!data || !signature) return res.status(400).send('bad request');
    if (liqpaySign(data) !== signature) {
      console.warn('LiqPay callback: подпись не совпала — запрос не от LiqPay, игнорируем');
      return res.status(400).send('bad signature');
    }
    const payload = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    const { order_id: orderId, status } = payload;
    const m = /^premium_(.+)_(\d+)$/.exec(orderId || '');
    if (!m) return res.status(400).send('bad order_id');
    const uid = m[1];

    const paymentRef = db.ref('payments/' + uid + '/' + orderId);
    const already = (await paymentRef.once('value')).val();
    // success/sandbox — оплата прошла; остальные статусы (failure, error,
    // reversed и т.д.) премиум не выдают
    const paid = status === 'success' || status === 'sandbox';

    if (paid && already?.status !== 'success') {
      const userSnap = await db.ref('users/' + uid).once('value');
      const ud = userSnap.val() || {};
      const activeNow = ud.premium === true && ud.premiumExpiresAt && ud.premiumExpiresAt > Date.now();
      // Если премиум уже активен (например, по промо-акции) — продлеваем
      // от даты его окончания, а не от "сейчас", чтобы месяцы не пропадали
      const base = activeNow ? ud.premiumExpiresAt : Date.now();
      const premiumExpiresAt = base + PREMIUM_DURATION_MS;
      await db.ref('users/' + uid).update({ premium: true, premiumExpiresAt });
      await paymentRef.update({ status: 'success', liqpayStatus: status, paidAt: Date.now(), premiumExpiresAt });
    } else if (!paid) {
      await paymentRef.update({ status: 'failed', liqpayStatus: status, failedAt: Date.now() });
    }
    res.status(200).send('ok'); // LiqPay ждёт 200, иначе будет повторять запрос
  } catch (e) {
    console.error(e);
    res.status(500).send('server error');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('liqpay-payment server слушает порт ' + port));
