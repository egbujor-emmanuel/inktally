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
                if (found.isEmpty()) base else base.copy(awarded = minOf(found.size, question.max - 1), pointsFound = found,
                    reasons = base.reasons + "Method marks for: ${found.joinToString("; ")}.")
            }
        }
        is Question.Points -> {
            val (found, rejected) = Ai.checkPoints(read, question.points, question.reject, force)
            markPoints(question, read, source, found, rejected)
        }
    }

    /** Cloud re-check of a provisional/flagged mark. Agreement verifies; disagreement goes to the teacher. */
    suspend fun verify(question: Question, crop: Bitmap, previous: Mark): Mark {
        if (previous.status == MarkStatus.REVIEWED) return previous
        val cloud = mark(question, crop, InferenceMode.ONLY_IN_CLOUD)
        val same = cloud.awarded == previous.awarded
        return when {
            same && cloud.status != MarkStatus.FLAGGED -> cloud.copy(reasons = cloud.reasons + "Confirmed by the cloud check.")
            previous.readSource == ReadSource.ON_DEVICE && !same -> cloud.copy(status = MarkStatus.FLAGGED, reasons = listOf(
                "Device read \"${previous.read}\" (${previous.awarded}/${previous.max}); cloud read \"${cloud.read}\" (${cloud.awarded}/${cloud.max}). Which is right?"))
            else -> cloud
        }
    }
}
