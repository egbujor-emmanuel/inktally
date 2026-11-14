package app.redpen.teacher.marking

import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.domain.wireType

// The cloud teaches REDPEN where the device goes wrong. Kotlin port of web/src/marking/learning.ts.
// When the cloud check reads an answer differently from Gemini Nano, the pair ("the device read A" -> "it was D") is
// saved on the assignment. From then on, an offline on-device reading that matches a known misread is HELD for the
// teacher ("Check this") instead of counting as a normal mark.
// Why holding, not hinting: on real Gemini Nano, adding the corrections to the read prompt made no measurable difference
// on unseen students, and a letter hint could turn a student who truly wrote A into D (see
// bench/evidence/learning-heldout-2026-11-14/). Holding matching readings caught every one of the device's misreads
// there, and REDPEN never changes what the device read, so it cannot push an answer towards the key.

/** One known misread. [type] is the question type as stored in Firestore ("objective", "numeric", "short"). */
data class ReadingHint(val type: String, val device: String, val cloud: String, /** Answers that showed this misread. */ val n: Int = 1)

/** Most recent misreads kept per assignment (also enforced by the Firestore rules). */
const val HINT_LIMIT = 12
private const val MAX_HINT_CHARS = 40
private val LEARNABLE = setOf("objective", "numeric", "short")
private val PROMPT_BREAKERS = Regex("""[<>"]""")
private val SPACES = Regex("""\s+""")

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

/** Adds new misreads: one seen again is counted (and moved to newest), others appended; keeps the newest [HINT_LIMIT]. */
fun mergeHints(existing: List<ReadingHint>, fresh: List<ReadingHint>): List<ReadingHint> {
    var merged = existing
    for (h in fresh) {
        val old = merged.firstOrNull { hintKey(it) == hintKey(h) }
        merged = merged.filter { hintKey(it) != hintKey(h) } + h.copy(n = (old?.n ?: 0) + h.n)
    }
    return merged.takeLast(HINT_LIMIT)
}

/** How many of the fresh misreads this assignment had not seen before. */
fun countNewHints(existing: List<ReadingHint>, fresh: List<ReadingHint>): Int {
    val known = existing.map(::hintKey).toSet()
    return fresh.map(::hintKey).filter { it !in known }.toSet().size
}

/** The known misread that an on-device reading matches, if any (same question type, case and spacing aside). */
fun knownMisread(hints: List<ReadingHint>?, type: String, read: String): ReadingHint? {
    if (cleanHint(read).isEmpty()) return null
    return (hints ?: emptyList()).lastOrNull { it.type == type && same(it.device, read) }
}

/** Marks a held reading (same text as web). Detected by [isHeld]; reconcile() still compares both readings. */
const val HELD_PREFIX = "Held for checking:"

/**
 * An on-device mark whose reading matches a known misread becomes "Check this", with the reason (also added when the
 * engine already flagged it, because it tells the teacher what was probably written). The reading is never changed.
 */
fun holdIfKnownMisread(mark: Mark, hints: List<ReadingHint>?, type: String): Mark {
    if (mark.readSource != ReadSource.ON_DEVICE || (mark.status != MarkStatus.PROVISIONAL && mark.status != MarkStatus.FLAGGED) || isHeld(mark)) return mark
    val h = knownMisread(hints, type, mark.read) ?: return mark
    val times = if (h.n > 1) " (${h.n} times)" else ""
    return mark.copy(status = MarkStatus.FLAGGED, reasons = mark.reasons +
        "$HELD_PREFIX on this assignment Gemini Nano has read “${h.cloud}” as “${h.device}” before$times, so check this one.")
}

fun isHeld(mark: Mark) = mark.reasons.any { it.startsWith(HELD_PREFIX) }
