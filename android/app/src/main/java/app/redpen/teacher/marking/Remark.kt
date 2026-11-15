package app.redpen.teacher.marking

import app.redpen.teacher.data.Submission
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Question

// Editing the answer key after marking (Kotlin port of web/src/marking/remark.ts). Every student already marked is
// re-marked from their STORED reading, so no new AI call is needed for numbers, letters and words. A theory answer
// whose marking points changed is flagged for the teacher instead of being re-judged silently. Teacher marks stay.

const val REMARK_REASON = "Re-marked after the answer key was edited."
const val POINTS_CHANGED_REASON = "The marking points for this question changed — check this answer again."

data class RemarkSummary(val students: Int = 0, val up: Int = 0, val down: Int = 0, val toCheck: Int = 0)
data class RemarkResult(val updates: List<Pair<String, List<Mark>>>, val summary: RemarkSummary)

/** One stored mark under the edited question (or unchanged when the question did not change). */
fun remarkOne(before: Question?, after: Question?, mark: Mark): Mark {
    if (after == null || mark.status == MarkStatus.REVIEWED || mark.engine == MarkEngine.TEACHER || before == after) return mark
    if (after is Question.Points) {
        return mark.copy(max = after.max, awarded = minOf(mark.awarded, after.max), status = MarkStatus.FLAGGED, reasons = mark.reasons + POINTS_CHANGED_REASON)
    }
    val next = when (after) {
        is Question.Objective -> markObjective(after, mark.read, mark.readSource)
        is Question.Numeric -> markNumeric(after, mark.read, mark.readSource)
        is Question.Short -> markShort(after, mark.read, mark.readSource)
        is Question.Points -> return mark
    }
    // A reading that was waiting for the cloud check keeps waiting; one that was already final stays final.
    val status = when {
        next.status == MarkStatus.FLAGGED -> MarkStatus.FLAGGED
        mark.status == MarkStatus.PROVISIONAL -> MarkStatus.PROVISIONAL
        else -> next.status
    }
    return next.copy(status = status, reasons = next.reasons + REMARK_REASON)
}

/** Re-marks every student for the edited key and counts what changed. */
fun remarkAll(before: List<Question>, after: List<Question>, submissions: List<Submission>): RemarkResult {
    var students = 0; var up = 0; var down = 0; var toCheck = 0
    val updates = mutableListOf<Pair<String, List<Mark>>>()
    for (s in submissions) {
        var changed = false
        val marks = s.marks.map { m ->
            val next = remarkOne(before.firstOrNull { it.q == m.q }, after.firstOrNull { it.q == m.q }, m)
            if (next !== m) {
                changed = true
                if (next.awarded > m.awarded) up++
                if (next.awarded < m.awarded) down++
                if (next.status == MarkStatus.FLAGGED && m.status != MarkStatus.FLAGGED) toCheck++
            }
            next
        }
        if (changed) { updates += s.id to marks; students++ }
    }
    return RemarkResult(updates, RemarkSummary(students, up, down, toCheck))
}

/** The notice after saving (same wording as web). */
fun remarkNotice(s: RemarkSummary): String {
    if (s.students == 0) return "Answer key saved. No marks changed."
    val parts = mutableListOf("${s.up} answer${if (s.up == 1) "" else "s"} went up", "${s.down} went down")
    if (s.toCheck > 0) parts += "${s.toCheck} to check"
    return "Answer key saved. Re-marked ${s.students} student${if (s.students == 1) "" else "s"}: ${parts.joinToString(", ")}."
}
