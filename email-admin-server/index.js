// ============================================================
//  ChaTEX — сервер для смены email пользователю из админ-панели
//
//  Зачем отдельный сервер, а не Firebase Cloud Functions:
//  Cloud Functions требуют план Blaze (даже если тратите $0).
//  Этот же код на Admin SDK можно запустить где угодно — здесь
//  он развёрнут как обычный Node/Express-сервер, который можно
//  бесплатно захостить на Render.com / Railway / Fly.io и т.п.
//  БЕЗ привязки карты и без апгрейда самого Firebase-проекта.
//
//  Как это работает:
//   1. Админ жмёт "Сохранить" в панели -> клиент берёт свой
//      Firebase ID-token (auth.currentUser.getIdToken()).
//   2. Клиент шлёт POST на этот сервер с токеном в заголовке.
//   3. Сервер проверяет токен через Admin SDK, смотрит в БД,
//      что вызывающий — админ, и меняет email в Auth + в БД.
//
//  Нужные переменные окружения (задаются на хостинге, НЕ в коде):
//   - FIREBASE_SERVICE_ACCOUNT — весь JSON сервисного аккаунта
//     одной строкой (см. инструкцию в README.md рядом)
//   - FIREBASE_DATABASE_URL    — например https://chatex-8b404-default-rtdb.firebaseio.com
//   - ALLOWED_ORIGIN           — https://ваш-домен-хостинга (или * на первое время)
// ============================================================
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.database();
const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(express.json());

app.get('/', (req, res) => res.send('ChaTEX email-admin server работает ✅'));

app.post('/adminUpdateUserEmail', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return res.status(401).json({ error: 'Нет токена авторизации' });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const callerUid = decoded.uid;

    const callerSnap = await db.ref('users/' + callerUid).once('value');
    const callerData = callerSnap.val() || {};
    if (!callerData.isAdmin && !callerData.isSuperAdmin) {
      return res.status(403).json({ error: 'Только для администраторов' });
    }

    const { uid, email } = req.body || {};
    if (!uid || !email) return res.status(400).json({ error: 'Нужны uid и email' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Некорректный email' });
    }

    await admin.auth().updateUser(uid, { email, emailVerified: false });
    await db.ref('users/' + uid).update({ email });

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    const code = e.code === 'auth/email-already-exists' ? 409 : 500;
    res.status(code).json({ error: e.message || 'Внутренняя ошибка сервера' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log('email-admin server слушает порт ' + port));
