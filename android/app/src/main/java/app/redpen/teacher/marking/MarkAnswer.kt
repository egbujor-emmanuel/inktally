package app.redpen.teacher.marking

import android.graphics.Bitmap
import app.redpen.teacher.ai.Ai
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.type.PublicPreviewAPI

/** AI reads (hybrid) -> code marks. Mirrors web/src/marking/markAnswer.ts. */
@OptIn(PublicPreviewAPI::class)
object Marker {
    private const val PAGE_ON_DEVICE_WARNING = "Read offline from the whole page — on-device page reading can auto-correct mistakes, so this waits for the cloud check."

    suspend fun mark(question: Question, crop: Bitmap, force: InferenceMode? = null): Mark {
        val read = Ai.readAnswer(crop, question, force)
        return markFromRead(question, read.text, read.source, force)
    }

    private suspend fun markFromRead(question: Question, read: String, source: ReadSource, force: InferenceMode?): Mark = when (question) {
        is Question.Objective -> markObjective(question, read, source)
        is Question.Short -> markShort(question, read, source)
        is Question.Numeric -> {
            val base = markNumeric(question, read, source)
            if (base.awarded > 0 || question.methodPoints.isEmpty() || base.status == MarkStatus.FLAGGED) base
            else {
                val (found, _) = Ai.checkPoints(read, question.methodPoints, emptyList(), force)
                if (found.isEmpty()) base else base.copy(awarded = minOf(found.size, question.max - 1), engine = app.redpen.teacher.domain.MarkEngine.AI_POINTS, pointsFound = found,
                    reasons = base.reasons + "Method marks for: ${found.joinToString("; ")}.")
            }
        }
        is Question.Points -> {
            val (found, rejected) = Ai.checkPoints(read, question.points, question.reject, force)
            markPoints(question, read, source, found, rejected)
        }
    }

    /** Cloud marking of a whole sheet in as few requests as possible (same as web markAnswersBatch). */
    suspend fun markBatch(questions: List<Question>, crops: List<Pair<Question, Bitmap>>, verify: Boolean = false): List<Mark> {
        val reads = Ai.readAnswersBatch(crops, verify)
        return crops.map { (q, _) ->
            val read = reads[q.q] ?: throw IllegalStateException("The cloud did not return answer ${q.q}")
            when (q) {
                is Question.Objective -> markObjective(q, read, ReadSource.IN_CLOUD)
                is Question.Short -> markShort(q, read, ReadSource.IN_CLOUD)
                is Question.Points -> Ai.checkPointsBatch(read, q.points, q.reject).let { (found, rejected) -> markPoints(q, read, ReadSource.IN_CLOUD, found, rejected) }
                is Question.Numeric -> {
                    val base = markNumeric(q, read, ReadSource.IN_CLOUD)
                    if (base.awarded > 0 || q.methodPoints.isEmpty() || base.status == MarkStatus.FLAGGED) base
                    else Ai.checkPointsBatch(read, q.methodPoints, emptyList()).first.let { found ->
                        if (found.isEmpty()) base else base.copy(awarded = minOf(found.size, q.max - 1), engine = app.redpen.teacher.domain.MarkEngine.AI_POINTS, pointsFound = found,
                            reasons = base.reasons + "Method marks for: ${found.joinToString("; ")}.")
                    }
                }
            }
        }
    }

    /** Exercise-book mode: one page read, then code marks each question. On-device page reads are never final. */
    suspend fun markPage(questions: List<Question>, photo: Bitmap, force: InferenceMode? = InferenceMode.PREFER_IN_CLOUD): List<Mark> {
        val page = Ai.readPage(photo, questions.map { it.q }, force)
        return questions.map { q ->
            val m = markFromRead(q, page.answers[q.q] ?: "", page.source, force)
            if (page.source == ReadSource.ON_DEVICE && m.status != MarkStatus.FLAGGED) m.copy(status = MarkStatus.PROVISIONAL, reasons = m.reasons + PAGE_ON_DEVICE_WARNING) else m
        }
    }

    /** Cloud re-check of a provisional/flagged mark. Agreement verifies; disagreement goes to the teacher. */
    suspend fun verify(question: Question, crop: Bitmap, previous: Mark): Mark {
        if (previous.status == MarkStatus.REVIEWED) return previous
        return reconcile(previous, mark(question, crop, InferenceMode.ONLY_IN_CLOUD))
    }

    /** Re-marks a whole exercise-book page in the cloud and reconciles each previous mark. */
    suspend fun verifyPage(questions: List<Question>, photo: Bitmap, previous: List<Mark>): List<Mark> {
        val cloud = markPage(questions, photo, InferenceMode.ONLY_IN_CLOUD)
        return previous.map { p -> cloud.firstOrNull { it.q == p.q }?.let { reconcile(p, it) } ?: p }
    }

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
}
