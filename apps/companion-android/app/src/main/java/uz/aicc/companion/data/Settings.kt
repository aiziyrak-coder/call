package uz.aicc.companion.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit

/** Qurilma tokeni va server manzili — ilova qayta ishga tushganda ham saqlanadi. */
class Settings(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("aicc-companion", Context.MODE_PRIVATE)

    var baseUrl: String
        get() = prefs.getString(KEY_BASE_URL, DEFAULT_BASE_URL) ?: DEFAULT_BASE_URL
        set(value) = prefs.edit { putString(KEY_BASE_URL, value.trim()) }

    var tenantSlug: String
        get() = prefs.getString(KEY_TENANT_SLUG, DEFAULT_TENANT_SLUG) ?: DEFAULT_TENANT_SLUG
        set(value) = prefs.edit { putString(KEY_TENANT_SLUG, value.trim()) }

    var deviceToken: String?
        get() = prefs.getString(KEY_TOKEN, null)
        set(value) = prefs.edit { putString(KEY_TOKEN, value) }

    var deviceId: String?
        get() = prefs.getString(KEY_DEVICE_ID, null)
        set(value) = prefs.edit { putString(KEY_DEVICE_ID, value) }

    var deviceName: String
        get() = prefs.getString(KEY_NAME, android.os.Build.MODEL) ?: android.os.Build.MODEL
        set(value) = prefs.edit { putString(KEY_NAME, value) }

    var operatorEmail: String?
        get() = prefs.getString(KEY_OPERATOR, null)
        set(value) = prefs.edit { putString(KEY_OPERATOR, value) }

    /**
     * Oxirgi qayta ishlangan SMS ning vaqti. `ContentObserver` bir xil xabarni
     * ikki marta yubormasligi uchun kerak.
     */
    var lastInboxTimestamp: Long
        get() = prefs.getLong(KEY_LAST_INBOX, 0L)
        set(value) = prefs.edit { putLong(KEY_LAST_INBOX, value) }

    val isEnrolled: Boolean get() = !deviceToken.isNullOrBlank()

    fun clear() = prefs.edit { clear() }

    private companion object {
        const val KEY_BASE_URL = "baseUrl"
        const val KEY_TENANT_SLUG = "tenantSlug"
        const val KEY_TOKEN = "deviceToken"
        const val KEY_DEVICE_ID = "deviceId"
        const val KEY_NAME = "deviceName"
        const val KEY_OPERATOR = "operatorEmail"
        const val KEY_LAST_INBOX = "lastInboxTs"

        // Prod default — emulyator emas, haqiqiy telefon uchun.
        const val DEFAULT_BASE_URL = "https://call.devflix.uz"
        const val DEFAULT_TENANT_SLUG = "demo"
    }
}
