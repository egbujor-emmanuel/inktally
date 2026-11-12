package app.redpen.teacher.ai

import android.graphics.Bitmap
import app.redpen.teacher.domain.MarkingScheme
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import com.google.firebase.Firebase
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.InferenceSource
import com.google.firebase.ai.OnDeviceConfig
import com.google.firebase.ai.OnDeviceModelOption
import com.google.firebase.ai.ai
import com.google.firebase.ai.type.Content
import com.google.firebase.ai.type.GenerativeBackend
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.ai.type.RequestOptions
import com.google.firebase.ai.type.Schema
import com.google.firebase.ai.type.ThinkingLevel
import com.google.firebase.ai.type.content
import com.google.firebase.ai.type.generationConfig
import com.google.firebase.ai.type.thinkingConfig
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.firestore
import com.google.firebase.remoteconfig.remoteConfig
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/** Same Remote Config keys + defaults as web/src/ai/config.ts (the published template overrides these). */
val REMOTE_DEFAULTS: Map<String, Any> = mapOf(
    "cloud_read_model" to "gemini-3.5-flash-lite",
    "cloud_author_model" to "gemini-3.5-flash-lite",
    "read_mode" to "prefer_on_device",
    "read_thinking" to "MINIMAL",
    "author_thinking" to "LOW",
    "android_ondevice_model" to "preview",
    "prompt_read_crop" to "Transcribe exactly what is handwritten in this image, character by character. {hint} " +
        "Do NOT calculate, solve or correct anything; if the writing is wrong, copy it wrong. If nothing is written, return an empty string.",
    "prompt_point_check" to "A student wrote this answer (spelling may be poor; judge meaning): \"{answer}\"\n" +
        "Does the answer clearly state this specific marking point: \"{point}\"? Answer only for that exact point. " +
        "Do not give credit for a statement listed as not acceptable: {reject}.",
    "prompt_scheme_draft" to "You are an experienced examiner writing a marking scheme for {level} {subject}. Follow the conventions of the curriculum the paper comes from. " +
        "From the question paper provided, list every question with: its number, the question text, the maximum marks, " +
        "the type (objective = A-E option, numeric = a number, short = a word or phrase, points = a theory answer marked point by point), " +
        "and the answer key (correct option letters, accepted numbers, accepted words, or marking points with common acceptable wordings). " +
        "Add answers that must not be accepted when students commonly confuse them.",
    "prompt_remediation" to "Students in a {level} {subject} class made these mistakes on question {q} (\"{prompt}\"): {mistakes}. " +
        "Write a short catch-up activity for them: one plain-English explanation of the misunderstanding (max 60 words) " +
        "and 4 practice questions of increasing difficulty with answers.",
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

data class CatchUpSheet(val explanation: String, val practice: List<Pair<String, String>>)

@OptIn(PublicPreviewAPI::class)
object Ai {
    private const val TIMEOUT_MS = 120_000L
    private const val AUTHOR_TIMEOUT_MS = 90_000L
    private const val MAX_ATTEMPTS = 4
    private const val MAX_MISTAKES_SENT = 25
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

    /** Thinking level from Remote Config (benchmarked: MINIMAL reads as accurately as the default, ~3x faster). */
    private fun thinking(key: String) = when (cfg(key).trim().uppercase()) {
        "MINIMAL" -> thinkingConfig { thinkingLevel = ThinkingLevel.MINIMAL }
        "LOW" -> thinkingConfig { thinkingLevel = ThinkingLevel.LOW }
        "MEDIUM" -> thinkingConfig { thinkingLevel = ThinkingLevel.MEDIUM }
        "HIGH" -> thinkingConfig { thinkingLevel = ThinkingLevel.HIGH }
        else -> null
    }

    private fun model(schema: Schema, force: InferenceMode?) = Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
        modelName = cfg("cloud_read_model"),
        generationConfig = generationConfig {
            responseMimeType = "application/json"; responseSchema = schema; temperature = 0f; thinkingConfig = thinking("read_thinking")
        },
        requestOptions = RequestOptions(timeoutInMillis = TIMEOUT_MS),
        onDeviceConfig = OnDeviceConfig(mode = mode(force), temperature = 0f, modelOption = deviceModel()),
    )

    /** Long-form authoring (answer keys, catch-up sheets): cloud only. */
    private fun authorModel(schema: Schema) = Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
        modelName = cfg("cloud_author_model"),
        generationConfig = generationConfig {
            responseMimeType = "application/json"; responseSchema = schema; temperature = 0.2f; thinkingConfig = thinking("author_thinking")
        },
        requestOptions = RequestOptions(timeoutInMillis = AUTHOR_TIMEOUT_MS),
    )

    private suspend fun <T> retry(attempts: Int = MAX_ATTEMPTS, block: suspend () -> T): T {
        var last: Throwable? = null
        repeat(attempts) { attempt ->
            try { return block() } catch (e: Throwable) {
                last = e
                if (!TRANSIENT.containsMatchIn("${e::class.simpleName} ${e.message}")) throw e
                if (attempt < attempts - 1) delay(2_000L shl attempt) // exponential backoff; AICore BUSY is also transient
            }
        }
        throw last ?: IllegalStateException("Model call failed")
    }

    private fun stripFence(raw: String) = raw.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()

    /** On-device models may ignore the schema and answer in plain text; accept both. */
    private fun field(raw: String, key: String): String = runCatching { JSONObject(stripFence(raw)).get(key).toString() }.getOrDefault(raw.trim())

    private fun sourceOf(s: InferenceSource?) = if (s == InferenceSource.ON_DEVICE) ReadSource.ON_DEVICE else ReadSource.IN_CLOUD

    private val HINTS = mapOf(
        Question.Objective::class to "It is a multiple-choice answer: a single letter A, B, C, D or E.",
        Question.Numeric::class to "It is the answer part of a sum, for example \"= 42\" or \"₦27,000\".",
        Question.Short::class to "It is a one-word or short-phrase answer in English.",
        Question.Points::class to "It is a student's short written answer in English (one or more sentences).",
    )

    data class Read(val text: String, val source: ReadSource)

    /** Transcribes ONE cropped answer box; the question is never shown, so the model cannot auto-correct. */
    suspend fun readAnswer(crop: Bitmap, question: Question, force: InferenceMode? = null): Read {
        val prompt = fill(cfg("prompt_read_crop"), mapOf("hint" to (HINTS[question::class] ?: "")))
        val started = System.currentTimeMillis()
        val response = retry { model(Schema.obj(mapOf("text" to Schema.string())), force).generateContent(content { image(crop); text(prompt) }) }
        val source = sourceOf(response.inferenceSource)
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
            Telemetry.record("points", sourceOf(r.inferenceSource), System.currentTimeMillis() - started)
            return field(r.text ?: "", "present").trim().lowercase().startsWith("t") || (r.text ?: "").contains("\"present\": true")
        }
        val rejectList = if (reject.isEmpty()) "none" else reject.joinToString { "\"$it\"" }
        val found = points.filter { ask(it, rejectList) }
        val rejected = if (found.isEmpty()) reject.filter { ask(it, "none") } else emptyList()
        return found to rejected
    }

    // ---- exercise-book mode: whole-page read ----

    data class PageRead(val answers: Map<Int, String>, val source: ReadSource)

    private const val PAGE_PROMPT = "This is a photo of a student's handwritten exercise-book page. For each numbered answer, transcribe exactly what the student " +
        "wrote after the question number, character by character. Keep every mistake — do NOT calculate, solve or correct anything. " +
        "Ignore the student's name, the date and any teacher marks. Only include these question numbers: {numbers}."

    /** PREFER_IN_CLOUD: the cloud reads whole pages reliably (14/14 in our benchmark); offline it falls back to Nano. */
    suspend fun readPage(photo: Bitmap, numbers: List<Int>, force: InferenceMode? = InferenceMode.PREFER_IN_CLOUD): PageRead {
        val schema = Schema.obj(mapOf("answers" to Schema.array(Schema.obj(mapOf("q" to Schema.integer(), "text" to Schema.string())))))
        val started = System.currentTimeMillis()
        val prompt = PAGE_PROMPT.replace("{numbers}", numbers.joinToString(", "))
        val r = retry { model(schema, force).generateContent(content { image(photo); text(prompt) }) }
        val source = sourceOf(r.inferenceSource)
        Telemetry.record(if (force == InferenceMode.ONLY_IN_CLOUD) "verify" else "read", source, System.currentTimeMillis() - started)
        val arr = runCatching { JSONObject(stripFence(r.text ?: "")).getJSONArray("answers") }
            .getOrElse { throw IllegalStateException("Could not read the page. Try a sharper photo in good light.") }
        val answers = (0 until arr.length()).associate { i -> arr.getJSONObject(i).let { it.getInt("q") to it.optString("text").trim() } }
        return PageRead(answers, source)
    }

    // ---- authoring ----

    private const val STUDENT_PAGE_NOTE = "IMPORTANT: this photo shows a student's exercise page — the questions AND the student's own handwritten answers. " +
        "Work out the correct answers yourself from the QUESTIONS only. The student's answers may be wrong: never copy them into the marking scheme."

    private val DRAFT_SCHEMA = Schema.obj(mapOf("questions" to Schema.array(Schema.obj(
        mapOf(
            "q" to Schema.integer(), "prompt" to Schema.string(), "max" to Schema.integer(),
            "type" to Schema.enumeration(listOf("objective", "numeric", "short", "points")),
            "correctOptions" to Schema.array(Schema.string()), "acceptNumbers" to Schema.array(Schema.double()),
            "acceptText" to Schema.array(Schema.string()), "points" to Schema.array(Schema.string()), "reject" to Schema.array(Schema.string()),
        ),
        optionalProperties = listOf("correctOptions", "acceptNumbers", "acceptText", "points", "reject"),
    ))))

    private fun JSONObject.strings(key: String): List<String> = optJSONArray(key)?.let { a -> (0 until a.length()).map { a.optString(it).trim() }.filter { it.isNotEmpty() } } ?: emptyList()

    /** Converts the flat model output into a typed question, dropping unusable ones (mirrors web toQuestion). */
    internal fun toQuestion(o: JSONObject): Question? {
        val q = o.optInt("q", 0).takeIf { it > 0 } ?: return null
        val prompt = o.optString("prompt")
        val max = o.optInt("max", 1).coerceIn(1, 20)
        return when (o.optString("type")) {
            "objective" -> o.strings("correctOptions").map { it.uppercase() }.takeIf { it.isNotEmpty() }?.let { Question.Objective(q, prompt, max, it) }
            "numeric" -> o.optJSONArray("acceptNumbers")?.let { a -> (0 until a.length()).mapNotNull { a.optDouble(it).takeIf { d -> !d.isNaN() } } }
                ?.takeIf { it.isNotEmpty() }?.let { Question.Numeric(q, prompt, max, it) }
            "short" -> o.strings("acceptText").takeIf { it.isNotEmpty() }?.let { Question.Short(q, prompt, max, it, o.strings("reject")) }
            "points" -> o.strings("points").takeIf { it.isNotEmpty() }?.let { Question.Points(q, prompt, max, it, o.strings("reject")) }
            else -> null
        }
    }

    /** Drafts a marking scheme from the question paper. Only the QUESTIONS go to the cloud; the teacher reviews the draft. */
    suspend fun draftScheme(images: List<Bitmap>, typed: String?, subject: String, level: String, isStudentPage: Boolean = false, pdf: ByteArray? = null): MarkingScheme {
        require(images.isNotEmpty() || !typed.isNullOrBlank() || pdf != null) { "Add the question paper (photo, PDF or typed questions) first." }
        val request: Content = content {
            text(fill(cfg("prompt_scheme_draft"), mapOf("subject" to subject, "level" to level)))
            if (isStudentPage) text(STUDENT_PAGE_NOTE)
            if (!typed.isNullOrBlank()) text("QUESTION PAPER:\n$typed")
            images.forEach { image(it) }
            pdf?.let { inlineData(it, "application/pdf") }
        }
        val started = System.currentTimeMillis()
        val r = retry(2) { authorModel(DRAFT_SCHEMA).generateContent(request) }
        Telemetry.record("author", ReadSource.IN_CLOUD, System.currentTimeMillis() - started)
        val arr: JSONArray = runCatching { JSONObject(stripFence(r.text ?: "")).getJSONArray("questions") }
            .getOrElse { throw IllegalStateException("The drafted marking scheme was incomplete. Try a clearer photo or type the questions.") }
        val questions = (0 until arr.length()).mapNotNull { toQuestion(arr.getJSONObject(it)) }.sortedBy { it.q }
        if (questions.isEmpty()) throw IllegalStateException("No questions could be found. Make sure the questions are visible, or type them.")
        return MarkingScheme(subject, level, questions)
    }

    /** Turns the class's actual mistakes on one question into a short catch-up activity. No names, no images. */
    suspend fun makeCatchUp(question: Question, mistakes: List<String>, subject: String, level: String): CatchUpSheet {
        val unique = mistakes.map { it.trim() }.filter { it.isNotEmpty() }.distinct().take(MAX_MISTAKES_SENT)
        require(unique.isNotEmpty()) { "No mistakes to work from yet." }
        val schema = Schema.obj(mapOf("explanation" to Schema.string(),
            "practice" to Schema.array(Schema.obj(mapOf("question" to Schema.string(), "answer" to Schema.string())))))
        val prompt = fill(cfg("prompt_remediation"), mapOf("level" to level, "subject" to subject, "q" to question.q.toString(),
            "prompt" to question.prompt, "mistakes" to unique.joinToString { "\"$it\"" }))
        val started = System.currentTimeMillis()
        val r = retry(2) { authorModel(schema).generateContent(prompt) }
        Telemetry.record("author", ReadSource.IN_CLOUD, System.currentTimeMillis() - started)
        val o = runCatching { JSONObject(stripFence(r.text ?: "")) }.getOrElse { throw IllegalStateException("The catch-up sheet came back incomplete. Please try again.") }
        val practice = o.optJSONArray("practice")?.let { a -> (0 until a.length()).map { a.getJSONObject(it).let { p -> p.optString("question") to p.optString("answer") } } } ?: emptyList()
        if (o.optString("explanation").isBlank() || practice.isEmpty()) throw IllegalStateException("The catch-up sheet came back incomplete. Please try again.")
        return CatchUpSheet(o.optString("explanation"), practice)
    }
}
