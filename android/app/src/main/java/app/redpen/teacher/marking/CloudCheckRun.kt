@file:OptIn(com.google.firebase.ai.type.PublicPreviewAPI::class)

package app.redpen.teacher.marking

import android.content.Context
import android.graphics.Bitmap
import app.redpen.teacher.Connectivity
import app.redpen.teacher.ai.Ai
import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Repo
import app.redpen.teacher.data.Submission
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.needsCheck
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The cloud check: every provisional (on-device) or flagged mark is re-read by the cloud model and reconciled.
 * Runs automatically when the phone is back online (rememberCloudCheck, any tab) and on demand from the Review tab.
 * Port of web/src/marking/cloudCheck.ts.
 */
object CloudCheckRun {
    private suspend fun crop(ctx: Context, sid: String, key: Int): Bitmap? = withContext(Dispatchers.IO) { Repo.loadCrop(ctx, sid, key) }

    private suspend fun checkOne(ctx: Context, a: Assignment, s: Submission): List<Mark> {
        val questions = a.scheme.questions
        crop(ctx, s.id, Repo.PAGE_KEY)?.let { page -> return Marker.verifyPage(questions, page, s.marks) }
        val pending = s.marks.filter { it.needsCheck() }
        // One cloud request for all of this student's answers that need checking.
        if (Ai.batchingEnabled() && pending.size > 1) {
            val crops = mutableListOf<Pair<Question, Bitmap>>()
            for (m in pending) {
                val question = questions.firstOrNull { it.q == m.q }
                val bmp = crop(ctx, s.id, m.q)
                if (question != null && bmp != null) crops += question to bmp
            }
            try { return Marker.verifyBatch(questions, crops, s.marks) } catch (e: CancellationException) { throw e } catch (_: Exception) { /* fall back to one answer at a time */ }
        }
        return s.marks.map { m ->
            val question = questions.firstOrNull { it.q == m.q }
            val bmp = if (m.needsCheck()) crop(ctx, s.id, m.q) else null
            if (question != null && bmp != null) Marker.verify(question, bmp, m) else m
        }
    }

    /** Checks every student with marks that need it. One failing student never stops the rest. */
    suspend fun run(
        ctx: Context, a: Assignment, submissions: List<Submission>,
        /** Newest marks from the database, so a long check never overwrites a score the teacher set meanwhile. */
        latest: () -> List<Submission>,
        onProgress: (done: Int, total: Int) -> Unit = { _, _ -> },
        onError: (String) -> Unit = {},
    ): CheckSummary {
        val targets = submissions.filter { s -> s.queued == null && s.marks.any { it.needsCheck() } }
        val total = targets.sumOf { s -> s.marks.count { it.needsCheck() } }
        var summary = CheckSummary()
        var done = 0
        val learned = mutableListOf<ReadingHint>()
        onProgress(0, total)
        for (s in targets) {
            if (!Connectivity.online.value) break
            try {
                val checked = checkOne(ctx, a, s)
                val now = latest().firstOrNull { it.id == s.id }?.marks ?: s.marks
                val merged = keepReviewed(now, checked)
                val part = summarise(s.marks, merged)
                summary += part
                if (part.checked > 0) Repo.saveMarks(a.id, s.id, merged)
                learned += learnFromCheck(a.scheme.questions, s.marks, merged)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                onError(Repo.friendly(e))
            }
            done += s.marks.count { it.needsCheck() }
            onProgress(done, total)
        }
        if (learned.isNotEmpty()) {
            Repo.saveReadingHints(a.id, mergeHints(a.readingHints, learned))
            summary = summary.copy(learned = learned.size)
        }
        return summary
    }
}
