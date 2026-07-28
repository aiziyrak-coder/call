package uz.aicc.companion.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Telephony
import android.telephony.SmsManager
import android.telephony.TelephonyManager
import androidx.core.app.NotificationCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uz.aicc.companion.R
import uz.aicc.companion.data.ApiClient
import uz.aicc.companion.data.CallReportRequest
import uz.aicc.companion.data.HeartbeatRequest
import uz.aicc.companion.data.InboundSmsRequest
import uz.aicc.companion.data.OutboxMessage
import uz.aicc.companion.data.Settings
import uz.aicc.companion.data.SmsStatusReport
import uz.aicc.companion.receiver.SmsSentReceiver
import uz.aicc.companion.ui.MainActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Doimiy fon xizmati. TZ 4.1: telefon 8+ soat uzluksiz ishlashi kerak, shuning
 * uchun foreground notification bilan ishlaydi va batareya optimallashtirishdan
 * chiqarish so'raladi.
 */
class CompanionService : LifecycleService() {

    private lateinit var settings: Settings
    private lateinit var api: ApiClient
    private var loop: Job? = null
    private var inboxObserver: ContentObserver? = null

    override fun onCreate() {
        super.onCreate()
        settings = Settings(this)
        api = ApiClient(settings)

        startForeground(NOTIFICATION_ID, buildNotification("Serverga ulanmoqda..."))
        registerInboxObserver()
        registerCallStateReceiver()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)

        if (loop?.isActive != true) {
            loop = lifecycleScope.launch(Dispatchers.IO) { syncLoop() }
        }

        // Tizim xizmatni o'ldirsa, avtomatik qayta ishga tushirilsin.
        return START_STICKY
    }

    override fun onDestroy() {
        inboxObserver?.let { contentResolver.unregisterContentObserver(it) }
        runCatching { unregisterReceiver(callStateReceiver) }
        loop?.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent): IBinder? {
        super.onBind(intent)
        return null
    }

    /** Heartbeat + outbox: buyruqlar va yuboriladigan SMS lar shu yerda olinadi. */
    private suspend fun syncLoop() {
        var intervalMs = DEFAULT_INTERVAL_MS
        var failures = 0

        while (lifecycleScope.isActive) {
            if (!settings.isEnrolled) {
                updateNotification("Ro'yxatdan o'tilmagan")
                delay(DEFAULT_INTERVAL_MS)
                continue
            }

            try {
                val response = api.heartbeat(
                    HeartbeatRequest(
                        batteryLevel = batteryLevel(),
                        signalStrength = signalStrength(),
                        networkType = networkType(),
                        appVersion = appVersion(),
                        phoneNumbers = phoneNumbers(),
                    )
                )
                intervalMs = response.intervalSec * 1000L
                failures = 0
                updateNotification("Ulangan · batareya ${batteryLevel()}%")

                response.commands.forEach { command ->
                    when (command.type) {
                        "call" -> command.number?.let { placeCall(it) }
                        "restart" -> restartSelf()
                    }
                }

                api.outbox().messages.forEach { sendSms(it) }
            } catch (error: Exception) {
                failures += 1
                updateNotification("Server bilan aloqa yo'q (${failures})")
                // Eksponensial kutish, lekin 5 daqiqadan oshmaydi.
                intervalMs = minOf(DEFAULT_INTERVAL_MS * (1L shl minOf(failures, 4)), MAX_INTERVAL_MS)
            }

            delay(intervalMs)
        }
    }

    private fun sendSms(message: OutboxMessage) {
        val manager = smsManager(message.simSlot)
        val parts = manager.divideMessage(message.text)

        val sentIntent = PendingIntent.getBroadcast(
            this,
            message.id.hashCode(),
            Intent(this, SmsSentReceiver::class.java).putExtra(SmsSentReceiver.EXTRA_SMS_ID, message.id),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        try {
            if (parts.size == 1) {
                manager.sendTextMessage(message.to, null, message.text, sentIntent, null)
            } else {
                // Uzun xabar bo'laklarga bo'linadi; natija oxirgi bo'lakdan olinadi.
                val sentIntents = ArrayList<PendingIntent>(parts.size).apply {
                    repeat(parts.size - 1) { add(sentIntent) }
                    add(sentIntent)
                }
                manager.sendMultipartTextMessage(message.to, null, parts, sentIntents, null)
            }
        } catch (error: Exception) {
            runCatching {
                api.reportSmsStatus(
                    SmsStatusReport(smsId = message.id, status = "FAILED", error = error.message)
                )
            }
        }
    }

    private fun placeCall(number: String) {
        val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$number"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { startActivity(intent) }
    }

    private fun restartSelf() {
        val intent = Intent(this, CompanionService::class.java)
        stopSelf()
        Handler(Looper.getMainLooper()).postDelayed({ startForegroundService(intent) }, 2_000)
    }

    /**
     * Kiruvchi SMS ni `SmsReceiver` ham ushlaydi, lekin ba'zi qobiqlarda
     * broadcast kechikadi — shuning uchun inbox ham kuzatiladi.
     */
    private fun registerInboxObserver() {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean, uri: Uri?) {
                lifecycleScope.launch(Dispatchers.IO) { drainInbox() }
            }
        }
        contentResolver.registerContentObserver(Telephony.Sms.CONTENT_URI, true, observer)
        inboxObserver = observer
    }

    private suspend fun drainInbox() = withContext(Dispatchers.IO) {
        if (!settings.isEnrolled) return@withContext

        val since = settings.lastInboxTimestamp
        val cursor = contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
            "${Telephony.Sms.DATE} > ?",
            arrayOf(since.toString()),
            "${Telephony.Sms.DATE} ASC",
        ) ?: return@withContext

        cursor.use {
            val addressIndex = it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val bodyIndex = it.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val dateIndex = it.getColumnIndexOrThrow(Telephony.Sms.DATE)

            while (it.moveToNext()) {
                val timestamp = it.getLong(dateIndex)
                val request = InboundSmsRequest(
                    from = it.getString(addressIndex) ?: continue,
                    to = phoneNumbers().firstOrNull() ?: "unknown",
                    text = it.getString(bodyIndex) ?: "",
                    receivedAt = isoTimestamp(timestamp),
                )
                runCatching { api.reportInboundSms(request) }
                    .onSuccess { settings.lastInboxTimestamp = timestamp }
            }
        }
    }

    private val callStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val state = intent?.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
            val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
            val mapped = when (state) {
                TelephonyManager.EXTRA_STATE_RINGING -> "RINGING"
                TelephonyManager.EXTRA_STATE_OFFHOOK -> "OFFHOOK"
                else -> "IDLE"
            }
            lifecycleScope.launch(Dispatchers.IO) {
                runCatching { api.reportCall(CallReportRequest(state = mapped, number = number)) }
            }
        }
    }

    private fun registerCallStateReceiver() {
        val filter = IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(callStateReceiver, filter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(callStateReceiver, filter)
        }
    }

    // ------------------------------------------------------------ telemetriya

    private fun batteryLevel(): Int =
        getSystemService(BatteryManager::class.java)
            ?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1

    @Suppress("DEPRECATION")
    private fun signalStrength(): Int? = runCatching {
        val telephony = getSystemService(TelephonyManager::class.java)
        telephony?.signalStrength?.cellSignalStrengths?.firstOrNull()?.dbm
    }.getOrNull()

    private fun networkType(): String = runCatching {
        getSystemService(TelephonyManager::class.java)?.networkOperatorName ?: "unknown"
    }.getOrDefault("unknown")

    @Suppress("MissingPermission")
    private fun phoneNumbers(): List<String> = runCatching {
        val telephony = getSystemService(TelephonyManager::class.java) ?: return emptyList()
        listOfNotNull(telephony.line1Number?.takeIf { it.isNotBlank() })
    }.getOrDefault(emptyList())

    private fun appVersion(): String =
        packageManager.getPackageInfo(packageName, 0).versionName ?: "0"

    private fun smsManager(simSlot: Int): SmsManager =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(SmsManager::class.java).createForSubscriptionId(simSlot)
        } else {
            @Suppress("DEPRECATION")
            SmsManager.getDefault()
        }

    private fun isoTimestamp(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date(millis))

    // ----------------------------------------------------------- bildirishnoma

    private fun buildNotification(text: String): Notification {
        val manager = getSystemService(NotificationManager::class.java)
        if (manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "AiCC Companion", NotificationManager.IMPORTANCE_LOW)
                    .apply { description = "Fon rejimidagi SMS va monitoring xizmati" }
            )
        }

        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("AiCC Companion")
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_stat_companion)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(text))
    }

    companion object {
        private const val CHANNEL_ID = "aicc-companion"
        private const val NOTIFICATION_ID = 1001
        private const val DEFAULT_INTERVAL_MS = 30_000L
        private const val MAX_INTERVAL_MS = 300_000L

        fun start(context: Context) {
            context.startForegroundService(Intent(context, CompanionService::class.java))
        }
    }
}
