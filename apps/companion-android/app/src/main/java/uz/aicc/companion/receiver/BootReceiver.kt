package uz.aicc.companion.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import uz.aicc.companion.data.Settings
import uz.aicc.companion.service.CompanionService

/** Telefon qayta yoqilganda yoki ilova yangilanganda xizmatni tiklaydi. */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val relevant = intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == Intent.ACTION_MY_PACKAGE_REPLACED
        if (!relevant) return

        if (Settings(context).isEnrolled) CompanionService.start(context)
    }
}
