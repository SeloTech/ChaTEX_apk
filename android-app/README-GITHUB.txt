Сборка APK на GitHub
====================
1. Загрузите весь проект (папка chatex) в репозиторий GitHub (ветка main).
2. Откройте вкладку Actions → "Build Android APK" → Run workflow (или просто сделайте push).
3. Когда сборка зелёная, откройте запуск и скачайте артефакт ChaTEX-debug-apk (app-debug.apk).
4. Установите APK на телефон (разрешите установку из неизвестных источников).

Файлы:
  ../.github/workflows/android-apk.yml — сценарий сборки
  ../build.js — сборка веб-версии (dist)
  android-app/ — Android-проект (Capacitor 8), www создаётся автоматически при сборке
