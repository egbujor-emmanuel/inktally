package app.redpen.teacher.marking

import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.domain.needsCheck

// Bookkeeping for the cloud check (pure, unit-tested). Port of the pure parts of web/src/marking/cloudCheck.ts
// and reconcile() from web/src/marking/markAnswer.ts. The runner that talks to the cloud is CloudCheckRun.

data class CheckSummary(
    /** Answers sent to the cloud. */
    val checked: Int = 0,
    /** On-device marks the cloud agreed with. */
    val confirmed: Int = 0,
    /** Answers that now need the teacher (disagreement or unreadable). */
    val needTeacher: Int = 0,
    /** New handwriting hints the device learned from this check. */
    val learned: Int = 0,
) {
    operator fun plus(o: CheckSummary) = CheckSummary(checked + o.checked, confirmed + o.confirmed, needTeacher + o.needTeacher, learned + o.learned)
}

const val CONFIRMED_ON_DEVICE = "On-device mark confirmed by the cloud check."
const val CONFIRMED_CLOUD = "Confirmed by the cloud check."
/** At or above this similarity two readings of a written answer are the same reading. */
private const val SAME_READING = 0.8
private val SQUASH = Regex("[\\s,.;:'\"`]")
private fun squash(text: String) = text.lowercase().replace(SQUASH, "")

/** True when two models read the same thing (case, spacing and punctuation aside; small slips allowed in longer text). */
fun sameReading(a: String, b: String): Boolean {
    val x = squash(a); val y = squash(b)
    if (x == y) return true
    return x.length > 1 && y.length > 1 && textSimilarity(a, b) >= SAME_READING
}

/**
 * Second opinion (same rules as web reconcile). A mark is "confirmed" only when there were two real readings that
 * agree on what is written AND on the score. An answer the device failed or was unsure about has no first reading, so
 * the cloud's read stands on its own ("Cloud read"); a real device reading with a different score goes to the teacher.
 */
fun reconcile(previous: Mark, cloud: Mark): Mark {
    if (previous.status == MarkStatus.REVIEWED) return previous
    val sameScore = cloud.awarded == previous.awarded
    // A reading held because it matched a known misread is still a real reading: the cloud check compares it as usual.
    val deviceRead = previous.readSource == ReadSource.ON_DEVICE && (previous.status == MarkStatus.PROVISIONAL || isHeld(previous))
    val realFirstRead = deviceRead || previous.status == MarkStatus.VERIFIED
    if (realFirstRead && sameScore && cloud.status != MarkStatus.FLAGGED && sameReading(previous.read, cloud.read)) {
        return cloud.copy(reasons = cloud.reasons + if (previous.readSource == ReadSource.ON_DEVICE) CONFIRMED_ON_DEVICE else CONFIRMED_CLOUD)
    }
    if (deviceRead) {
        if (!sameScore) return cloud.copy(status = MarkStatus.FLAGGED, reasons = listOf(
            "Device read \"${previous.read}\" (${previous.awarded}/${previous.max}); cloud read \"${cloud.read}\" (${cloud.awarded}/${cloud.max}). Which is right?"))
        if (!sameReading(previous.read, cloud.read)) return cloud.copy(reasons = cloud.reasons +
            "The device read \"${previous.read}\"; the cloud's reading is used (same mark).")
    }
    return cloud
}

/** Keeps any mark the teacher reviewed while the check was running. */
fun keepReviewed(now: List<Mark>, next: List<Mark>): List<Mark> =
    next.map { m -> now.firstOrNull { it.q == m.q }?.takeIf { it.status == MarkStatus.REVIEWED } ?: m }

/** Counts how a set of checked marks came out, for the "8 confirmed, 1 needs you" summary. */
fun summarise(before: List<Mark>, after: List<Mark>): CheckSummary {
    var checked = 0; var confirmed = 0; var needTeacher = 0
    for (b in before.filter { it.needsCheck() }) {
        val a = after.firstOrNull { it.q == b.q }
        if (a == null || a === b) continue
        checked += 1
        if (a.status == MarkStatus.FLAGGED) needTeacher += 1
        else if (b.readSource == ReadSource.ON_DEVICE && isCrossChecked(a)) confirmed += 1
    }
    return CheckSummary(checked, confirmed, needTeacher)
}

/** "Cloud check: 8 on-device marks confirmed" — the part before the optional "1 needs you" link (same wording as web). */
fun checkSummaryLead(s: CheckSummary) = "Cloud check: ${s.confirmed} on-device mark${if (s.confirmed == 1) "" else "s"} confirmed"
fun checkSummaryNeedYou(s: CheckSummary) = "${s.needTeacher} need${if (s.needTeacher == 1) "s" else ""} you"
fun checkSummaryLearned(s: CheckSummary) =
    if (s.learned > 0) " REDPEN learned ${s.learned} device misread${if (s.learned == 1) "" else "s"} to hold for checking." else ""

/** The full status line as plain text (the app renders the "needs you" part as a link to the Review tab). */
fun checkSummaryText(s: CheckSummary) =
    checkSummaryLead(s) + (if (s.needTeacher > 0) ", ${checkSummaryNeedYou(s)}" else "") + "." + checkSummaryLearned(s)

/** The notice after "Accept for everyone" (same wording as web ReviewTab). */
fun acceptNotice(read: String, othersRaised: Int) = if (othersRaised > 0)
    "Accepted “${read.take(30)}”. $othersRaised other student${if (othersRaised == 1) "" else "s"}’ marks went up too."
else "Accepted “${read.take(30)}”. Every student who writes it from now on gets the mark."
