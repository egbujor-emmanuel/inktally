@file:OptIn(com.google.firebase.ai.type.PublicPreviewAPI::class)

package app.redpen.teacher.ui

import app.redpen.teacher.domain.shownLabel
import android.graphics.Bitmap
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.Connectivity
import app.redpen.teacher.ai.Ai
import app.redpen.teacher.ai.CatchUpSheet
import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Register
import app.redpen.teacher.data.Repo
import app.redpen.teacher.data.Submission
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Profile
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.domain.maxTotal
import app.redpen.teacher.domain.needsCheck
import app.redpen.teacher.domain.total
import app.redpen.teacher.marking.MarkSubmission
import app.redpen.teacher.marking.acceptNotice
import app.redpen.teacher.marking.regradeAll
import app.redpen.teacher.DeviceModel
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import app.redpen.teacher.scan.Render
import app.redpen.teacher.scan.Scanner
import app.redpen.teacher.scan.SheetLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

private fun failed(q: Int, max: Int, e: Throwable) = Mark(q, "", ReadSource.ON_DEVICE, 0, max, MarkEngine.CODE, MarkStatus.FLAGGED,
    listOf("Could not read this answer (${Repo.friendly(e)}). Check it by hand or retry when online."))

// ---------------------------------------------------------------- Mark

@Composable
fun MarkTab(a: Assignment, submissions: List<Submission>, profile: Profile, queue: QueueState) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by Connectivity.online.collectAsState()
    val device by app.redpen.teacher.DeviceModel.state.collectAsState()
    val pages = remember(a.scheme.questions) { SheetLayout.pages(a.scheme.questions) }
    var sheetMode by remember { mutableStateOf(true) }
    var page by remember { mutableIntStateOf(0) }
    var pupil by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var queuedFor by remember { mutableStateOf<String?>(null) }
    var queuedSid by remember { mutableStateOf<String?>(null) }
    var marks by remember { mutableStateOf<List<Mark>>(emptyList()) }
    var crops by remember { mutableStateOf<Map<Int, Bitmap>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf<Pair<String, Bitmap?>?>(null) } // submission id + marked copy
    var stackAdded by remember { mutableStateOf<Int?>(null) } // "N scripts added"
    /** Exercise-book mode: several photos are the pages of one student's script, not a stack of students. */
    var onePupil by remember { mutableStateOf(false) }

    fun markPhoto(photo: Bitmap) {
        busy = true; marks = emptyList(); crops = emptyMap(); done = null; queuedFor = null; status = null; stackAdded = null
        val label = pupil.trim().ifBlank { "Student ${submissions.size + 1}" }
        val mode = if (sheetMode) MarkSubmission.SHEET else MarkSubmission.PAGE
        scope.launch {
            try {
                // No connection and no on-device AI: keep the photo on this phone and mark it when the connection is back.
                if (if (app.redpen.teacher.ai.Privacy.isPrivate) device != app.redpen.teacher.DeviceModel.State.Ready else !online && device != app.redpen.teacher.DeviceModel.State.Ready) {
                    val sid = Repo.newSubmissionId(a.id)
                    withContext(Dispatchers.IO) { Repo.saveCrop(ctx, sid, Repo.PHOTO_KEY, photo) } // photo first
                    Repo.createSubmission(a.id, label, app.redpen.teacher.data.Queued(mode, page), sid)
                    queuedFor = label; queuedSid = sid; pupil = ""
                    return@launch
                }
                status = if (sheetMode) "Finding the answer boxes…" else "Reading the page…"
                val sid = Repo.createSubmission(a.id, label)
                when (val outcome = MarkSubmission.mark(ctx, a, mode, photo, page, sid, label, onProgress = { p ->
                    if (p.crops.isNotEmpty()) crops = p.crops
                    marks = p.marks
                    status = if (p.marks.size < p.total) "Marking ${p.marks.size + 1} of ${p.total}…" else status
                })) {
                    is MarkSubmission.Outcome.Failed -> { Repo.deleteSubmission(ctx, a.id, sid); status = outcome.reason }
                    is MarkSubmission.Outcome.Ok -> {
                        marks = outcome.marks
                        status = "Total: ${outcome.marks.total()}/${outcome.marks.maxTotal()}"
                        done = sid to outcome.copy
                        pupil = ""
                    }
                }
            } catch (e: Exception) {
                status = "Something went wrong: ${Repo.friendly(e)}"
            } finally { busy = false }
        }
    }
    /** One student's script over several exercise-book pages: join the pages into one image, then mark it as one script. */
    fun markPages(photos: List<android.net.Uri>) {
        if (photos.size > app.redpen.teacher.scan.Stitch.MAX_PAGES) { status = "Choose at most ${app.redpen.teacher.scan.Stitch.MAX_PAGES} pages for one student."; return }
        busy = true; status = "Joining ${photos.size} pages…"
        scope.launch {
            val joined = try {
                withContext(Dispatchers.Default) {
                    val bitmaps = photos.map { loadPhoto(ctx, it, maxSide = 1800) }
                    try { app.redpen.teacher.scan.Stitch.join(bitmaps) } finally { bitmaps.forEach { it.recycle() } }
                }
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                status = "Could not join the pages: ${Repo.friendly(e)}"; busy = false; return@launch
            }
            busy = false
            markPhoto(joined)
        }
    }
    /** Several photos at once (gallery multi-select): each becomes a queued student, marked one by one in the background. */
    fun markStack(photos: List<android.net.Uri>) {
        if (!sheetMode && onePupil) { markPages(photos); return }
        busy = true; marks = emptyList(); crops = emptyMap(); done = null; queuedFor = null; status = null; stackAdded = null
        val base = submissions.size
        val typed = pupil.trim()
        val mode = if (sheetMode) MarkSubmission.SHEET else MarkSubmission.PAGE
        val startedAt = System.currentTimeMillis()
        scope.launch {
            try {
                photos.forEachIndexed { i, uri ->
                    val label = if (typed.isNotEmpty()) "$typed ${i + 1}" else "Student ${base + i + 1}"
                    val sid = Repo.newSubmissionId(a.id)
                    // Photo first, so the queue never sees a record without it. One photo in memory at a time.
                    withContext(Dispatchers.IO) { loadPhoto(ctx, uri).also { Repo.saveCrop(ctx, sid, Repo.PHOTO_KEY, it) }.recycle() }
                    Repo.createSubmission(a.id, label, app.redpen.teacher.data.Queued(mode, page), sid, order = startedAt + i)
                }
                pupil = ""
                stackAdded = photos.size
            } catch (e: kotlinx.coroutines.CancellationException) {
                throw e
            } catch (e: Exception) {
                status = "Something went wrong: ${Repo.friendly(e)}"
            } finally { busy = false }
        }
    }
    val input = rememberPhotoInput(onPhoto = ::markPhoto, onError = { status = it }, onPhotos = ::markStack)

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(horizontal = 16.dp).padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ModeOption(sheetMode, "Printed InkTally sheet", "Names never leave the device · works fully offline") { sheetMode = true }
                ModeOption(!sheetMode, "Exercise book page", "No printer needed · best when online") { sheetMode = false }
            }
        }
        item {
            Paper {
                Field(pupil, { pupil = it }, "Student name or number", placeholder = "e.g. Ada O. or 14", enabled = !busy, maxLength = Repo.PUPIL_LIMIT)
                if (sheetMode && pages.size > 1) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Sheet page:", modifier = Modifier.padding(top = 10.dp))
                    pages.indices.forEach { i -> if (i == page) PenButton("${i + 1}", {}) else GhostButton("${i + 1}", { page = i }) }
                }
                PhotoButtons(input, if (busy) "Marking…" else if (sheetMode) "Photograph answer sheet" else "Photograph the page", enabled = !busy)
                if (!sheetMode) Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                    .toggleable(onePupil, enabled = !busy, role = androidx.compose.ui.semantics.Role.Checkbox) { onePupil = it }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically) {
                    androidx.compose.material3.Checkbox(onePupil, onCheckedChange = null, enabled = !busy)
                    Column(Modifier.padding(start = 8.dp)) {
                        Text("These photos are pages of one student", fontSize = 15.sp)
                        Text("Choose up to ${app.redpen.teacher.scan.Stitch.MAX_PAGES} pages in order. An answer can run onto the next page.", color = RP.InkSoft, fontSize = 13.sp)
                    }
                }
                Text((if (sheetMode) "Keep all four black corner squares in the photo." else "Make sure every question number and answer is visible.") +
                    (if (!sheetMode && onePupil) " Choose all of this student’s pages at once." else " Got a whole stack? Choose all the photos at once."), color = RP.InkSoft, fontSize = 13.sp)
            }
        }
        status?.let { item { Text(it, fontFamily = if (it.startsWith("Total")) RP.Display else RP.Hand, fontWeight = FontWeight.Bold,
            fontSize = if (it.startsWith("Total")) 30.sp else 24.sp, color = if (it.startsWith("Total")) RP.Ink else RP.InkSoft, modifier = Modifier.padding(horizontal = 16.dp)) } }
        // A photo saved offline is marked when the connection returns: show its result instead of "saved for marking".
        val queuedNowMarked = submissions.firstOrNull { it.id == queuedSid && it.queued == null && it.marks.isNotEmpty() }
        if (queuedFor != null && queuedNowMarked != null) item {
            Paper {
                Text("Marked: ${queuedNowMarked.pupil} · ${queuedNowMarked.marks.sumOf { it.awarded }}/${queuedNowMarked.marks.sumOf { it.max }}",
                    fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Text("The connection came back and InkTally marked the saved photo. It is in the Mark register with everyone else.", color = RP.InkSoft, fontSize = 14.sp)
            }
        }
        queuedFor?.takeIf { queuedNowMarked == null }?.let { who ->
            item {
                Paper(borderColor = RP.Flag) {
                    Text("Saved for marking: $who", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Text("You’re offline and this phone can’t read handwriting without a connection. The photo stays on this phone and InkTally marks it automatically as soon as you’re back online. Keep photographing the rest of the class.",
                        color = RP.InkSoft, fontSize = 14.sp)
                }
            }
        }
        stackAdded?.let { n ->
            item {
                Paper(borderColor = RP.Flag) {
                    Text("$n scripts added", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Text("InkTally is marking them one by one below. You can keep photographing, and rename students in the Mark register afterwards.",
                        color = RP.InkSoft, fontSize = 14.sp)
                }
            }
        }
        if (queue.waiting.isNotEmpty()) item { QueuePanel(queue, online || device == DeviceModel.State.Ready) }
        done?.let { (sid, copy) ->
            submissions.find(sid)?.let { s -> item { PupilRecord(a, s, profile, copy) } }
        }
        items(marks, key = { it.q }) { Box(Modifier.padding(horizontal = 16.dp)) { MarkCard(it, crops[it.q]) } }
        item { Spacer(Modifier.height(40.dp)) }
    }
}

@Composable
private fun ModeOption(selected: Boolean, title: String, subtitle: String, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (selected) RP.Paper else androidx.compose.ui.graphics.Color.White)
        .selectable(selected, onClick = onClick).padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
        RadioButton(selected, onClick)
        Column { Text(title, fontWeight = FontWeight.SemiBold); Text(subtitle, color = RP.InkSoft, fontSize = 12.sp) }
    }
}

class QueueState(val waiting: List<Submission>, val current: Submission?, val error: String?)

/** Students this app session has finished, until the database update arrives (never mark twice). */
private val finishedHere: MutableSet<String> = java.util.concurrent.ConcurrentHashMap.newKeySet()

/** Wait before retrying after the connection or the cloud failed mid-queue. */
private const val QUEUE_RETRY_MS = 30_000L

/**
 * The marking queue: photos taken offline on a phone without on-device AI, and whole stacks chosen at once, are saved
 * (the photo stays on this phone) and marked here one by one: on-device when Gemini Nano is ready, else once online.
 * Runs while the assignment is open (any tab). Always works from the latest waiting list, keeps going until it is
 * empty, and leaves a student queued if marking fails (e.g. the connection drops again) so it is retried later.
 * Same design as web/src/hooks/useMarkingQueue.ts.
 */
@Composable
fun rememberMarkingQueue(a: Assignment, submissions: List<Submission>): QueueState {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by Connectivity.online.collectAsState()
    val device by DeviceModel.state.collectAsState()
    // Online, or offline with Gemini Nano ready on this phone (then the queue marks on-device).
    val privateMode by app.redpen.teacher.ai.Privacy.on.collectAsState()
    // Private mode: only Gemini Nano on this phone may mark the queue.
    val canMark = if (privateMode) device == DeviceModel.State.Ready else online || device == DeviceModel.State.Ready
    var current by remember { mutableStateOf<Submission?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var tick by remember { mutableIntStateOf(0) }
    val running = remember { java.util.concurrent.atomic.AtomicBoolean(false) }
    val latest = androidx.compose.runtime.rememberUpdatedState(submissions)
    val assignment = androidx.compose.runtime.rememberUpdatedState(a)
    val waiting = submissions.filter { it.queued != null }
    // Re-run when connectivity returns, the waiting list changes, or a run finishes (tick). A run in progress is
    // never restarted by list changes: it re-reads the newest list for every student.
    LaunchedEffect(a.id, canMark, waiting.joinToString(",") { it.id }, tick) {
        if (!canMark || waiting.isEmpty() || !running.compareAndSet(false, true)) return@LaunchedEffect
        scope.launch {
            val done = HashSet<String>()
            var failed = false
            var progressed = false
            try {
                while (true) {
                    if (!Connectivity.online.value && DeviceModel.state.value != DeviceModel.State.Ready) break
                    // Students finished by us (or another device) drop out of the newest list.
                    val next = latest.value.firstOrNull { it.queued != null && it.id !in done && it.id !in finishedHere } ?: break
                    val q = next.queued ?: break
                    done += next.id
                    val photo = withContext(Dispatchers.IO) { Repo.loadCrop(ctx, next.id, Repo.PHOTO_KEY) } ?: continue // photo is on another device
                    current = next
                    try {
                        when (val outcome = MarkSubmission.mark(ctx, assignment.value, q.mode, photo, q.page, next.id, next.pupil, failFast = true)) {
                            is MarkSubmission.Outcome.Ok -> {
                                finishedHere += next.id
                                Repo.finishQueued(assignment.value.id, next.id, outcome.marks)
                                withContext(Dispatchers.IO) { Repo.deleteCrop(ctx, next.id, Repo.PHOTO_KEY) } // crops + copy saved
                                error = null; progressed = true
                            }
                            is MarkSubmission.Outcome.Failed -> error = "${next.pupil}: ${outcome.reason}"
                        }
                    } catch (e: kotlinx.coroutines.CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        error = "${next.pupil}: ${Repo.friendly(e)}" // connection or cloud trouble: stays queued
                        failed = true
                    }
                    if (failed) break // stop and retry the rest later
                }
            } finally {
                current = null
                running.set(false)
            }
            // Retry automatically after a failure; after progress, re-check once in case new students arrived meanwhile.
            if (failed) { kotlinx.coroutines.delay(QUEUE_RETRY_MS); tick++ } else if (progressed) tick++
        }
    }
    return QueueState(waiting, current, error)
}

@Composable
private fun QueuePanel(queue: QueueState, canMark: Boolean) {
    Paper {
        Text("${queue.waiting.size} waiting to be marked", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp)
        Text(queue.current?.let { "Marking ${it.pupil} now…" } ?: if (canMark) "Starting…" else "They will be marked automatically when you’re back online.",
            color = RP.InkSoft, fontSize = 14.sp)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            queue.waiting.forEach { s -> Pill(s.pupil, if (queue.current?.id == s.id) RP.Pen else RP.InkSoft) }
        }
        queue.error?.let { Text("Could not mark $it. It stays in the queue.", color = RP.Pen, fontSize = 13.sp) }
    }
}

// ---------------------------------------------------------------- Review

/** Adds the student's answer to the accepted list so every other student is marked the same way. */
private fun acceptForEveryone(q: Question, read: String): Question? = when (q) {
    is Question.Short -> q.copy(accept = q.accept + read.trim())
    is Question.Numeric -> read.replace(Regex("[^0-9.\\-]"), "").toDoubleOrNull()?.let { q.copy(accept = q.accept + it) }
    else -> null
}

@Composable
fun ReviewTab(a: Assignment, submissions: List<Submission>, check: CloudCheckState) {
    val ctx = LocalContext.current
    val online by Connectivity.online.collectAsState()
    var notice by remember { mutableStateOf<String?>(null) }
    val checking = check.progress
    val pending = submissions.flatMap { s -> s.marks.filter { it.needsCheck() }.map { s to it } }
    val provisionalCount = pending.count { it.second.status == MarkStatus.PROVISIONAL }

    /** Adds the answer to the scheme, then re-marks EVERY student already marked with it (from their stored reading). */
    fun acceptAnswer(s: Submission, m: Mark, widened: Question) {
        Repo.updateQuestion(a, widened)
        Repo.saveMarks(a.id, s.id, s.marks.map { x -> if (x.q == m.q) x.copy(awarded = x.max, status = MarkStatus.REVIEWED, engine = MarkEngine.TEACHER, reasons = x.reasons + "Teacher accepted “${m.read}” for everyone.") else x })
        val others = regradeAll(widened, submissions.filter { it.id != s.id && it.queued == null })
        others.forEach { Repo.saveMarks(a.id, it.submissionId, it.marks) }
        notice = acceptNotice(m.read, others.size)
    }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${pending.size} answer${if (pending.size == 1) "" else "s"} to check", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp, modifier = Modifier.weight(1f))
                PenButton(checking?.let { "Checking ${it.first}/${it.second}…" } ?: if (online) "Check with the cloud" else "Runs when online", { check.run() },
                    enabled = online && checking == null && pending.isNotEmpty())
            }
        }
        if (provisionalCount > 0) item {
            Text("$provisionalCount marked on-device, waiting for the cloud check.", color = RP.InkSoft, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp))
        }
        notice?.let { item { Text(it, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp)) } }
        if (a.readingHints.isNotEmpty()) item { LearnedCard(a) }
        item { ErrorText(check.error) }
        if (pending.isEmpty()) item { Text("Nothing to check: every mark was read by the cloud or set by you. ✓", fontFamily = RP.Hand, fontSize = 26.sp, color = RP.InkSoft, modifier = Modifier.padding(horizontal = 16.dp)) }
        items(pending, key = { "${it.first.id}:${it.second.q}" }) { (s, m) ->
            val question = a.scheme.questions.firstOrNull { it.q == m.q }
            Box(Modifier.padding(horizontal = 16.dp)) {
                MarkCard(m, remember(s.id, m.q) { Repo.loadCrop(ctx, s.id, m.q) }) {
                    Text(s.pupil, fontWeight = FontWeight.SemiBold)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        (0..m.max).forEach { n ->
                            OutlinedButton(onClick = {
                                Repo.saveMarks(a.id, s.id, s.marks.map { x -> if (x.q == m.q) x.copy(awarded = n, status = MarkStatus.REVIEWED, engine = MarkEngine.TEACHER, reasons = x.reasons + "Teacher set $n/${x.max}.") else x })
                            }) { Text("$n/${m.max}") }
                        }
                    }
                    val widened = question?.let { if (m.read.isNotBlank() && m.awarded < m.max) acceptForEveryone(it, m.read) else null }
                    if (widened != null) TextButton(onClick = { acceptAnswer(s, m, widened) }) { Text("Accept “${m.read.take(30)}” for everyone") }
                }
            }
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
}

/** What the cloud check taught Gemini Nano about this class's handwriting, newest first (same card as web ReviewTab). */
@Composable
private fun LearnedCard(a: Assignment) {
    Paper {
        Text("What InkTally learned about on-device reading here", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Text("When the cloud check found Gemini Nano misreading an answer, InkTally kept it. From now on, an offline reading that matches one of these is held as “Check this” and listed here, so you see the shaky marks before you are back online. InkTally never changes what the device read, so it cannot push an answer towards the key.",
            color = RP.InkSoft, fontSize = 14.sp)
        a.readingHints.reversed().forEach { h ->
            Text(buildAnnotatedString {
                append("Device read ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("“${h.device}”") }
                append(" → it was ")
                withStyle(SpanStyle(fontWeight = FontWeight.Bold)) { append("“${h.cloud}”") }
                append(" ")
                withStyle(SpanStyle(color = RP.InkSoft)) { append("(${h.type}${if (h.n > 1) ", seen ${h.n} times" else ""})") }
            }, fontSize = 14.sp)
        }
        TextButton(onClick = { Repo.saveReadingHints(a.id, emptyList()) }) { Text("Forget these") }
    }
}

// ---------------------------------------------------------------- Register

@Composable
fun RegisterTab(a: Assignment, submissions: List<Submission>, profile: Profile, onSchool: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val rows = Register.rows(a, submissions)
    val max = a.maxTotal
    var editing by remember { mutableStateOf<Pair<Submission, String>?>(null) } // submission + "pupil"|"comment"
    var openId by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    editing?.let { (s, field) ->
        var text by remember(s.id, field) { mutableStateOf(if (field == "pupil") s.pupil else s.comment) }
        AlertDialog(onDismissRequest = { editing = null },
            title = { Text(if (field == "pupil") "Student name" else "Comment for ${s.pupil}") },
            text = { Field(text, { text = it }, if (field == "pupil") "Name or number" else "Teacher’s comment", singleLine = field == "pupil",
                minLines = if (field == "pupil") 1 else 3, maxLength = if (field == "pupil") Repo.PUPIL_LIMIT else Repo.COMMENT_LIMIT) },
            confirmButton = { TextButton(onClick = {
                if (field == "pupil") Repo.updateSubmission(a.id, s.id, pupil = text) else Repo.updateSubmission(a.id, s.id, comment = text)
                editing = null
            }) { Text("Save") } },
            dismissButton = { TextButton(onClick = { editing = null }) { Text("Cancel") } })
    }

    fun export(ext: String) = scope.launch {
        runCatching {
            withContext(Dispatchers.IO) {
                val out = File(File(ctx.cacheDir, "share").apply { mkdirs() }, Register.fileName(a, ext))
                if (ext == "xlsx") out.writeBytes(Register.xlsx(a, submissions, profile)) else out.writeText(Register.csv(a, submissions, profile))
                out
            }
        }.onSuccess { f -> shareFile(ctx, f, if (ext == "xlsx") "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" else "text/csv", "${a.title} — mark register") }
            .onFailure { error = "Could not build the file: ${it.message}" }
    }

    if (rows.isEmpty()) {
        Text("Mark a few students and their scores appear here, ready for your records.", fontFamily = RP.Hand, fontSize = 26.sp, color = RP.InkSoft, modifier = Modifier.padding(16.dp))
        return
    }
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Column(Modifier.padding(horizontal = 16.dp).padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    PenButton("Download Excel (.xlsx)", { export("xlsx") }, Modifier.weight(1.6f))
                    GhostButton("CSV", { export("csv") }, Modifier.weight(0.7f))
                }
                GhostButton("Print register", {
                    scope.launch {
                        runCatching {
                            Render.registerProfile = profile
                            withContext(Dispatchers.IO) { Render.registerPdf(ctx, a, rows) }
                        }.onSuccess { printPdf(ctx, it, "${a.title} register") }.onFailure { error = "Could not build the register: ${it.message}" }
                    }
                }, Modifier.fillMaxWidth())
                Text("${rows.size} student${if (rows.size == 1) "" else "s"} · class average ${"%.1f".format(rows.sumOf { it.total }.toDouble() / rows.size)}/$max", color = RP.InkSoft)
                if (profile.institution.isBlank()) Text("Tip: add your school details (header → School details) to put your institution’s name on the register, the Excel file and every marked copy.",
                    color = RP.InkSoft, fontSize = 13.sp)
                Text("Tap a student’s name or comment to edit it. Changes save automatically and go into the Excel file.", color = RP.InkSoft, fontSize = 13.sp)
                ErrorText(error)
            }
        }
        item {
            Column(Modifier.padding(horizontal = 16.dp)) {
                if (profile.institution.isNotBlank()) Text(profile.institution.uppercase(), color = RP.Pen, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                Text("${a.title} — ${a.className}", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                if (profile.teacher.isNotBlank()) Text("Teacher: ${profile.teacher}", color = RP.InkSoft, fontSize = 12.sp)
            }
        }
        item {
            val scroll = rememberScrollState()
            Column(Modifier.padding(horizontal = 16.dp).background(androidx.compose.ui.graphics.Color.White).horizontalScroll(scroll)) {
                Row(Modifier.background(RP.Ink).padding(vertical = 8.dp)) {
                    Cell("Student", 130, header = true)
                    a.scheme.questions.forEach { Cell("Q${it.shownLabel} /${it.max}", 54, header = true) }
                    Cell("Total /$max", 70, header = true); Cell("Status", 86, header = true); Cell("Teacher’s comment", 200, header = true); Cell("", 92, header = true)
                }
                rows.forEach { r ->
                    Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
                        Cell(r.submission.pupil, 130, bold = true, onClick = { editing = r.submission to "pupil" })
                        r.scores.forEachIndexed { i, v -> Cell(v?.toString() ?: "–", 54, hand = true, red = v != null && v < a.scheme.questions[i].max) }
                        Cell("${r.total}", 70, hand = true, red = true)
                        Cell(if (r.submission.queued != null) "Waiting" else if (r.unchecked > 0) "${r.unchecked} to check" else "Marked", 86, small = true)
                        Cell(r.submission.comment.ifBlank { "Add a comment" }, 200, hand = r.submission.comment.isNotBlank(), red = r.submission.comment.isNotBlank(),
                            small = r.submission.comment.isBlank(), onClick = { editing = r.submission to "comment" })
                        Box(Modifier.width(92.dp)) { TextButton(onClick = { openId = if (openId == r.submission.id) null else r.submission.id }) { Text(if (openId == r.submission.id) "Close" else "Marked copy", fontSize = 12.sp) } }
                    }
                    Box(Modifier.height(1.dp).width(130.dp + 54.dp * a.scheme.questions.size + 448.dp).background(RP.Border))
                }
            }
        }
        submissions.find(openId)?.let { s -> item { PupilRecord(a, s, profile) } }
        item { Spacer(Modifier.height(40.dp)) }
    }
}

@Composable
private fun Cell(text: String, width: Int, header: Boolean = false, bold: Boolean = false, hand: Boolean = false, red: Boolean = false, small: Boolean = false, onClick: (() -> Unit)? = null) {
    Text(text, modifier = Modifier.width(width.dp).padding(horizontal = 6.dp).let { if (onClick != null) it.clickable(onClick = onClick) else it },
        color = when { header -> androidx.compose.ui.graphics.Color.White; red -> RP.Pen; small -> RP.InkSoft; else -> RP.Ink },
        fontFamily = if (hand && !header) RP.Hand else null, fontWeight = if (header || bold) FontWeight.SemiBold else null,
        fontSize = when { header -> 12.sp; hand -> 20.sp; small -> 12.sp; else -> 14.sp }, maxLines = if (header) 2 else 4, overflow = TextOverflow.Ellipsis)
}

// ---------------------------------------------------------------- Insights

@Composable
fun InsightsTab(a: Assignment, submissions: List<Submission>) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by Connectivity.online.collectAsState()
    var busyQ by remember { mutableStateOf<Int?>(null) }
    var sheet by remember { mutableStateOf<Pair<Int, CatchUpSheet>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    if (submissions.isEmpty()) {
        Text("Mark a few students to see where the class is struggling.", fontFamily = RP.Hand, fontSize = 26.sp, color = RP.InkSoft, modifier = Modifier.padding(16.dp))
        return
    }
    val stats = a.scheme.questions.map { q ->
        val marks = submissions.mapNotNull { s -> s.marks.firstOrNull { it.q == q.q } }
        val avg = if (marks.isEmpty()) 0.0 else marks.sumOf { it.awarded.toDouble() / it.max } / marks.size
        Triple(q, avg, marks)
    }
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { Spacer(Modifier.height(4.dp)) }
        items(stats, key = { it.first.q }) { (q, avg, marks) ->
            val wrong = marks.filter { it.awarded < it.max && it.read.isNotBlank() }.map { it.read }
            val pct = (avg * 100).toInt()
            Paper {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Q${q.shownLabel}", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 22.sp, modifier = Modifier.width(52.dp))
                    Text(q.prompt, fontWeight = FontWeight.Medium, modifier = Modifier.weight(1f))
                }
                if (wrong.isNotEmpty()) Text("Answers that lost marks: " + wrong.groupingBy { it }.eachCount().entries.sortedByDescending { it.value }.take(4)
                    .joinToString { "“${it.key}” ×${it.value}" }, color = RP.InkSoft, fontSize = 13.sp)
                Box(Modifier.fillMaxWidth().height(10.dp).clip(RoundedCornerShape(5.dp)).background(RP.PaperDeep)) {
                    Box(Modifier.fillMaxWidth(pct / 100f).fillMaxHeight().clip(RoundedCornerShape(5.dp)).background(if (pct < 50) RP.Pen else RP.Device))
                }
                Text("$pct% average · ${marks.size} students", color = RP.InkSoft, fontSize = 13.sp)
                GhostButton(if (busyQ == q.q) "Writing…" else "Catch-up sheet", {
                    busyQ = q.q; error = null
                    scope.launch {
                        runCatching { Ai.makeCatchUp(q, wrong, a.scheme.subject, a.scheme.level) }.onSuccess { sheet = q.q to it }.onFailure { error = Repo.friendly(it) }
                        busyQ = null
                    }
                }, enabled = online && wrong.isNotEmpty() && busyQ == null)
                if (wrong.isEmpty()) Text("Nobody lost marks on this question, so there is nothing to catch up on.", color = RP.InkSoft, fontSize = 13.sp)
                else if (!online) Text("Catch-up sheets are written in the cloud, so they need internet.", color = RP.InkSoft, fontSize = 13.sp)
            }
        }
        item { ErrorText(error) }
        sheet?.let { (qn, s) ->
            item {
                Column(Modifier.fillMaxWidth().ruledPaper().padding(start = 52.dp, end = 16.dp, top = 20.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("catch-up · question $qn", fontFamily = RP.Hand, fontSize = 22.sp, color = RP.Pen)
                    Text("Let’s fix this together", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 26.sp)
                    Text(s.explanation, fontSize = 17.sp, lineHeight = 26.sp)
                    s.practice.forEachIndexed { i, (question, answer) ->
                        var shown by remember(qn, i) { mutableStateOf(false) }
                        Column {
                            Text("${i + 1}. $question", fontSize = 17.sp, lineHeight = 26.sp)
                            Text(if (shown) "Answer: $answer" else "Show answer", color = RP.InkSoft, fontSize = 14.sp, modifier = Modifier.clickable { shown = !shown })
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        PenButton("Share", {
                            shareText(ctx, "Catch-up — ${a.title}, question $qn\n\n${s.explanation}\n\n" +
                                s.practice.mapIndexed { i, (qq, ans) -> "${i + 1}. $qq\n   Answer: $ans" }.joinToString("\n"), "Catch-up sheet")
                        }, Modifier.weight(1f))
                        GhostButton("Print", {
                            scope.launch {
                                runCatching { withContext(Dispatchers.IO) { Render.catchUpPdf(ctx, a.title, qn, s.explanation, s.practice) } }
                                    .onSuccess { printPdf(ctx, it, "Catch-up Q$qn") }.onFailure { error = it.message }
                            }
                        }, Modifier.weight(1f))
                    }
                }
            }
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
}
