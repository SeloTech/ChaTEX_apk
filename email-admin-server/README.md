# Сервер смены email (без Firebase Blaze)

Позволяет админ-панели ChaTEX менять email пользователю **и в Firebase
Authentication, и в базе данных** — без апгрейда Firebase-проекта до Blaze.
Работает на обычном бесплатном Node-хостинге.

## Шаг 1. Получить ключ сервисного аккаунта Firebase (бесплатно, без карты)

1. Откройте https://console.firebase.google.com/project/chatex-8b404/settings/serviceaccounts/adminsdk
2. Нажмите **"Generate new private key"** → скачается файл `chatex-8b404-firebase-adminsdk-xxxxx.json`.
3. Откройте этот файл текстовым редактором — это и есть `FIREBASE_SERVICE_ACCOUNT`
   (весь JSON целиком, одной строкой, вставите его в переменную окружения на хостинге).

Это НЕ требует Blaze — генерация ключа сервисного аккаунта бесплатна на любом плане.

## Шаг 2. Задеплоить сервер на Render.com (бесплатно, без карты)

1. Зарегистрируйтесь на https://render.com (можно через GitHub).
2. Залейте папку `email-admin-server/` в свой репозиторий на GitHub
   (можно отдельным маленьким репозиторием).
3. В Render: **New → Web Service** → выберите этот репозиторий.
4. Настройки:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. В разделе **Environment** добавьте переменные:
   - `FIREBASE_SERVICE_ACCOUNT` — весь JSON из шага 1 (вставить как одну строку)
   - `FIREBASE_DATABASE_URL` — `https://chatex-8b404-default-rtdb.firebaseio.com`
   - `ALLOWED_ORIGIN` — адрес вашего сайта, например `https://chatex-8b404.web.app`
6. Deploy. Render выдаст адрес вида `https://chatex-email-admin.onrender.com`.

(Вместо Render подойдёт любой похожий бесплатный Node-хостинг — Railway, Fly.io,
Cyclic — процесс почти одинаковый: задать те же 3 переменные окружения и команду
запуска `npm start`.)

⚠️ Бесплatный план Render "засыпает" после ~15 минут без запросов и первый
запрос после сна выполняется на 20-30 секунд дольше — это нормально для
редко используемой функции смены email.

## Шаг 3. Подключить адрес сервера в ChaTEX

Откройте `js/01-config-state.js` и впишите ваш адрес из Render:

```js
const EMAIL_ADMIN_API_URL = 'https://chatex-email-admin.onrender.com/adminUpdateUserEmail';
```

Задеплойте сайт как обычно: `firebase deploy --only hosting`.

Готово — смена email в админ-панели теперь работает без Blaze.
