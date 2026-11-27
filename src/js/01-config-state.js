// ============================================================
//  ChaTEX — app.js
//  Все функции приложения. Подключается после Firebase SDK.
// ============================================================

// ─── FIREBASE ───────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDs28vEMu_3dje3wXCim9rSoIpfyU4mlDE",
  authDomain: "chatex-8b404.firebaseapp.com",
  databaseURL: "https://chatex-8b404-default-rtdb.europe-west1.firebasedatabase.app/",
  projectId: "chatex-8b404",
  storageBucket: "chatex-8b404.appspot.com",
  messagingSenderId: "151283548528",
  appId: "1:151283548528:web:bc992cca389de5fe88cfb5"
};
firebase.initializeApp(firebaseConfig);
const db        = firebase.database();
const auth      = firebase.auth();
const storage   = firebase.storage();

// Адрес отдельного сервера, который меняет email пользователю в Auth+БД
// (не через Firebase Cloud Functions — чтобы не требовался план Blaze).
// См. email-admin-server/README.md — впишите сюда свой адрес после деплоя,
// пока пусто — админка просто не будет пытаться менять чужой Auth-email.
const EMAIL_ADMIN_API_URL = '';
// Адрес сервера оплаты (liqpay-payment-server/, см. README рядом с ним).
// Пока не вписан — кнопка "Купить Premium" покажет понятное сообщение,
// а не тихо ничего не сделает.
const LIQPAY_SERVER_URL = '';
const PREMIUM_PRICE_UAH = 50; // ориентир: ≈100 ₽ на момент настройки, курс меняется

// ─── CONSTANTS ──────────────────────────────────────────────
const ADMIN_NAMES  = ['AdminRubick72252', 'Rubick', 'Skils'];
const RUBICK_NAMES = ['AdminRubick72252', 'Rubick', 'Skils']; // SUPER ADMIN + full rights
const SUPER_ADMIN_NAMES = RUBICK_NAMES;
const MEDIA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const IMGBB_KEY    = 'da36a1def6022c3b4a3ddd59af66de12';
const TICKET_CLOSED_TTL_MS = 20 * 60 * 1000; // закрытая жалоба пропадает из списка через 20 минут

// Текущая версия клиента. Меняйте это значение (и пишите в БД такое же
// через панель админа) при каждом релизе — это то, с чем сверяется
// system/appVersion в реальном времени, чтобы показать баннер обновления.
const APP_VERSION = '18.0';

// ─── STATE ──────────────────────────────────────────────────
let currentUser     = null;
let currentUserData = null;
let currentChatId   = 'official';
let currentChatType = 'official';
let currentChatData = null;
let msgListeners    = {}; // chatId -> { path, handlers }
let activeMsgPath   = null;
let dmChatList      = {};
let ctxMsgId = null, ctxChatId = null, ctxMsgData = null;
let editingMsgId = null, editingChatId = null;
let replyToMsg  = null;
let pinnedMsgId = null;
let pinnedList = [];   // [{msgId, text, ts}, ...] отсортировано по времени закрепа, для текущего чата
let pinnedIndex = 0;   // какой из pinnedList сейчас показан в баре
let mediaRecorder = null, audioChunks = [], isRecording = false, voiceStartTime = 0;
let currentSideTab   = 'all';
let verifyPendingData = null, verifyCode_store = null;
let premiumExpiryInterval = null;
let touchTimer = null, touchStartTime = 0;
let userSettings      = {};
let editingChannelId  = null, editingGroupId = null;
let blockChanTarget   = null;
let friendsMap        = {};
let personCtxTarget   = null;
let complaintReplyId  = null;
let chatPrefs         = {};
let complaintsCache   = {}; // { chatId: { pinned, hidden } }

