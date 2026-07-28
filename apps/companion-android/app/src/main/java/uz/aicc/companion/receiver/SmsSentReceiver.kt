package uz.aicc.companion.receiver

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import uz.aicc.companion.data.ApiClient
import uz.aicc.companion.data.Settings
import uz.aicc.companion.data.SmsStatusReport

/** `SmsManager` yuborish natijasini shu yerda qaytaradi. */
class SmsSentReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val smsId = intent.getStringExtra(EXTRA_SMS_ID) ?: return
        val settings = Settings(context)
        if (!settings.isEnrolled) return

        val (status, error) = when (resultCode) {
            Activity.RESULT_OK -> "SENT" to null
            SmsManager.RESULT_ERROR_NO_SERVICE -> "FAILED" to "Tarmoq yo'q"
            SmsManager.RESULT_ERROR_RADIO_OFF -> "FAILED" to "Radio o'chirilgan"
            SmsManager.RESULT_ERROR_NULL_PDU -> "FAILED" to "PDU bo'sh"
            else -> "FAILED" to "Umumiy xato (kod $resultCode)"
        }

        val pending = goAsync()
        val api = ApiClient(settings)

        CoroutineScope(Dispatchers.IO).launch {
            try {
                api.reportSmsStatus(SmsStatusReport(smsId = smsId, status = status, error = error))
            } catch (_: Exception) {
                // Status keyingi heartbeat'da qayta yuborilmaydi — server timeout bo'yicha FAILED qiladi.
            } finally {
                pending.finish()
            }
        }
    }

    companion object {
        const val EXTRA_SMS_ID = "smsId"
    }
}
