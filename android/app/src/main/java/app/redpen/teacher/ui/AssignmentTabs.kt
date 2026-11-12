@file:OptIn(com.google.firebase.ai.type.PublicPreviewAPI::class)

package app.redpen.teacher.ui

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
import app.redpen.teacher.marking.Marker
import app.redpen.teacher.marking.MarkSubmission
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
    var marks by remember { mutableStateOf<List<Mark>>(emptyList()) }
    var crops by remember { mutableStateOf<Map<Int, Bitmap>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    var done by remember { mutableStateOf<Pair<String, Bitmap?>?>(null) } // submission id + marked copy

    fun markPhoto(photo: Bitmap) {
        busy = true; marks = emptyList(); crops = emptyMap(); done = null; queuedFor = null; status = null
        val label = pupil.ifBlank { "Student ${java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date())}" }
        val mode = if (sheetMode) MarkSubmission.SHEET else MarkSubmission.PAGE
        scope.launch {
            try {
                // No connection and no on-device AI: keep the photo on this phone and mark it when the connection is back.
                if (!online && device != app.redpen.teacher.DeviceModel.State.Ready) {
                    val sid = Repo.createSubmission(a.id, label, app.redpen.teacher.data.Queued(mode, page))
                    withContext(Dispatchers.IO) { Repo.saveCrop(ctx, sid, Repo.PHOTO_KEY, photo) }
                    queuedFor = label; pupil = ""
                    return@launch
                }
                status = if (sheetMode) "Finding the answer boxes…" else "Reading the page…"
                val sid = Repo.createSubmission(a.id, label)
                when (val outcome = MarkSubmission.mark(ctx, a, mode, photo, page, sid, label) { p ->
                    if (p.crops.isNotEmpty()) crops = p.crops
                    marks = p.marks
                    status = if (p.marks.size < p.total) "Marking ${p.marks.size + 1} of ${p.total}…" else status
                }) {
                    is MarkSubmission.Outcome.Failed -> status = outcome.reason
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
    val input = rememberPhotoInput(onPhoto = ::markPhoto, onError = { status = it })

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(horizontal = 16.dp).padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                ModeOption(sheetMode, "Printed REDPEN sheet", "Names never leave the device · works fully offline") { sheetMode = true }
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
                Text(if (sheetMode) "Keep all four black corner squares in the photo." else "Make sure every question number and answer is visible.",
                    color = RP.InkSoft, fontSize = 13.sp)
            }
        }
        status?.let { item { Text(it, fontFamily = if (it.startsWith("Total")) RP.Display else RP.Hand, fontWeight = FontWeight.Bold,
            fontSize = if (it.startsWith("Total")) 30.sp else 24.sp, color = if (it.startsWith("Total")) RP.Ink else RP.InkSoft, modifier = Modifier.padding(horizontal = 16.dp)) } }
        queuedFor?.let { who ->
            item {
                Paper(borderColor = RP.Flag) {
                    Text("Saved for marking: $who", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                    Text("You’re offline and this phone can’t read handwriting without a connection. The photo stays on this phone and REDPEN marks it automatically as soon as you’re back online. Keep photographing the rest of the class.",
                        color = RP.InkSoft, fontSize = 14.sp)
                }
            }
        }
        if (queue.waiting.isNotEmpty()) item { QueuePanel(queue, online) }
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

/**
 * The offline queue: photos taken offline on a phone without on-device AI are saved on the phone and marked here
 * automatically once the connection is back. Runs while the assignment is open (any tab).
 */
@Composable
fun rememberMarkingQueue(a: Assignment, submissions: List<Submission>): QueueState {
    val ctx = LocalContext.current
    val online by Connectivity.online.collectAsState()
    var current by remember { mutableStateOf<Submission?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val waiting = submissions.filter { it.queued != null }
    LaunchedEffect(online, waiting.joinToString(",") { it.id }) {
        if (!online) return@LaunchedEffect
        for (s in waiting) {
            val q = s.queued ?: continue
            val photo = withContext(Dispatchers.IO) { Repo.loadCrop(ctx, s.id, Repo.PHOTO_KEY) } ?: continue // taken on another device
            current = s
            try {
                when (val outcome = MarkSubmission.mark(ctx, a, q.mode, photo, q.page, s.id, s.pupil)) {
                    is MarkSubmission.Outcome.Ok -> { Repo.finishQueued(a.id, s.id, outcome.marks); error = null }
                    is MarkSubmission.Outcome.Failed -> error = "${s.pupil}: ${outcome.reason}"
                }
            } catch (e: Exception) {
                error = "${s.pupil}: ${Repo.friendly(e)}"; break // connection probably dropped again; retry later
            }
        }
        current = null
    }
    return QueueState(waiting, current, error)
}

@Composable
private fun QueuePanel(queue: QueueState, online: Boolean) {
    Paper {
        Text("${queue.waiting.size} waiting to be marked", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp)
        Text(queue.current?.let { "Marking ${it.pupil} now…" } ?: if (online) "Starting…" else "They will be marked automatically when you’re back online.",
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
fun ReviewTab(a: Assignment, submissions: List<Submission>) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by Connectivity.online.collectAsState()
    var checking by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val pending = submissions.flatMap { s -> s.marks.filter { it.needsCheck() }.map { s to it } }

    suspend fun cloudCheck() {
        error = null
        var done = 0
        for (s in submissions) {
            if (s.marks.none { it.needsCheck() }) continue
            val pagePhoto = withContext(Dispatchers.IO) { Repo.loadCrop(ctx, s.id, Repo.PAGE_KEY) }
            val next = if (pagePhoto != null) {
                checking = "Checking ${s.pupil}’s page…"
                runCatching { Marker.verifyPage(a.scheme.questions, pagePhoto, s.marks) }.getOrElse { error = Repo.friendly(it); s.marks }
            } else s.marks.map { m ->
                val question = a.scheme.questions.firstOrNull { it.q == m.q }
                val crop = withContext(Dispatchers.IO) { Repo.loadCrop(ctx, s.id, m.q) }
                if (question == null || crop == null || !m.needsCheck()) m
                else { done++; checking = "Checking $done/${pending.size}…"; runCatching { Marker.verify(question, crop, m) }.getOrElse { error = Repo.friendly(it); m } }
            }
            if (next != s.marks) Repo.saveMarks(a.id, s.id, next)
        }
        checking = null
    }

    // Back online with provisional on-device marks? Verify them automatically.
    LaunchedEffect(online, pending.count { it.second.status == MarkStatus.PROVISIONAL }) {
        if (online && checking == null && pending.any { it.second.status == MarkStatus.PROVISIONAL }) cloudCheck()
    }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("${pending.size} answers to check", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp, modifier = Modifier.weight(1f))
                PenButton(checking ?: if (online) "Check with the cloud" else "Runs when online", { scope.launch { cloudCheck() } },
                    enabled = online && checking == null && pending.isNotEmpty())
            }
        }
        item { ErrorText(error) }
        if (pending.isEmpty()) item { Text("All marks are verified or reviewed. ✓", fontFamily = RP.Hand, fontSize = 26.sp, color = RP.InkSoft, modifier = Modifier.padding(horizontal = 16.dp)) }
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
                    if (widened != null) TextButton(onClick = {
                        Repo.updateQuestion(a, widened)
                        Repo.saveMarks(a.id, s.id, s.marks.map { x -> if (x.q == m.q) x.copy(awarded = x.max, status = MarkStatus.REVIEWED, engine = MarkEngine.TEACHER, reasons = x.reasons + "Teacher accepted “${m.read}” for everyone.") else x })
                    }) { Text("Accept “${m.read.take(30)}” for everyone") }
                }
            }
        }
        item { Spacer(Modifier.height(40.dp)) }
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
                    a.scheme.questions.forEach { Cell("Q${it.q} /${it.max}", 54, header = true) }
                    Cell("Total /$max", 70, header = true); Cell("Status", 86, header = true); Cell("Teacher’s comment", 200, header = true); Cell("", 92, header = true)
                }
                rows.forEach { r ->
                    Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
                        Cell(r.submission.pupil, 130, bold = true, onClick = { editing = r.submission to "pupil" })
                        r.scores.forEachIndexed { i, v -> Cell(v?.toString() ?: "–", 54, hand = true, red = v != null && v < a.scheme.questions[i].max) }
                        Cell("${r.total}", 70, hand = true, red = true)
                        Cell(if (r.submission.queued != null) "Waiting" else if (r.unchecked > 0) "${r.unchecked} to check" else "Final", 86, small = true)
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
                    Text("Q${q.q}", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 22.sp, modifier = Modifier.width(52.dp))
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
