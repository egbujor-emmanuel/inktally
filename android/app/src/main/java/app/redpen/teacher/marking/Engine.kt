package app.redpen.teacher.marking

import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import kotlin.math.abs
import kotlin.math.min

// Kotlin port of web/src/marking/engine.ts. Models only READ; code decides every score.

private const val DEFAULT_TOLERANCE = 1e-9
private const val SHORT_MATCH = 0.8
private const val SHORT_UNSURE = 0.5
private const val MIN_FRAGMENT = 4

private fun settled(source: ReadSource) = if (source == ReadSource.ON_DEVICE) MarkStatus.PROVISIONAL else MarkStatus.VERIFIED

private fun result(
    q: Question, read: String, source: ReadSource, awarded: Int, status: MarkStatus, reasons: List<String>,
    engine: MarkEngine = MarkEngine.CODE, pointsFound: List<String> = emptyList(),
) = Mark(q.q, read, source, awarded, q.max, engine, status, reasons, pointsFound, label = q.label)

private fun fmt(v: Double) = if (v == v.toLong().toDouble()) v.toLong().toString() else v.toString()

fun markNumeric(q: Question.Numeric, read: String, source: ReadSource): Mark {
    val parsed = parseNumericAnswer(read)
    val value = parsed.value ?: return result(q, read, source, 0, MarkStatus.FLAGGED, listOf("Could not read a number in the answer box — please check."))
    val tolerance = q.tolerance ?: DEFAULT_TOLERANCE
    fun matches(v: Double) = q.accept.any { abs(it - v) <= tolerance }
    val correct = matches(value)
    if (parsed.signAfterEquals && !correct && matches(abs(value))) {
        return result(q, read, source, 0, MarkStatus.FLAGGED, listOf("Read \"$read\": is that a minus sign or part of \"=\"? Correct if it is ${fmt(abs(value))}."))
    }
    val awarded = if (correct) q.max else 0
    val reasons = listOf(if (correct) "Answer ${fmt(value)} matches the marking scheme." else "Answer ${fmt(value)}; expected ${q.accept.joinToString(" or ") { fmt(it) }}.")
    if (!parsed.clean) return result(q, read, source, awarded, MarkStatus.FLAGGED, reasons + "Some handwriting looked like letters; please confirm the number.")
    return result(q, read, source, awarded, settled(source), reasons)
}

fun markObjective(q: Question.Objective, read: String, source: ReadSource): Mark {
    val letter = normalizeOptionLetter(read)
        ?: return result(q, read, source, 0, MarkStatus.FLAGGED, listOf("No single option letter could be read — please check."))
    val correct = q.correct.map { it.uppercase() }.contains(letter)
    return result(q, read, source, if (correct) q.max else 0, settled(source),
        listOf(if (correct) "Chose $letter — correct." else "Chose $letter; correct is ${q.correct.joinToString("/")}."))
}

private fun isTruncationOf(read: String, accepted: String): Boolean {
    val r = read.lowercase().replace(Regex("[^a-z]"), "")
    return r.length >= MIN_FRAGMENT && accepted.lowercase().replace(Regex("[^a-z]"), "").startsWith(r)
}

fun markShort(q: Question.Short, read: String, source: ReadSource): Mark {
    if (read.isBlank()) return result(q, read, source, 0, settled(source), listOf("No answer written."))
    if (q.reject.any { textSimilarity(read, it) >= SHORT_MATCH }) {
        return result(q, read, source, 0, settled(source), listOf("\"$read\" is listed as not acceptable."))
    }
    val threshold = if (q.spellingTolerant) SHORT_MATCH else 1.0
    // Working before the answer ("4x − 2x = 16, x = 8"): the final answer is what follows the last "=" (same as web).
    val tail = if (read.contains('=')) read.substring(read.lastIndexOf('=') + 1).trim() else read
    val best = q.accept.maxOfOrNull { a -> maxOf(textSimilarity(read, a), if (tail != read) textSimilarity(tail, a) else 0.0) } ?: 0.0
    // "not", "never" or "no" that the accepted answers don't have can flip the meaning: the teacher decides (same as web).
    val neg = Regex("""\b(not|never|no)\b""", RegexOption.IGNORE_CASE)
    val negated = neg.containsMatchIn(read) && q.accept.none { neg.containsMatchIn(it) }
    if (negated && best >= SHORT_UNSURE) return result(q, read, source, 0, MarkStatus.FLAGGED, listOf("\"$read\" says \"not\" / \"no\" — check it means the accepted answer."))
    if (best >= threshold) return result(q, read, source, q.max, settled(source), listOf("\"$read\" matches an accepted answer."))
    // A definition with filler words: every word of a 3-word-or-longer accepted answer appears, in order (same as web).
    fun words(t: String) = t.lowercase().replace(Regex("[^a-z0-9 ]+"), " ").split(Regex("\\s+")).filter { it.isNotEmpty() }
    fun inOrder(hay: List<String>, needle: List<String>): Boolean { var i = 0; for (w in hay) if (i < needle.size && w == needle[i]) i++; return i == needle.size }
    if (!negated) q.accept.firstOrNull { a -> words(a).size >= 3 && inOrder(words(read), words(a)) }?.let { a ->
        return result(q, read, source, q.max, settled(source), listOf("\"$read\" contains the accepted answer \"$a\"."))
    }
    // The same number written another way ("4 3/8" for "4⅜", "8" for "x = 8").
    val value = parseNumericAnswer(read).value
    if (value != null && q.accept.any { a -> parseNumericAnswer(a).value?.let { kotlin.math.abs(it - value) < 1e-9 } == true }) {
        return result(q, read, source, q.max, settled(source), listOf("\"$read\" is the same number as an accepted answer."))
    }
    val truncated = q.accept.firstOrNull { isTruncationOf(read, it) }
    if (best >= SHORT_UNSURE || truncated != null) {
        return result(q, read, source, 0, MarkStatus.FLAGGED, listOf("\"$read\" is close to \"${truncated ?: q.accept.first()}\" — accept it?"))
    }
    return result(q, read, source, 0, settled(source), listOf("\"$read\" does not match: expected ${q.accept.joinToString(" / ")}."))
}

fun markPoints(q: Question.Points, read: String, source: ReadSource, claimedPoints: List<String>, claimedRejects: List<String> = emptyList()): Mark {
    val found = q.points.filter { it in claimedPoints }
    val rejected = q.reject.filter { it in claimedRejects }
    val awarded = min(found.size, q.max)
    fun r(awarded: Int, status: MarkStatus, reasons: List<String>) = result(q, read, source, awarded, status, reasons, MarkEngine.AI_POINTS, found)
    if (read.isBlank()) return r(0, settled(source), listOf("No answer written."))
    if (found.isEmpty() && rejected.isNotEmpty()) return r(0, settled(source), listOf("This answer is not accepted: ${rejected.joinToString("; ")}."))
    if (found.isEmpty()) return r(0, MarkStatus.FLAGGED, listOf("No marking point found in a written answer — the handwriting may have been misread."))
    val missing = q.points.size > found.size && awarded < q.max
    return r(awarded, settled(source), listOf("Found: ${found.joinToString("; ")}.") + if (missing) listOf("${q.max - awarded} more point(s) needed for full marks.") else emptyList())
}
