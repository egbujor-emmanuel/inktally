package app.redpen.teacher.marking

import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkStatus

private val CROSS_CHECKED = Regex("confirmed by the cloud check", RegexOption.IGNORE_CASE)

/** Read twice (device + cloud, or cloud + cloud) and both readings agreed. */
fun isCrossChecked(mark: Mark) = mark.status == MarkStatus.VERIFIED && mark.reasons.any { CROSS_CHECKED.containsMatchIn(it) }

/**
 * What the status chip says (port of web/src/marking/statusLabel.ts). "Verified" is kept for marks that were read twice
 * and agreed (on-device read confirmed by the cloud, or a second cloud read). A single cloud reading is "Cloud read":
 * trusted, but not double-checked.
 */
fun statusLabel(mark: Mark): String = when (mark.status) {
    MarkStatus.PROVISIONAL -> "Provisional"
    MarkStatus.FLAGGED -> "Check this"
    MarkStatus.REVIEWED -> "Reviewed"
    MarkStatus.VERIFIED -> if (isCrossChecked(mark)) "Verified" else "Cloud read"
}
