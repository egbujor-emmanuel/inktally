package app.redpen.teacher.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.MarkingScheme
import app.redpen.teacher.domain.Profile
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.marking.ReadingHint
import app.redpen.teacher.marking.countNewHints
import app.redpen.teacher.marking.mergeHints
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.ListenerRegistration
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.SetOptions
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.channels.ProducerScope
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.io.File

data class Assignment(
    val id: String, val title: String, val className: String, val scheme: MarkingScheme,
    /** Finished assignments stay saved and viewable, just out of the way. */
    val status: String = "active",
    /** Handwriting lessons from the cloud check, fed into later on-device reads (marking/Learning.kt). */
    val readingHints: List<ReadingHint> = emptyList(),
) {
    val isFinished get() = status == "finished"
    val maxTotal get() = scheme.questions.sumOf { it.max }
}

/** Saved offline on a phone without on-device AI; marked automatically when the phone is back online. */
data class Queued(val mode: String, val page: Int)

data class Submission(val id: String, val pupil: String, val marks: List<Mark>, val comment: String = "", val queued: Queued? = null,
    /** Capture order (client clock, ms); see Repo.createSubmission. 0 for records saved before it existed. */ val order: Long = 0)

/** Students in the order their photos were taken (same as web inCaptureOrder; older records keep their place, first). */
fun inCaptureOrder(items: List<Submission>): List<Submission> = items.sortedBy { it.order }

/**
 * Same Firestore layout and rules as the web app (assignments/{id}/submissions/{sid}, users/{uid}/settings/profile).
 * Writes are fire-and-forget: Firestore applies them to the offline cache instantly and syncs later.
 * Answer-box images and photos are stored ONLY in this app's private storage.
 */
object Repo {
    private const val TAG = "Repo"
    const val COMMENT_LIMIT = 1000
    const val PUPIL_LIMIT = 80

    /** Device-only key for a whole exercise-book page photo. */
    const val PAGE_KEY = 0
    /** Device-only key for the generated marked copy of the student's work. */
    const val MARKED_KEY = -1
    /** Device-only key for the original photo of a student waiting to be marked (offline queue). */
    const val PHOTO_KEY = -2

    private val db get() = Firebase.firestore
    private fun uid() = Firebase.auth.currentUser?.uid ?: error("Not signed in yet")

    /** Last write failure, shown as a banner (writes are queued, so failures arrive later). */
    private val _writeError = MutableStateFlow<String?>(null)
    val writeError: StateFlow<String?> = _writeError
    fun clearWriteError() { _writeError.value = null }

    private fun queue(what: String, task: com.google.android.gms.tasks.Task<*>) {
        task.addOnFailureListener { e ->
            Log.w(TAG, "write failed: $what", e)
            _writeError.value = "Could not save $what: ${friendly(e)}"
        }
    }

    fun friendly(e: Throwable): String {
        val raw = "${e::class.simpleName} ${e.message}"
        return when {
            e is app.redpen.teacher.ai.PrivateModeException || "Private mode is on" in raw ->
                "private mode is on, so pupils’ work stays on this phone. This needs Gemini Nano on this phone (see the status strip), or turn Private mode off in School details."
            Regex("app.?check|attestation", RegexOption.IGNORE_CASE).containsMatchIn(raw) -> "this device could not be verified by App Check. Reopen the app and try again. ($raw)"
            Regex("PERMISSION_DENIED|permission", RegexOption.IGNORE_CASE).containsMatchIn(raw) -> "the server refused it (permission denied). ($raw)"
            Regex("quota|RESOURCE_EXHAUSTED|429", RegexOption.IGNORE_CASE).containsMatchIn(raw) -> "the free cloud quota is used up for the moment. Try again in a minute."
            Regex("high demand|overloaded|unavailable|\\b50[0-4]\\b", RegexOption.IGNORE_CASE).containsMatchIn(raw) -> "the cloud model is overloaded right now. Try again in a minute."
            Regex("timeout|deadline", RegexOption.IGNORE_CASE).containsMatchIn(raw) -> "the cloud took too long to answer. Try again; a clearer photo is faster."
            Regex("network|UnknownHost|offline|unreachable", RegexOption.IGNORE_CASE).containsMatchIn(raw) -> "no connection to the cloud. Check your internet and try again."
            else -> e.message ?: raw
        }
    }

    // ---- encoding (wire format identical to web/src/domain/types.ts) ----
    private fun Question.toMap(): Map<String, Any?> = baseMap().let { b -> if (label.isNullOrBlank()) b else b + ("label" to label) }

    private fun Question.baseMap(): Map<String, Any?> = when (this) {
        is Question.Objective -> mapOf("q" to q, "type" to "objective", "prompt" to prompt, "max" to max, "correct" to correct)
        is Question.Numeric -> buildMap {
            put("q", q); put("type", "numeric"); put("prompt", prompt); put("max", max); put("accept", accept); put("methodPoints", methodPoints)
            tolerance?.let { put("tolerance", it) }
        }
        is Question.Short -> mapOf("q" to q, "type" to "short", "prompt" to prompt, "max" to max, "accept" to accept, "reject" to reject, "spellingTolerant" to spellingTolerant)
        is Question.Points -> mapOf("q" to q, "type" to "points", "prompt" to prompt, "max" to max, "points" to points, "reject" to reject)
    }

    private fun questionOf(m: Map<String, Any?>): Question? {
        val q = (m["q"] as? Number)?.toInt() ?: return null
        val prompt = m["prompt"] as? String ?: ""
        val max = (m["max"] as? Number)?.toInt() ?: 1
        fun strings(k: String) = (m[k] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
        val label = (m["label"] as? String)?.takeIf { it.isNotBlank() }
        return when (m["type"]) {
            "objective" -> Question.Objective(q, prompt, max, strings("correct"), label)
            "numeric" -> Question.Numeric(q, prompt, max, (m["accept"] as? List<*>)?.filterIsInstance<Number>()?.map { it.toDouble() } ?: emptyList(),
                (m["tolerance"] as? Number)?.toDouble(), strings("methodPoints"), label)
            "short" -> Question.Short(q, prompt, max, strings("accept"), strings("reject"), m["spellingTolerant"] as? Boolean ?: true, label)
            "points" -> Question.Points(q, prompt, max, strings("points"), strings("reject"), label)
            else -> null
        }
    }

    private fun Mark.toMap() = mapOf("q" to q, "read" to read, "readSource" to readSource.wire, "awarded" to awarded, "max" to max,
        "engine" to engine.wire, "status" to status.wire, "reasons" to reasons, "pointsFound" to pointsFound).let { if (label.isNullOrBlank()) it else it + ("label" to label) }

    private fun markOf(m: Map<String, Any?>): Mark? = Mark(
        q = (m["q"] as? Number)?.toInt() ?: return null, read = m["read"] as? String ?: "",
        readSource = ReadSource.entries.firstOrNull { it.wire == m["readSource"] } ?: ReadSource.IN_CLOUD,
        awarded = (m["awarded"] as? Number)?.toInt() ?: 0, max = (m["max"] as? Number)?.toInt() ?: 1,
        engine = MarkEngine.entries.firstOrNull { it.wire == m["engine"] } ?: MarkEngine.CODE,
        status = MarkStatus.entries.firstOrNull { it.wire == m["status"] } ?: MarkStatus.FLAGGED,
        reasons = (m["reasons"] as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
        pointsFound = (m["pointsFound"] as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
        label = (m["label"] as? String)?.takeIf { it.isNotBlank() },
    )

    @Suppress("UNCHECKED_CAST")
    private fun schemeOf(m: Map<String, Any?>?) = MarkingScheme(
        m?.get("subject") as? String ?: "", m?.get("level") as? String ?: "",
        ((m?.get("questions") as? List<*>) ?: emptyList<Any>()).mapNotNull { (it as? Map<String, Any?>)?.let(::questionOf) },
    )

    fun schemeToMap(scheme: MarkingScheme) = mapOf("subject" to scheme.subject, "level" to scheme.level, "questions" to scheme.questions.map { it.toMap() })

    private fun hintOf(m: Map<*, *>): ReadingHint? {
        val type = m["type"] as? String ?: return null
        val device = m["device"] as? String ?: return null
        val cloud = m["cloud"] as? String ?: return null
        return ReadingHint(type, device, cloud, (m["n"] as? Number)?.toInt() ?: 1)
    }

    @Suppress("UNCHECKED_CAST")
    private fun assignmentOf(d: DocumentSnapshot) = Assignment(d.id, d.getString("title") ?: "", d.getString("className") ?: "",
        schemeOf(d.get("scheme") as? Map<String, Any?>), d.getString("status") ?: "active",
        ((d.get("readingHints") as? List<*>) ?: emptyList<Any>()).mapNotNull { (it as? Map<*, *>)?.let(::hintOf) })

    @Suppress("UNCHECKED_CAST")
    private fun submissionOf(d: DocumentSnapshot) = Submission(d.id, d.getString("pupil") ?: "",
        ((d.get("marks") as? List<*>) ?: emptyList<Any>()).mapNotNull { (it as? Map<String, Any?>)?.let(::markOf) }, d.getString("comment") ?: "",
        (d.get("queued") as? Map<String, Any?>)?.let { q -> Queued(q["mode"] as? String ?: "sheet", (q["page"] as? Number)?.toInt() ?: 0) },
        (d.get("order") as? Number)?.toLong() ?: 0L)

    /**
     * Snapshot listener that survives transient denials: a listener can reach the server before a doc we just
     * created (writes are queued for offline use) and Firestore then ends it. Re-attach with backoff.
     */
    private suspend fun <T> ProducerScope<T>.resilient(attach: ((FirebaseFirestoreException) -> Unit) -> ListenerRegistration) {
        val delays = listOf(1_000L, 2_000L, 4_000L, 8_000L)
        var reg: ListenerRegistration? = null
        var attempt = 0
        fun start() {
            reg = attach { e ->
                Log.w(TAG, "listener error", e)
                val wait = delays.getOrNull(attempt++)
                if (wait == null) { _writeError.value = "Could not load your data: ${friendly(e)}"; return@attach }
                launch { delay(wait); reg?.remove(); start() }
            }
        }
        start()
        awaitClose { reg?.remove() }
    }

    // ---- assignments ----
    fun createAssignment(title: String, className: String, scheme: MarkingScheme): String {
        val ref = db.collection("assignments").document()
        queue("the assignment", ref.set(mapOf("title" to title, "className" to className, "ownerUid" to uid(), "createdAt" to FieldValue.serverTimestamp(),
            "status" to "active", "scheme" to schemeToMap(scheme))))
        return ref.id
    }

    fun assignments(): Flow<List<Assignment>> = callbackFlow {
        resilient { fail ->
            db.collection("assignments").whereEqualTo("ownerUid", uid()).orderBy("createdAt", Query.Direction.DESCENDING)
                .addSnapshotListener { snap, e -> if (e != null) fail(e) else trySend(snap?.documents?.map(::assignmentOf) ?: emptyList()) }
        }
    }

    fun assignment(id: String): Flow<Assignment?> = callbackFlow {
        resilient { fail ->
            db.collection("assignments").document(id).addSnapshotListener { d, e ->
                when {
                    e != null -> fail(e)
                    d != null && d.exists() -> trySend(assignmentOf(d))
                    d != null && !d.metadata.isFromCache -> trySend(null)
                }
            }
        }
    }

    fun setStatus(id: String, status: String) = queue("the assignment status", db.collection("assignments").document(id).update("status", status))

    /**
     * Saves an edited answer key and every student re-marked under it as ONE atomic batch (same as web saveKeyAndMarks),
     * so the key and the marks can never disagree. A class over 450 students is split, with the key in the first batch.
     */
    fun saveKeyAndMarks(a: Assignment, questions: List<Question>, updates: List<Pair<String, List<Mark>>>) {
        val chunks: List<List<Pair<String, List<Mark>>>> = if (updates.isEmpty()) listOf(emptyList()) else updates.chunked(450)
        chunks.forEachIndexed { i, chunk ->
            val batch = db.batch()
            if (i == 0) batch.update(db.collection("assignments").document(a.id), "scheme.questions", questions.map { it.toMap() })
            chunk.forEach { (sid, marks) ->
                batch.update(db.collection("assignments").document(a.id).collection("submissions").document(sid), "marks", marks.map { it.toMap() })
            }
            queue("the answer key and re-marked students", batch.commit())
        }
    }

    fun updateQuestion(a: Assignment, updated: Question) {
        val questions = a.scheme.questions.map { if (it.q == updated.q) updated else it }
        queue("the edited question", db.collection("assignments").document(a.id).update("scheme.questions", questions.map { it.toMap() }))
    }

    private fun hintMap(h: ReadingHint) = mapOf("type" to h.type, "device" to h.device, "cloud" to h.cloud, "n" to h.n)

    /** Replaces the known device misreads (the teacher's "Forget these" saves an empty list). */
    fun saveReadingHints(assignmentId: String, hints: List<ReadingHint>) = queue("what InkTally learned",
        db.collection("assignments").document(assignmentId).update("readingHints", hints.map(::hintMap)))

    /**
     * Merges freshly learned device misreads into the assignment's newest saved ones in a transaction (ones saved meanwhile by
     * another device are kept; same as web addReadingHints). Returns how many confusions were new. Online only.
     */
    suspend fun addReadingHints(assignmentId: String, fresh: List<ReadingHint>): Int {
        val ref = db.collection("assignments").document(assignmentId)
        return db.runTransaction { tx ->
            val existing = ((tx.get(ref).get("readingHints") as? List<*>) ?: emptyList<Any>()).mapNotNull { (it as? Map<*, *>)?.let(::hintOf) }
            tx.update(ref, "readingHints", mergeHints(existing, fresh).map(::hintMap))
            countNewHints(existing, fresh)
        }.await()
    }

    /** Permanently deletes an assignment, every student's marks for it, and this device's photos for it. */
    suspend fun deleteAssignment(ctx: Context, id: String) {
        val subs = db.collection("assignments").document(id).collection("submissions").whereEqualTo("ownerUid", uid()).get().await()
        for (s in subs.documents) {
            File(ctx.filesDir, "crops").listFiles { f -> f.name.startsWith("${s.id}_") }?.forEach { it.delete() }
            s.reference.delete()
        }
        db.collection("assignments").document(id).delete()
    }

    // ---- submissions ----
    /** A fresh student-record id, so device-only images can be saved before the record itself is written. */
    fun newSubmissionId(assignmentId: String): String = db.collection("assignments").document(assignmentId).collection("submissions").document().id

    /** Removes a student record that never got marks (e.g. no corner squares found) and its device images. */
    fun deleteSubmission(ctx: Context, assignmentId: String, submissionId: String) {
        File(ctx.filesDir, "crops").listFiles { f -> f.name.startsWith("${submissionId}_") }?.forEach { it.delete() }
        queue("the student", db.collection("assignments").document(assignmentId).collection("submissions").document(submissionId).delete())
    }

    fun deleteCrop(ctx: Context, submissionId: String, q: Int) { cropFile(ctx, submissionId, q).delete() }

    /** [order] fixes where the student appears in lists: the photo order of a batch (same as web createSubmission). */
    fun createSubmission(assignmentId: String, pupil: String, queued: Queued? = null, id: String? = null, order: Long = System.currentTimeMillis()): String {
        val col = db.collection("assignments").document(assignmentId).collection("submissions")
        val ref = if (id != null) col.document(id) else col.document()
        val data = buildMap<String, Any> {
            put("assignmentId", assignmentId); put("ownerUid", uid()); put("pupil", pupil.take(PUPIL_LIMIT))
            put("marks", emptyList<Any>()); put("order", order); put("createdAt", FieldValue.serverTimestamp())
            queued?.let { put("queued", mapOf("mode" to it.mode, "page" to it.page)) }
        }
        queue("the student", ref.set(data))
        return ref.id
    }

    /** A queued student has now been marked: store the marks and take them off the waiting list. */
    fun finishQueued(assignmentId: String, submissionId: String, marks: List<Mark>) = queue("the marks",
        db.collection("assignments").document(assignmentId).collection("submissions").document(submissionId)
            .update(mapOf("marks" to marks.map { it.toMap() }, "queued" to FieldValue.delete())))

    fun saveMarks(assignmentId: String, submissionId: String, marks: List<Mark>) =
        queue("the marks", db.collection("assignments").document(assignmentId).collection("submissions").document(submissionId).update("marks", marks.map { it.toMap() }))

    /** Edit a student's record after marking: rename, or add the teacher's comment. */
    fun updateSubmission(assignmentId: String, submissionId: String, pupil: String? = null, comment: String? = null) {
        val patch = buildMap<String, Any> {
            pupil?.let { put("pupil", it.trim().take(PUPIL_LIMIT).ifBlank { "Student" }) }
            comment?.let { put("comment", it.trim().take(COMMENT_LIMIT)) }
        }
        if (patch.isEmpty()) return
        queue(if (comment != null) "the comment" else "the student name",
            db.collection("assignments").document(assignmentId).collection("submissions").document(submissionId).update(patch))
    }

    fun submissions(assignmentId: String): Flow<List<Submission>> = callbackFlow {
        resilient { fail ->
            db.collection("assignments").document(assignmentId).collection("submissions")
                .whereEqualTo("ownerUid", uid()).orderBy("createdAt", Query.Direction.ASCENDING)
                .addSnapshotListener { snap, e -> if (e != null) fail(e) else trySend(inCaptureOrder(snap?.documents?.map(::submissionOf) ?: emptyList())) }
        }
    }

    // ---- school details ----
    private fun profileRef() = db.collection("users").document(uid()).collection("settings").document("profile")

    fun profile(): Flow<Profile> = callbackFlow {
        trySend(Profile())
        resilient { fail ->
            profileRef().addSnapshotListener { d, e ->
                if (e != null) fail(e)
                else trySend(Profile.clean(d?.getString("institution") ?: "", d?.getString("details") ?: "", d?.getString("teacher") ?: ""))
            }
        }
    }

    fun saveProfile(p: Profile) = queue("your school details", profileRef().set(mapOf(
        "institution" to p.institution, "details" to p.details, "teacher" to p.teacher, "updatedAt" to FieldValue.serverTimestamp()), SetOptions.merge()))

    // ---- device-only images ----
    private fun cropFile(ctx: Context, submissionId: String, q: Int) = File(File(ctx.filesDir, "crops").apply { mkdirs() }, "${submissionId}_$q.img")

    fun saveCrop(ctx: Context, submissionId: String, q: Int, bmp: Bitmap) = cropFile(ctx, submissionId, q).outputStream().use {
        if (q == PAGE_KEY || q == PHOTO_KEY) bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) else bmp.compress(Bitmap.CompressFormat.PNG, 100, it)
    }

    fun loadCrop(ctx: Context, submissionId: String, q: Int): Bitmap? =
        cropFile(ctx, submissionId, q).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }
}
