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

/** Cloud re-read of a provisional/flagged mark. Agreement verifies; disagreement goes to the teacher with both readings. */
fun reconcile(previous: Mark, cloud: Mark): Mark {
    if (previous.status == MarkStatus.REVIEWED) return previous
    val same = cloud.awarded == previous.awarded
    return when {
        same && cloud.status != MarkStatus.FLAGGED -> cloud.copy(reasons = cloud.reasons +
            if (previous.readSource == ReadSource.ON_DEVICE) "On-device mark confirmed by the cloud check." else "Confirmed by the cloud check.")
        previous.readSource == ReadSource.ON_DEVICE && !same -> cloud.copy(status = MarkStatus.FLAGGED, reasons = listOf(
            "Device read \"${previous.read}\" (${previous.awarded}/${previous.max}); cloud read \"${cloud.read}\" (${cloud.awarded}/${cloud.max}). Which is right?"))
        else -> cloud
    }
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
        else if (b.readSource == ReadSource.ON_DEVICE && a.status == MarkStatus.VERIFIED) confirmed += 1
    }
    return CheckSummary(checked, confirmed, needTeacher)
}

/** "Cloud check: 8 on-device marks confirmed" — the part before the optional "1 needs you" link (same wording as web). */
fun checkSummaryLead(s: CheckSummary) = "Cloud check: ${s.confirmed} on-device mark${if (s.confirmed == 1) "" else "s"} confirmed"
fun checkSummaryNeedYou(s: CheckSummary) = "${s.needTeacher} need${if (s.needTeacher == 1) "s" else ""} you"
fun checkSummaryLearned(s: CheckSummary) =
    if (s.learned > 0) " The device learned ${s.learned} thing${if (s.learned == 1) "" else "s"} about this class’s handwriting." else ""

/** The full status line as plain text (the app renders the "needs you" part as a link to the Review tab). */
fun checkSummaryText(s: CheckSummary) =
    checkSummaryLead(s) + (if (s.needTeacher > 0) ", ${checkSummaryNeedYou(s)}" else "") + "." + checkSummaryLearned(s)

/** The notice after "Accept for everyone" (same wording as web ReviewTab). */
fun acceptNotice(read: String, othersRaised: Int) = if (othersRaised > 0)
    "Accepted “${read.take(30)}”. $othersRaised other student${if (othersRaised == 1) "" else "s"}’ marks went up too."
else "Accepted “${read.take(30)}”. Every student who writes it from now on gets the mark."
