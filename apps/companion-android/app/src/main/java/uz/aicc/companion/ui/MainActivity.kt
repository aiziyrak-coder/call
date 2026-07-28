package uz.aicc.companion.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings as AndroidSettings
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import uz.aicc.companion.data.ApiClient
import uz.aicc.companion.data.EnrollRequest
import uz.aicc.companion.data.Settings
import uz.aicc.companion.databinding.ActivityMainBinding
import uz.aicc.companion.service.CompanionService

/** Sozlash ekrani: server manzili, ro'yxatdan o'tish va ruxsatlar. */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var settings: Settings

    private val requestPermissions =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
            val denied = granted.filterValues { !it }.keys
            if (denied.isNotEmpty()) {
                toast("Ruxsat berilmadi: ${denied.joinToString()}")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        settings = Settings(this)
        binding.serverUrl.setText(settings.baseUrl)
        binding.deviceName.setText(settings.deviceName)
        binding.tenantSlug.setText(settings.tenantSlug)
        binding.operatorEmail.setText(settings.operatorEmail.orEmpty())

        binding.enrollButton.setOnClickListener { enroll() }
        binding.permissionsButton.setOnClickListener { askPermissions() }
        binding.batteryButton.setOnClickListener { askIgnoreBatteryOptimizations() }

        refreshStatus()
        if (settings.isEnrolled) CompanionService.start(this)
    }

    private fun enroll() {
        val baseUrl = binding.serverUrl.text.toString().trim()
        val name = binding.deviceName.text.toString().trim()
        val tenantSlug = binding.tenantSlug.text.toString().trim()
        val secret = binding.enrollmentSecret.text.toString().trim()
        val operator = binding.operatorEmail.text.toString().trim()

        if (baseUrl.isEmpty() || name.isEmpty() || secret.isEmpty() || tenantSlug.isEmpty()) {
            toast("Server, nom, tashkilot kodi va sir to'ldirilishi kerak")
            return
        }

        settings.baseUrl = baseUrl
        settings.deviceName = name
        settings.tenantSlug = tenantSlug
        settings.operatorEmail = operator.ifBlank { null }

        binding.enrollButton.isEnabled = false

        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching {
                    ApiClient(settings).enroll(
                        EnrollRequest(
                            enrollmentSecret = secret,
                            tenantSlug = tenantSlug,
                            hardwareId = hardwareId(),
                            name = name,
                            simSlots = 1,
                            appVersion = packageManager.getPackageInfo(packageName, 0).versionName,
                            operatorEmail = operator.ifBlank { null },
                        )
                    )
                }
            }

            binding.enrollButton.isEnabled = true

            result
                .onSuccess { response ->
                    settings.deviceToken = response.deviceToken
                    settings.deviceId = response.deviceId
                    toast("Ro'yxatdan o'tildi")
                    CompanionService.start(this@MainActivity)
                    refreshStatus()
                }
                .onFailure { toast("Xato: ${it.message}") }
        }
    }

    private fun askPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.RECEIVE_SMS,
            Manifest.permission.READ_SMS,
            Manifest.permission.READ_PHONE_STATE,
            Manifest.permission.CALL_PHONE,
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions += Manifest.permission.POST_NOTIFICATIONS
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            permissions += Manifest.permission.READ_PHONE_NUMBERS
        }
        requestPermissions.launch(permissions.toTypedArray())
    }

    /**
     * Xiaomi/Samsung qobiqlarida fon xizmati batareya optimallashtirish tomonidan
     * to'xtatiladi — foydalanuvchidan istisno so'raymiz (TZ 4.1).
     */
    private fun askIgnoreBatteryOptimizations() {
        val power = getSystemService(PowerManager::class.java)
        if (power.isIgnoringBatteryOptimizations(packageName)) {
            toast("Allaqachon istisno ro'yxatida")
            return
        }
        startActivity(
            Intent(
                AndroidSettings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:$packageName"),
            )
        )
    }

    private fun refreshStatus() {
        binding.status.text = if (settings.isEnrolled) {
            "Holat: ro'yxatdan o'tgan (${settings.deviceId?.take(8)}...)"
        } else {
            "Holat: ro'yxatdan o'tilmagan"
        }
    }

    @Suppress("HardwareIds")
    private fun hardwareId(): String =
        AndroidSettings.Secure.getString(contentResolver, AndroidSettings.Secure.ANDROID_ID)
            ?: Build.FINGERPRINT

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
}
