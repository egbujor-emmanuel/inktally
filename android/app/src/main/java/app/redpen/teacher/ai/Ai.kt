package app.redpen.teacher.ai

import android.graphics.Bitmap
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelOption
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.RequestOptions
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.firestore
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONObject
import java.time.LocalDate

/** Same Remote Config keys + defaults as web/src/ai/config.ts. */
val REMOTE_DEFAULTS: Map<String, Any> = mapOf(
    "cloud_read_model" to "gemini-3.5-flash-lite",
    "cloud_author_model" to "gemini-3.5-flash-lite",
    "read_mode" to "prefer_on_device",
    "android_ondevice_model" to "preview",
    "prompt_read_crop" to "Transcribe exactly what is handwritten in this image, character by character. {hint} " +
        "Do NOT calculate, solve or correct anything; if the writing is wrong, copy it wrong. If nothing is written, return an empty string.",
    "prompt_point_check" to "A pupil wrote this answer (spelling may be poor; judge meaning): \"{answer}\"\n" +
        "Does the answer clearly state this specific marking point: \"{point}\"? Answer only for that exact point. " +
        "Do not give credit for a statement listed as not acceptable: {reject}.",
)

private fun cfg(key: String) = Firebase.remoteConfig.getString(key).ifBlank { REMOTE_DEFAULTS[key].toString() }
private fun fill(template: String, values: Map<String, String>) = Regex("\\{(\\w+)}").replace(template) { values[it.groupValues[1]] ?: it.value }

/** Live session counters shown in the status bar (Firebase console cannot see on-device inference). */
object Telemetry {
    private val _counts = MutableStateFlow(mapOf(ReadSource.ON_DEVICE to 0, ReadSource.IN_CLOUD to 0))
    val counts: StateFlow<Map<ReadSource, Int>> = _counts

    fun record(kind: String, source: ReadSource, ms: Long) {
        _counts.update { it + (source to (it[source] ?: 0) + 1) }
        val uid = Firebase.auth.currentUser?.uid ?: return
        Firebase.firestore.collection("users").document(uid).collection("telemetry").document(LocalDate.now().toString())
            .set(mapOf("${source.wire}_$kind" to FieldValue.increment(1), "${source.wire}_ms" to FieldValue.increment(ms),
                "updatedAt" to FieldValue.serverTimestamp()), SetOptions.merge())
    }
}

@OptIn(PublicPreviewAPI::class)
object Ai {
    private const val TIMEOUT_MS = 120_000L
    private const val MAX_ATTEMPTS = 4
    private val TRANSIENT = Regex("high demand|overloaded|unavailable|deadline|timeout|\\b50[0-4]\\b|network|BUSY", RegexOption.IGNORE_CASE)

    private fun mode(force: InferenceMode?): InferenceMode = force ?: when (cfg("read_mode")) {
        "prefer_in_cloud" -> InferenceMode.PREFER_IN_CLOUD
        "only_in_cloud" -> InferenceMode.ONLY_IN_CLOUD
        "only_on_device" -> InferenceMode.ONLY_ON_DEVICE
        else -> InferenceMode.PREFER_ON_DEVICE
    }

    private fun deviceModel() = when (cfg("android_ondevice_model")) {
        "stable" -> OnDeviceModelOption.STABLE
        "preview_fast" -> OnDeviceModelOption.PREVIEW_FAST
        else -> OnDeviceModelOption.PREVIEW // Gemini Nano 4 Full on supported devices
    }

    private fun model(schema: Schema, force: InferenceMode?) = Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
        modelName = cfg("cloud_read_model"),
        generationConfig = generationConfig { responseMimeType = "application/json"; responseSchema = schema; temperature = 0f },
        requestOptions = RequestOptions(timeoutInMillis = TIMEOUT_MS),
        onDeviceConfig = OnDeviceConfig(mode = mode(force), temperature = 0f, modelOption = deviceModel()),
    )

    private suspend fun <T> retry(block: suspend () -> T): T {
        var last: Throwable? = null
        repeat(MAX_ATTEMPTS) { attempt ->
            try { return block() } catch (e: Throwable) {
                last = e
                if (!TRANSIENT.containsMatchIn("${e::class.simpleName} ${e.message}")) throw e
                delay(2_000L shl attempt) // exponential backoff; AICore BUSY is also transient
            }
        }
        throw last ?: IllegalStateException("Model call failed")
    }

    /** On-device models may ignore the schema and answer in plain text; accept both. */
    private fun field(raw: String, key: String): String = runCatching {
        JSONObject(raw.removePrefix("```json").removePrefix("```").removeSuffix("```").trim()).get(key).toString()
    }.getOrDefault(raw.trim())

    private val HINTS = mapOf(
        Question.Objective::class to "It is a multiple-choice answer: a single letter A, B, C, D or E.",
        Question.Numeric::class to "It is the answer part of a sum, for example \"= 42\" or \"₦27,000\".",
        Question.Short::class to "It is a one-word or short-phrase answer in English.",
        Question.Points::class to "It is a pupil's short written answer in English (one or more sentences).",
    )

    data class Read(val text: String, val source: ReadSource)

    /** Transcribes ONE cropped answer box; the question is never shown, so the model cannot auto-correct. */
    suspend fun readAnswer(crop: Bitmap, question: Question, force: InferenceMode? = null): Read {
        val prompt = fill(cfg("prompt_read_crop"), mapOf("hint" to (HINTS[question::class] ?: "")))
        val started = System.currentTimeMillis()
        val response = retry { model(Schema.obj(mapOf("text" to Schema.string())), force).generateContent(content { image(crop); text(prompt) }) }
        val source = if (response.inferenceSource == InferenceSource.ON_DEVICE) ReadSource.ON_DEVICE else ReadSource.IN_CLOUD
        Telemetry.record(if (force == InferenceMode.ONLY_IN_CLOUD) "verify" else "read", source, System.currentTimeMillis() - started)
        return Read(field(response.text ?: "", "text"), source)
    }

    /** One small yes/no question per marking point (fits the on-device token limits). */
    suspend fun checkPoints(answer: String, points: List<String>, reject: List<String>, force: InferenceMode? = null): Pair<List<String>, List<String>> {
        if (answer.isBlank()) return emptyList<String>() to emptyList()
        suspend fun ask(point: String, rejectList: String): Boolean {
            val started = System.currentTimeMillis()
            val prompt = fill(cfg("prompt_point_check"), mapOf("answer" to answer, "point" to point, "reject" to rejectList))
            val r = retry { model(Schema.obj(mapOf("present" to Schema.boolean())), force).generateContent(prompt) }
            Telemetry.record("points", if (r.inferenceSource == InferenceSource.ON_DEVICE) ReadSource.ON_DEVICE else ReadSource.IN_CLOUD, System.currentTimeMillis() - started)
            return field(r.text ?: "", "present").trim().lowercase().startsWith("t") || (r.text ?: "").contains("\"present\": true")
        }
        val rejectList = if (reject.isEmpty()) "none" else reject.joinToString { "\"$it\"" }
        val found = points.filter { ask(it, rejectList) }
        val rejected = if (found.isEmpty()) reject.filter { ask(it, "none") } else emptyList()
        return found to rejected
    }
}
