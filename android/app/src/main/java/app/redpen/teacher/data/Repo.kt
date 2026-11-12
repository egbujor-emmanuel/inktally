package app.redpen.teacher.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.MarkingScheme
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import com.google.firebase.Firebase
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.firestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.io.File

data class Assignment(val id: String, val title: String, val className: String, val scheme: MarkingScheme)
data class Submission(val id: String, val pupil: String, val marks: List<Mark>)

/**
 * Same Firestore layout as the web app (assignments/{id}/submissions/{sid}).
 * Writes are fire-and-forget: Firestore applies them to the offline cache instantly and syncs later.
 * Answer-box images are stored ONLY in this app's private storage.
 */
object Repo {
    private val db get() = Firebase.firestore
    private fun uid() = Firebase.auth.currentUser?.uid ?: error("Not signed in yet")

    // ---- encoding (wire format identical to web/src/domain/types.ts) ----
    private fun Question.toMap(): Map<String, Any?> = when (this) {
        is Question.Objective -> mapOf("q" to q, "type" to "objective", "prompt" to prompt, "max" to max, "correct" to correct)
        is Question.Numeric -> mapOf("q" to q, "type" to "numeric", "prompt" to prompt, "max" to max, "accept" to accept, "methodPoints" to methodPoints)
        is Question.Short -> mapOf("q" to q, "type" to "short", "prompt" to prompt, "max" to max, "accept" to accept, "reject" to reject, "spellingTolerant" to spellingTolerant)
        is Question.Points -> mapOf("q" to q, "type" to "points", "prompt" to prompt, "max" to max, "points" to points, "reject" to reject)
    }

    @Suppress("UNCHECKED_CAST")
    private fun questionOf(m: Map<String, Any?>): Question? {
        val q = (m["q"] as? Number)?.toInt() ?: return null
        val prompt = m["prompt"] as? String ?: ""
        val max = (m["max"] as? Number)?.toInt() ?: 1
        fun strings(k: String) = (m[k] as? List<*>)?.filterIsInstance<String>() ?: emptyList()
        return when (m["type"]) {
            "objective" -> Question.Objective(q, prompt, max, strings("correct"))
            "numeric" -> Question.Numeric(q, prompt, max, (m["accept"] as? List<*>)?.filterIsInstance<Number>()?.map { it.toDouble() } ?: emptyList(),
                (m["tolerance"] as? Number)?.toDouble(), strings("methodPoints"))
            "short" -> Question.Short(q, prompt, max, strings("accept"), strings("reject"), m["spellingTolerant"] as? Boolean ?: true)
            "points" -> Question.Points(q, prompt, max, strings("points"), strings("reject"))
            else -> null
        }
    }

    private fun Mark.toMap() = mapOf("q" to q, "read" to read, "readSource" to readSource.wire, "awarded" to awarded, "max" to max,
        "engine" to engine.wire, "status" to status.wire, "reasons" to reasons, "pointsFound" to pointsFound)

    private fun markOf(m: Map<String, Any?>) = Mark(
        q = (m["q"] as Number).toInt(), read = m["read"] as? String ?: "",
        readSource = ReadSource.entries.firstOrNull { it.wire == m["readSource"] } ?: ReadSource.IN_CLOUD,
        awarded = (m["awarded"] as? Number)?.toInt() ?: 0, max = (m["max"] as? Number)?.toInt() ?: 1,
        engine = MarkEngine.entries.firstOrNull { it.wire == m["engine"] } ?: MarkEngine.CODE,
        status = MarkStatus.entries.firstOrNull { it.wire == m["status"] } ?: MarkStatus.FLAGGED,
        reasons = (m["reasons"] as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
        pointsFound = (m["pointsFound"] as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
    )

    @Suppress("UNCHECKED_CAST")
    private fun schemeOf(m: Map<String, Any?>?) = MarkingScheme(
        m?.get("subject") as? String ?: "", m?.get("level") as? String ?: "",
        ((m?.get("questions") as? List<*>) ?: emptyList<Any>()).mapNotNull { (it as? Map<String, Any?>)?.let(::questionOf) },
    )

    // ---- assignments ----
    fun createAssignment(title: String, className: String, scheme: MarkingScheme): String {
        val ref = db.collection("assignments").document()
        ref.set(mapOf("title" to title, "className" to className, "ownerUid" to uid(), "createdAt" to FieldValue.serverTimestamp(),
            "scheme" to mapOf("subject" to scheme.subject, "level" to scheme.level, "questions" to scheme.questions.map { it.toMap() })))
        return ref.id
    }

    @Suppress("UNCHECKED_CAST")
    fun assignments(): Flow<List<Assignment>> = callbackFlow {
        val reg = db.collection("assignments").whereEqualTo("ownerUid", uid()).orderBy("createdAt", Query.Direction.DESCENDING)
            .addSnapshotListener { snap, _ ->
                trySend(snap?.documents?.map { d -> Assignment(d.id, d.getString("title") ?: "", d.getString("className") ?: "", schemeOf(d.get("scheme") as? Map<String, Any?>)) } ?: emptyList())
            }
        awaitClose { reg.remove() }
    }

    @Suppress("UNCHECKED_CAST")
    fun assignment(id: String): Flow<Assignment?> = callbackFlow {
        val reg = db.collection("assignments").document(id).addSnapshotListener { d, _ ->
            trySend(d?.takeIf { it.exists() }?.let { Assignment(it.id, it.getString("title") ?: "", it.getString("className") ?: "", schemeOf(it.get("scheme") as? Map<String, Any?>)) })
        }
        awaitClose { reg.remove() }
    }

    // ---- submissions ----
    fun createSubmission(assignmentId: String, pupil: String): String {
        val ref = db.collection("assignments").document(assignmentId).collection("submissions").document()
        ref.set(mapOf("assignmentId" to assignmentId, "ownerUid" to uid(), "pupil" to pupil, "marks" to emptyList<Any>(), "createdAt" to FieldValue.serverTimestamp()))
        return ref.id
    }

    fun saveMarks(assignmentId: String, submissionId: String, marks: List<Mark>) {
        db.collection("assignments").document(assignmentId).collection("submissions").document(submissionId).update("marks", marks.map { it.toMap() })
    }

    @Suppress("UNCHECKED_CAST")
    fun submissions(assignmentId: String): Flow<List<Submission>> = callbackFlow {
        val reg = db.collection("assignments").document(assignmentId).collection("submissions")
            .whereEqualTo("ownerUid", uid()).orderBy("createdAt", Query.Direction.ASCENDING)
            .addSnapshotListener { snap, _ ->
                trySend(snap?.documents?.map { d -> Submission(d.id, d.getString("pupil") ?: "", ((d.get("marks") as? List<*>) ?: emptyList<Any>()).mapNotNull { (it as? Map<String, Any?>)?.let(::markOf) }) } ?: emptyList())
            }
        awaitClose { reg.remove() }
    }

    // ---- device-only crops ----
    private fun cropFile(ctx: Context, submissionId: String, q: Int) = File(File(ctx.filesDir, "crops").apply { mkdirs() }, "$submissionId-$q.png")
    fun saveCrop(ctx: Context, submissionId: String, q: Int, bmp: Bitmap) = cropFile(ctx, submissionId, q).outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    fun loadCrop(ctx: Context, submissionId: String, q: Int): Bitmap? = cropFile(ctx, submissionId, q).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }
}
