@file:OptIn(com.google.firebase.ai.type.PublicPreviewAPI::class)

package app.redpen.teacher.marking

import android.content.Context
import android.graphics.Bitmap
import app.redpen.teacher.ai.Ai
import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Repo
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.domain.wireType
import app.redpen.teacher.scan.Render
import app.redpen.teacher.scan.Scanner
import app.redpen.teacher.scan.SheetLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * One student's photo -> marks + marked copy. Shared by the Mark tab (marking now) and the offline queue
 * (marking later: photos taken offline, or a whole stack chosen at once). Mirrors web/src/marking/markSubmission.ts.
 */
object MarkSubmission {
    const val SHEET = "sheet"
    const val PAGE = "page"

    sealed interface Outcome {
        data class Ok(val marks: List<Mark>, val copy: Bitmap?) : Outcome
        data class Failed(val reason: String) : Outcome
    }

    data class Progress(val marks: List<Mark>, val total: Int, val crops: Map<Int, Bitmap> = emptyMap())

    fun failedMark(q: Int, max: Int, e: Throwable) = Mark(q, "", ReadSource.ON_DEVICE, 0, max, MarkEngine.CODE, MarkStatus.FLAGGED,
        listOf("Could not read this answer (${Repo.friendly(e)}). Check it by hand or retry when online."))

    private suspend fun saveCopy(ctx: Context, sid: String, build: () -> Bitmap): Bitmap? =
        try { withContext(Dispatchers.Default) { build() } } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { null }
            ?.also { withContext(Dispatchers.IO) { Repo.saveCrop(ctx, sid, Repo.MARKED_KEY, it) } }

    /** failFast (offline queue): a read error throws instead of becoming a flagged mark, so the student stays queued. */
    suspend fun mark(ctx: Context, a: Assignment, mode: String, taken: Bitmap, pageIndex: Int, sid: String, label: String,
                     onProgress: (Progress) -> Unit = {}, failFast: Boolean = false): Outcome {
        if (mode == PAGE) {
            // A sideways photo is turned upright first, so it is read, saved and cloud-checked upright (same as web).
            val photo = withContext(Dispatchers.Default) { app.redpen.teacher.scan.Orient.upright(taken) }
            withContext(Dispatchers.IO) { Repo.saveCrop(ctx, sid, Repo.PAGE_KEY, photo) }
            onProgress(Progress(emptyList(), a.scheme.questions.size))
            val read = Marker.markPage(a.scheme.questions, photo)
            val marks = if (!Ai.deviceLearning()) read else read.map { m ->
                a.scheme.questions.firstOrNull { it.q == m.q }?.let { holdIfKnownMisread(m, a.readingHints, it.wireType) } ?: m
            }
            onProgress(Progress(marks, marks.size))
            Repo.saveMarks(a.id, sid, marks)
            return Outcome.Ok(marks, saveCopy(ctx, sid) { Render.pageCopy(ctx, photo, marks, label) })
        }
        val photo = taken
        val pages = SheetLayout.pages(a.scheme.questions)
        val boxes = pages.getOrNull(pageIndex) ?: return Outcome.Failed("This assignment has no sheet page ${pageIndex + 1}.")
        return when (val scan = withContext(Dispatchers.Default) { Scanner.scan(photo, boxes) }) {
            is Scanner.Result.Failed -> Outcome.Failed(scan.reason)
            is Scanner.Result.Ok -> {
                val collected = mutableListOf<Mark>()
                onProgress(Progress(emptyList(), scan.crops.size, scan.crops))
                withContext(Dispatchers.IO) { scan.crops.forEach { (q, crop) -> Repo.saveCrop(ctx, sid, q, crop) } }
                // Reading goes to the cloud anyway (no on-device model): one request for the whole sheet.
                if (Ai.batchingEnabled() && app.redpen.teacher.Connectivity.online.value && Ai.cloudWillRead(app.redpen.teacher.DeviceModel.state.value == app.redpen.teacher.DeviceModel.State.Ready)) {
                    val pairs = scan.crops.mapNotNull { (q, crop) -> a.scheme.questions.firstOrNull { it.q == q }?.let { it to crop } }
                    val batched = try { Marker.markBatch(a.scheme.questions, pairs) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { if (failFast) throw e; null }
                    if (batched != null) {
                        onProgress(Progress(batched, scan.crops.size, scan.crops))
                        Repo.saveMarks(a.id, sid, batched)
                        return Outcome.Ok(batched, saveCopy(ctx, sid) { Render.sheetCopy(ctx, photo, scan.sheetToPhoto, boxes, batched, label) })
                    }
                }
                for ((q, crop) in scan.crops) {
                    val question = a.scheme.questions.firstOrNull { it.q == q } ?: continue
                    val mark = try { Marker.mark(question, crop) } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { if (failFast) throw e; failedMark(q, question.max, e) }
                    // A reading that matches a misread the cloud check found earlier on this assignment waits for the teacher.
                    collected += if (Ai.deviceLearning()) holdIfKnownMisread(mark, a.readingHints, question.wireType) else mark
                    onProgress(Progress(collected.toList(), scan.crops.size, scan.crops))
                    Repo.saveMarks(a.id, sid, collected)
                }
                Outcome.Ok(collected, saveCopy(ctx, sid) { Render.sheetCopy(ctx, photo, scan.sheetToPhoto, boxes, collected, label) })
            }
        }
    }
}
