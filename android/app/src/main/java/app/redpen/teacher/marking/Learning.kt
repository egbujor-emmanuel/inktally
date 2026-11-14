package app.redpen.teacher.marking

import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.domain.wireType

// The cloud teaches the device. Kotlin port of web/src/marking/learning.ts.
// When the cloud check reads an answer differently from Gemini Nano, the pair ("looked like 7" -> "was 1") is saved on
// the assignment as a handwriting hint. Later on-device reads for that assignment get the hints in their prompt, so the
// small model learns these students' handwriting during marking.
// Cloud reads never get hints: the checker must stay independent of what it is checking.
// Guard rail: a one-character confusion ("A" was "D") could push a student who really wrote A towards D, so it is only
// used once the same confusion has been seen on at least two answers.

/** One handwriting lesson. [type] is the question type as stored in Firestore ("objective", "numeric", "short"). */
data class ReadingHint(val type: String, val device: String, val cloud: String, /** Answers that showed this confusion. */ val n: Int = 1)

/** Most recent hints kept per assignment (also enforced by the Firestore rules). */
const val HINT_LIMIT = 12
/** Hints shown to the model per question type, newest first. */
private const val HINTS_PER_PROMPT = 6
private const val MAX_HINT_CHARS = 40
private val LEARNABLE = setOf("objective", "numeric", "short")
/** Sightings needed before a one-character confusion is trusted. */
const val SINGLE_CHAR_MIN_SEEN = 2
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

private fun hintKey(h: ReadingHint) = "${h.type}|${h.device.lowercase()}|${h.cloud.lowercase()}"

/** Adds new hints: a confusion seen again is counted (and moved to newest), others appended; keeps the newest [HINT_LIMIT]. */
fun mergeHints(existing: List<ReadingHint>, fresh: List<ReadingHint>): List<ReadingHint> {
    var merged = existing
    for (h in fresh) {
        val old = merged.firstOrNull { hintKey(it) == hintKey(h) }
        merged = merged.filter { hintKey(it) != hintKey(h) } + h.copy(n = (old?.n ?: 0) + h.n)
    }
    return merged.takeLast(HINT_LIMIT)
}

/** How many of the fresh hints are confusions this assignment had not seen before. */
fun countNewHints(existing: List<ReadingHint>, fresh: List<ReadingHint>): Int {
    val known = existing.map(::hintKey).toSet()
    return fresh.map(::hintKey).filter { it !in known }.toSet().size
}

/** Whether a hint is trusted enough to go into an on-device prompt. */
fun usableHint(h: ReadingHint): Boolean = !(h.device.length == 1 && h.cloud.length == 1) || h.n >= SINGLE_CHAR_MIN_SEEN

/** The sentence added to an on-device read prompt for this question type ("" when nothing usable was learned). */
fun learnedHint(hints: List<ReadingHint>?, type: String): String {
    val relevant = (hints ?: emptyList()).filter { it.type == type && usableHint(it) }.takeLast(HINTS_PER_PROMPT).reversed()
    if (relevant.isEmpty()) return ""
    val pairs = relevant.joinToString("; ") { "what looked like \"${it.device}\" was really \"${it.cloud}\"" }
    return " In these students' handwriting, earlier readings were corrected: $pairs. Use this only to recognise how these students form their characters; still copy exactly what is written."
}
