package uz.aicc.companion.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

@Serializable
data class EnrollRequest(
    val enrollmentSecret: String,
    val tenantSlug: String,
    val hardwareId: String,
    val name: String,
    val phoneNumbers: List<String> = emptyList(),
    val simSlots: Int = 1,
    val appVersion: String? = null,
    val operatorEmail: String? = null,
)

@Serializable
data class EnrollResponse(val deviceId: String, val deviceToken: String)

@Serializable
data class HeartbeatRequest(
    val batteryLevel: Int? = null,
    val signalStrength: Int? = null,
    val networkType: String? = null,
    val appVersion: String? = null,
    val phoneNumbers: List<String>? = null,
)

@Serializable
data class DeviceCommand(
    val type: String,
    val number: String? = null,
    val simSlot: Int? = null,
)

@Serializable
data class HeartbeatResponse(
    val ok: Boolean = true,
    val intervalSec: Int = 30,
    val commands: List<DeviceCommand> = emptyList(),
)

@Serializable
data class OutboxMessage(
    val id: String,
    val to: String,
    val text: String,
    val simSlot: Int = 0,
)

@Serializable
data class OutboxResponse(val messages: List<OutboxMessage> = emptyList())

@Serializable
data class SmsStatusReport(
    val smsId: String,
    val status: String,
    val providerMessageId: String? = null,
    val error: String? = null,
)

@Serializable
data class InboundSmsRequest(
    val from: String,
    val to: String,
    val text: String,
    val receivedAt: String? = null,
    val simSlot: Int? = null,
)

@Serializable
data class CallReportRequest(
    val state: String,
    val number: String? = null,
    val simSlot: Int? = null,
)

/**
 * Core API bilan aloqa. Ilova NAT ortida tursa ham ishlashi uchun barcha
 * aloqa qurilma tomonidan boshlanadi (pull modeli): heartbeat + outbox.
 */
class ApiClient(private val settings: Settings) {

    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }

    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Throws(IOException::class)
    fun enroll(request: EnrollRequest): EnrollResponse =
        post("/devices/enroll", json.encodeToString(EnrollRequest.serializer(), request), authorized = false)
            .let { json.decodeFromString(EnrollResponse.serializer(), it) }

    @Throws(IOException::class)
    fun heartbeat(request: HeartbeatRequest): HeartbeatResponse =
        post("/devices/heartbeat", json.encodeToString(HeartbeatRequest.serializer(), request))
            .let { json.decodeFromString(HeartbeatResponse.serializer(), it) }

    @Throws(IOException::class)
    fun outbox(): OutboxResponse =
        get("/devices/outbox").let { json.decodeFromString(OutboxResponse.serializer(), it) }

    @Throws(IOException::class)
    fun reportSmsStatus(report: SmsStatusReport) {
        post("/devices/sms/status", json.encodeToString(SmsStatusReport.serializer(), report))
    }

    @Throws(IOException::class)
    fun reportInboundSms(request: InboundSmsRequest) {
        post("/devices/sms/inbound", json.encodeToString(InboundSmsRequest.serializer(), request))
    }

    @Throws(IOException::class)
    fun reportCall(request: CallReportRequest) {
        post("/devices/calls/report", json.encodeToString(CallReportRequest.serializer(), request))
    }

    private fun get(path: String): String = execute(
        Request.Builder().url(url(path)).get().applyAuth().build()
    )

    private fun post(path: String, body: String, authorized: Boolean = true): String = execute(
        Request.Builder()
            .url(url(path))
            .post(body.toRequestBody(JSON_MEDIA))
            .apply { if (authorized) applyAuth() }
            .build()
    )

    private fun Request.Builder.applyAuth(): Request.Builder = apply {
        settings.deviceToken?.let { header("X-Device-Token", it) }
    }

    private fun url(path: String) = "${settings.baseUrl.trimEnd('/')}/api/v1$path"

    private fun execute(request: Request): String {
        http.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw IOException("HTTP ${response.code}: ${body.take(300)}")
            }
            return body
        }
    }

    private companion object {
        val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()
    }
}
