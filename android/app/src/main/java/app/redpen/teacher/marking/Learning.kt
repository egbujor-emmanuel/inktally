package app.redpen.teacher.marking

import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.domain.wireType

// The cloud teaches the device. Kotlin port of web/src/marking/learning.ts.
// When the cloud check reads an answer differently from Gemini Nano, the pair ("looked like 7" -> "was 1") is saved on
// the assignment as a handwriting hint. Later on-device reads for that class get the hints in their prompt, so the
// small model learns this class's handwriting during the session.
// Cloud reads never get hints: the checker must stay independent of what it is checking.

/** One handwriting lesson. [type] is the question type as stored in Firestore ("objective", "numeric", "short"). */
data class ReadingHint(val type: String, val device: String, val cloud: String)

/** Most recent hints kept per assignment (also enforced by the Firestore rules). */
const val HINT_LIMIT = 12
/** Hints shown to the model per question type, newest first. */
private const val HINTS_PER_PROMPT = 6
private const val MAX_HINT_CHARS = 40
private val LEARNABLE = setOf("objective", "numeric", "short")
private val PROMPT_BREAKERS = Regex("[<>\"]")
private val SPACES = Regex("[$WS]+")

internal fun cleanHint(text: String): String = text.replace(PROMPT_BREAKERS, " ").replace(SPACES, " ").trim().take(MAX_HINT_CHARS)
private fun same(a: String, b: String) = cleanHint(a).lowercase() == cleanHint(b).lowercase()

/** Device/cloud reading disagreements from one cloud check. Long theory answers are not learnable this way. */
fun learnFromCheck(questions: List<Question>, before: List<Mark>, after: List<Mark>): List<ReadingHint> {
    val hints = mutableListOf<ReadingHint>()
    for (b in before) {
        if (b.readSource != ReadSource.ON_DEVICE) continue
        val a = after.firstOrNull { it.q == b.q }
        val type = questions.firstOrNull { it.q == b.q }?.wireType
        if (a == null || a.readSource != ReadSource.IN_CLOUD || type == null || type !in LEARNABLE) continue
        if (cleanHint(b.read).isEmpty() || cleanHint(a.read).isEmpty() || same(b.read, a.read)) continue
        hints += ReadingHint(type, cleanHint(b.read), cleanHint(a.read))
    }
    return hints
}

/** Adds new hints (deduplicated), keeping the newest [HINT_LIMIT]. */
fun mergeHints(existing: List<ReadingHint>, fresh: List<ReadingHint>): List<ReadingHint> {
    fun key(h: ReadingHint) = "${h.type}|${h.device.lowercase()}|${h.cloud.lowercase()}"
    val seen = fresh.map(::key).toSet()
    return (existing.filter { key(it) !in seen } + fresh).takeLast(HINT_LIMIT)
}

/** The sentence added to an on-device read prompt for this question type ("" when nothing was learned). */
fun learnedHint(hints: List<ReadingHint>?, type: String): String {
    val relevant = (hints ?: emptyList()).filter { it.type == type }.takeLast(HINTS_PER_PROMPT).reversed()
    if (relevant.isEmpty()) return ""
    val pairs = relevant.joinToString("; ") { "what looked like \"${it.device}\" was really \"${it.cloud}\"" }
    return " In this class's handwriting, earlier readings were corrected: $pairs. Use this only to recognise how these students form their characters; still copy exactly what is written."
}
