# AiCC Companion (Android)

Operator ish o'rnidagi Android telefon uchun yordamchi ilova. Audio yo'li
GSM-shlyuz orqali o'tgani sababli (rejadagi asosiy texnik qaror), bu ilova
**suhbat audiosini olmaydi**. Uning vazifalari:

- SMS yuborish (`SmsManager`) va qabul qilish (`BroadcastReceiver` + inbox `ContentObserver`);
- qurilma holatini serverga uzatish: batareya, signal, tarmoq, ilova versiyasi (MDM);
- click-to-call zaxira kanali — server buyrug'i bo'yicha raqamni terish;
- telefon qayta yoqilganda xizmatni avtomatik tiklash.

## Ishlash prinsipi

Telefon NAT ortida bo'lgani uchun aloqani **doim qurilma boshlaydi**:

```
CompanionService (foreground, 30 s)
  -> POST /api/v1/devices/heartbeat   telemetriya + kutilayotgan buyruqlar
  -> GET  /api/v1/devices/outbox      jo'natilishi kerak bo'lgan SMS lar
  -> POST /api/v1/devices/sms/status  yuborish natijasi
  -> POST /api/v1/devices/sms/inbound qabul qilingan SMS
```

Server 90 soniya davomida heartbeat kelmasa, qurilmani oflayn deb belgilaydi
va SMS ni keyingi provayderga (GSM-shlyuz yoki Eskiz.uz) o'tkazadi.

## Yig'ish

```bash
cd apps/companion-android
./gradlew :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Sozlash

1. Ilovani oching, server manzilini kiriting (emulyatorda `http://10.0.2.2:4000`).
2. `.env` dagi `DEVICE_ENROLLMENT_SECRET` qiymatini "Ro'yxatdan o'tish siri" maydoniga kiriting.
3. "Ruxsatlarni so'rash" va "Batareya cheklovini olib tashlash" tugmalarini bosing —
   Xiaomi/Samsung qobiqlarida bularsiz fon xizmati to'xtatiladi.
4. "Ro'yxatdan o'tish" bosilgach qurilma admin paneldagi ro'yxatda paydo bo'ladi.
