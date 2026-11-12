package app.redpen.teacher.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import app.redpen.teacher.Connectivity
import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Repo
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.marking.Marker
import app.redpen.teacher.scan.Scanner
import app.redpen.teacher.scan.SheetLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
fun AssignmentScreen(id: String) {
    val assignment by remember(id) { Repo.assignment(id) }.collectAsState(initial = null)
    var tab by remember { mutableIntStateOf(0) }
    val a = assignment ?: return Text("Loading…", Modifier.padding(16.dp), color = RP.InkSoft)
    androidx.compose.foundation.layout.Column(Modifier.fillMaxSize()) {
        Text("${a.className} · ${a.scheme.subject}", fontFamily = RP.Hand, fontSize = 20.sp, color = RP.Pen, modifier = Modifier.padding(start = 16.dp, top = 12.dp))
        Text(a.title, fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 26.sp, modifier = Modifier.padding(horizontal = 16.dp))
        TabRow(selectedTabIndex = tab, containerColor = RP.Paper) {
            Tab(selected = tab == 0, onClick = { tab = 0 }, text = { Text("Mark") })
            Tab(selected = tab == 1, onClick = { tab = 1 }, text = { Text("Review") })
        }
        if (tab == 0) MarkTab(a) else ReviewTab(a)
    }
}

/** Decodes the camera photo at a sensible size and applies EXIF rotation. */
private fun loadPhoto(ctx: Context, uri: Uri): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    ctx.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2600) sample *= 2
    val bmp = ctx.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }!!
    val rotation = ctx.contentResolver.openInputStream(uri).use { ExifInterface(it!!).rotationDegrees }
    return if (rotation == 0) bmp else Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
}

private fun failed(q: Int, max: Int, e: Throwable) = Mark(q, "", ReadSource.ON_DEVICE, 0, max, MarkEngine.CODE, MarkStatus.FLAGGED,
    listOf("Could not read this answer (${e.message}). Check it by hand or retry when online."))

@Composable
private fun MarkTab(a: Assignment) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var pupil by remember { mutableStateOf("") }
    var status by remember { mutableStateOf<String?>(null) }
    var marks by remember { mutableStateOf<List<Mark>>(emptyList()) }
    var crops by remember { mutableStateOf<Map<Int, Bitmap>>(emptyMap()) }
    var busy by remember { mutableStateOf(false) }
    val photoFile = remember { File(ctx.cacheDir, "sheet.jpg") }
    val photoUri = remember { FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", photoFile) }

    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (!ok) return@rememberLauncherForActivityResult
        busy = true; marks = emptyList(); status = "Finding the answer boxes…"
        scope.launch {
            try {
                val photo = withContext(Dispatchers.Default) { loadPhoto(ctx, photoUri) }
                val boxes = SheetLayout.pages(a.scheme.questions).first()
                when (val scan = withContext(Dispatchers.Default) { Scanner.scan(photo, boxes) }) {
                    is Scanner.Result.Failed -> status = scan.reason
                    is Scanner.Result.Ok -> {
                        crops = scan.crops
                        val sid = Repo.createSubmission(a.id, pupil.ifBlank { "Pupil" })
                        val collected = mutableListOf<Mark>()
                        for ((q, crop) in scan.crops) {
                            val question = a.scheme.questions.first { it.q == q }
                            withContext(Dispatchers.IO) { Repo.saveCrop(ctx, sid, q, crop) }
                            status = "Marking ${collected.size + 1} of ${scan.crops.size}…"
                            collected += runCatching { Marker.mark(question, crop) }.getOrElse { failed(q, question.max, it) }
                            marks = collected.toList()
                            Repo.saveMarks(a.id, sid, collected)
                        }
                        status = "Total: ${collected.sumOf { it.awarded }}/${collected.sumOf { it.max }}"
                        pupil = ""
                    }
                }
            } catch (e: Exception) {
                status = "Something went wrong: ${e.message}"
            } finally { busy = false }
        }
    }

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            OutlinedTextField(pupil, { pupil = it }, label = { Text("Pupil name or number") }, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 12.dp))
            Button(onClick = { camera.launch(photoUri) }, enabled = !busy, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Text(if (busy) "Marking…" else "Photograph answer sheet")
            }
            Text("Print the sheets from the REDPEN website. The black corner squares let the phone find every answer box — even offline.", color = RP.InkSoft, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp))
        }
        status?.let { item { Text(it, fontFamily = RP.Hand, fontSize = 28.sp, color = if (it.startsWith("Total")) RP.Pen else RP.InkSoft) } }
        items(marks, key = { it.q }) { MarkCard(it, crops[it.q]) }
    }
}

@Composable
private fun ReviewTab(a: Assignment) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val submissions by remember(a.id) { Repo.submissions(a.id) }.collectAsState(initial = emptyList())
    val online by Connectivity.online.collectAsState()
    var checking by remember { mutableStateOf<String?>(null) }
    val pending = submissions.flatMap { s -> s.marks.filter { it.status == MarkStatus.PROVISIONAL || it.status == MarkStatus.FLAGGED }.map { s to it } }

    suspend fun cloudCheck() {
        var done = 0
        for (s in submissions) {
            val next = s.marks.map { m ->
                val question = a.scheme.questions.firstOrNull { it.q == m.q }
                val crop = withContext(Dispatchers.IO) { Repo.loadCrop(ctx, s.id, m.q) }
                if (question == null || crop == null || (m.status != MarkStatus.PROVISIONAL && m.status != MarkStatus.FLAGGED)) m
                else runCatching { Marker.verify(question, crop, m) }.getOrDefault(m).also { done++; checking = "Checking $done/${pending.size}…" }
            }
            if (next != s.marks) Repo.saveMarks(a.id, s.id, next)
        }
        checking = null
    }

    // Back online with provisional on-device marks? Verify them automatically.
    LaunchedEffect(online, pending.count { it.second.status == MarkStatus.PROVISIONAL }) {
        if (online && checking == null && pending.any { it.second.status == MarkStatus.PROVISIONAL }) cloudCheck()
    }

    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${pending.size} to check", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp)
                Button(onClick = { scope.launch { cloudCheck() } }, enabled = online && checking == null && pending.isNotEmpty()) {
                    Text(checking ?: if (online) "Check with the cloud" else "Runs when online")
                }
            }
        }
        if (pending.isEmpty()) item { Text("All marks are verified or reviewed. ✓", fontFamily = RP.Hand, fontSize = 26.sp, color = RP.InkSoft) }
        items(pending, key = { "${it.first.id}:${it.second.q}" }) { (s, m) ->
            MarkCard(m, Repo.loadCrop(ctx, s.id, m.q)) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(s.pupil, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 10.dp))
                    (0..m.max).forEach { n ->
                        OutlinedButton(onClick = {
                            Repo.saveMarks(a.id, s.id, s.marks.map { x -> if (x.q == m.q) x.copy(awarded = n, status = MarkStatus.REVIEWED, engine = MarkEngine.TEACHER, reasons = x.reasons + "Teacher set $n/${x.max}.") else x })
                        }) { Text("$n") }
                    }
                }
            }
        }
    }
}
