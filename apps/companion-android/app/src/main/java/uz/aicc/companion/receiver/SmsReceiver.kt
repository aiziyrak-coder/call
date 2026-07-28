package uz.aicc.companion.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import uz.aicc.companion.data.ApiClient
import uz.aicc.companion.data.InboundSmsRequest
import uz.aicc.companion.data.Settings
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Kiruvchi SMS ni darhol CRM ga uzatadi (TZ 5.6). */
class SmsReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val settings = Settings(context)
        if (!settings.isEnrolled) return

        // Bir xabar bir nechta PDU ga bo'linishi mumkin — matnni birlashtiramiz.
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent) ?: return
        val sender = messages.firstOrNull()?.originatingAddress ?: return
        val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }
        val timestamp = messages.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()

        val pending = goAsync()
        val api = ApiClient(settings)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                api.reportInboundSms(
                    InboundSmsRequest(
                        from = sender,
                        to = "device",
                        text = body,
                        receivedAt = iso(timestamp),
                    )
                )
                settings.lastInboxTimestamp = maxOf(settings.lastInboxTimestamp, timestamp)
            } catch (_: Exception) {
                // Muvaffaqiyatsiz bo'lsa, xizmatdagi ContentObserver keyinroq qayta yuboradi.
            } finally {
                pending.finish()
            }
        }
    }

    private fun iso(millis: Long): String =
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }
            .format(Date(millis))
}
