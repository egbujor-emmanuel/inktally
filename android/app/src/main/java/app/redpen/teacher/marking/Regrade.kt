package app.redpen.teacher.marking

import app.redpen.teacher.data.Submission
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Question

// "Accept for everyone": when the teacher adds an answer to the scheme, every student already marked with that
// answer is re-scored from their stored reading. No new AI call is needed, because code does the marking.
// Kotlin port of web/src/marking/regrade.ts.

data class Regraded(val submissionId: String, val marks: List<Mark>, val gained: Int)

/** Re-marks one stored mark against the updated question. Teacher-set marks are never touched; scores never go down. */
fun regradeMark(question: Question, mark: Mark): Mark {
    if (mark.q != question.q || mark.status == MarkStatus.REVIEWED || mark.engine == MarkEngine.TEACHER) return mark
    val next = when (question) {
        is Question.Short -> markShort(question, mark.read, mark.readSource)
        is Question.Numeric -> markNumeric(question, mark.read, mark.readSource)
        else -> null
    }
    if (next == null || next.awarded <= mark.awarded) return mark
    return next.copy(reasons = next.reasons + "Re-marked after the teacher accepted this answer for everyone.")
}

/** Every submission whose score for this question goes up under the updated question. */
fun regradeAll(question: Question, submissions: List<Submission>): List<Regraded> = submissions.mapNotNull { s ->
    var gained = 0
    val next = s.marks.map { m -> regradeMark(question, m).also { gained += it.awarded - m.awarded } }
    if (gained > 0) Regraded(s.id, next, gained) else null
}
