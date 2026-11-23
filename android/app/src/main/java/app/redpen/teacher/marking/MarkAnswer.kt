package app.redpen.teacher.marking

import android.graphics.Bitmap
import app.redpen.teacher.ai.Ai
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.domain.needsCheck
import com.google.firebase.ai.InferenceMode
import com.google.firebase.ai.type.PublicPreviewAPI

/** AI reads (hybrid) -> code marks. Mirrors web/src/marking/markAnswer.ts. */
@OptIn(PublicPreviewAPI::class)
object Marker {
    private const val PAGE_ON_DEVICE_WARNING = "Read offline from the whole page — on-device page reading can auto-correct mistakes, so this waits for the cloud check."

    /** [learned]: what the cloud check taught the device about this class's handwriting (never used on cloud checks). */
    suspend fun mark(question: Question, crop: Bitmap, force: InferenceMode? = null): Mark {
        val read = Ai.readAnswer(crop, question, force)
        return markFromRead(question, read.text, read.source, force)
    }

    /** One request for all of a question's points when read in the cloud; one small request per point on the device (same as web judgePoints). */
    private suspend fun judgePoints(read: String, points: List<String>, reject: List<String>, source: ReadSource, force: InferenceMode?): Pair<List<String>, List<String>> =
        if (source == ReadSource.IN_CLOUD && Ai.batchingEnabled()) Ai.checkPointsBatch(read, points, reject) else Ai.checkPoints(read, points, reject, force)

    private suspend fun markFromRead(question: Question, read: String, source: ReadSource, force: InferenceMode?): Mark = when (question) {
        is Question.Objective -> markObjective(question, read, source)
        is Question.Short -> markShort(question, read, source)
        is Question.Numeric -> withMethodMarks(question, markNumeric(question, read, source), read) { steps -> judgePoints(read, steps, emptyList(), source, force).first }
        is Question.Points -> {
            val (found, rejected) = judgePoints(read, question.points, question.reject, source, force)
            markPoints(question, read, source, found, rejected)
        }
    }

    /**
     * A wrong final answer earns method marks only when the working follows the key (same as web withMethodMarks):
     * correct arithmetic landing on the student's own wrong answer means a different formula, so the teacher checks it.
     */
    private suspend fun withMethodMarks(question: Question.Numeric, base: Mark, read: String, judge: suspend (List<String>) -> List<String>): Mark {
        val steps = workingSteps(question.methodPoints)
        if (base.awarded > 0 || steps.isEmpty() || base.status == MarkStatus.FLAGGED) return base
        workingContradictsKey(read, parseNumericAnswer(read).value, question.accept)?.let { c ->
            return base.copy(status = MarkStatus.FLAGGED, reasons = base.reasons + contradictionReason(c))
        }
        val found = judge(steps)
        return if (found.isEmpty()) base else base.copy(awarded = minOf(found.size, question.max - 1), engine = app.redpen.teacher.domain.MarkEngine.AI_POINTS, pointsFound = found,
            reasons = base.reasons + "Method marks for: ${found.joinToString("; ")}.")
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
                is Question.Numeric -> withMethodMarks(q, markNumeric(q, read, ReadSource.IN_CLOUD), read) { steps -> Ai.checkPointsBatch(read, steps, emptyList()).first }
            }
        }
    }

    /** Exercise-book mode: one page read, then code marks each question. On-device page reads are never final. */
    suspend fun markPage(questions: List<Question>, photo: Bitmap, force: InferenceMode? = InferenceMode.PREFER_IN_CLOUD): List<Mark> {
        val page = Ai.readPage(photo, questions, force)
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

    /** Re-marks a whole exercise-book page in the cloud and reconciles the marks that were waiting for it. */
    suspend fun verifyPage(questions: List<Question>, photo: Bitmap, previous: List<Mark>): List<Mark> {
        val cloud = markPage(questions, photo, InferenceMode.ONLY_IN_CLOUD)
        // Marks that are already final (a cloud read, or one the teacher set) are never changed by a re-read of the page.
        return previous.map { p -> if (!p.needsCheck()) p else cloud.firstOrNull { it.q == p.q }?.let { reconcile(p, it) } ?: p }
    }

    /** Re-checks several answers of one student in ONE cloud request and reconciles each (same as web verifyMarksBatch). */
    suspend fun verifyBatch(questions: List<Question>, crops: List<Pair<Question, Bitmap>>, previous: List<Mark>): List<Mark> {
        val cloud = markBatch(questions, crops, verify = true)
        return previous.map { p -> cloud.firstOrNull { it.q == p.q }?.let { reconcile(p, it) } ?: p }
    }
}
