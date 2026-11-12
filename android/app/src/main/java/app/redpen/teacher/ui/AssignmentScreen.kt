@file:OptIn(com.google.firebase.ai.type.PublicPreviewAPI::class)

package app.redpen.teacher.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Repo
import app.redpen.teacher.data.Submission
import app.redpen.teacher.domain.Profile
import app.redpen.teacher.domain.needsCheck
import app.redpen.teacher.scan.Render
import app.redpen.teacher.scan.SheetLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

val ASSIGNMENT_TABS = listOf("print" to "Print sheets", "mark" to "Mark", "review" to "Review", "register" to "Mark register", "insights" to "Insights")

@Composable
fun AssignmentScreen(id: String, initialTab: String, onDeleted: () -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val assignment by remember(id) { Repo.assignment(id) }.collectAsState(initial = null)
    val submissions by remember(id) { Repo.submissions(id) }.collectAsState(initial = emptyList())
    val profile by remember { Repo.profile() }.collectAsState(initial = Profile())
    var tab by remember { mutableIntStateOf(ASSIGNMENT_TABS.indexOfFirst { it.first == initialTab }.coerceAtLeast(0)) }
    var confirmDelete by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val a = assignment ?: return Busy("Opening…")
    val toCheck = submissions.sumOf { s -> s.marks.count { it.needsCheck() } }

    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Delete “${a.title}”?") },
        text = { Text("This deletes every student's marks for it and the photos on this phone. It cannot be undone.") },
        confirmButton = {
            TextButton(onClick = {
                confirmDelete = false
                scope.launch { runCatching { Repo.deleteAssignment(ctx, a.id) }.onSuccess { onDeleted() }.onFailure { error = Repo.friendly(it) } }
            }) { Text("Delete", color = RP.Pen) }
        },
        dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Cancel") } },
    )

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp).padding(top = 12.dp)) {
            Text("${a.className} · ${a.scheme.subject}", fontFamily = RP.Hand, fontSize = 20.sp, color = RP.Pen)
            Text(a.title, fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 32.sp)
            Text("${submissions.size} student${if (submissions.size == 1) "" else "s"} marked${if (toCheck > 0) " · $toCheck to check" else ""}",
                color = RP.InkSoft, fontSize = 14.sp)
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(onClick = { Repo.setStatus(a.id, if (a.isFinished) "active" else "finished") }) { Text(if (a.isFinished) "Reopen" else "Mark as finished") }
                TextButton(onClick = { confirmDelete = true }) { Text("Delete", color = RP.Pen) }
            }
            ErrorText(error)
        }
        ScrollableTabRow(selectedTabIndex = tab, containerColor = RP.Paper, edgePadding = 12.dp) {
            ASSIGNMENT_TABS.forEachIndexed { i, (_, label) -> Tab(selected = tab == i, onClick = { tab = i }, text = { Text(label) }) }
        }
        when (ASSIGNMENT_TABS[tab].first) {
            "print" -> PrintTab(a, profile)
            "mark" -> MarkTab(a, submissions, profile)
            "review" -> ReviewTab(a, submissions)
            "register" -> RegisterTab(a, submissions, profile, onSchool = { tab = 0 })
            else -> InsightsTab(a, submissions)
        }
    }
}

/** Printable answer sheets: preview on screen, print through Android's print service, or share the PDF. */
@Composable
private fun PrintTab(a: Assignment, profile: Profile) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val pages = remember(a.scheme.questions) { SheetLayout.pages(a.scheme.questions).size }
    var page by remember { mutableIntStateOf(0) }
    val preview by produceState<android.graphics.Bitmap?>(null, a.scheme.questions, profile, page) {
        value = withContext(Dispatchers.Default) { Render.sheetPreview(ctx, a.title, a.className, a.scheme.questions, profile, page.coerceIn(0, pages - 1), 3f) }
    }
    suspend fun pdf() = withContext(Dispatchers.IO) { Render.sheetPdf(ctx, a.title, a.className, a.scheme.questions, profile) }
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(horizontal = 16.dp).padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Print one per student. The black corner squares let REDPEN find every answer box, even offline.", color = RP.InkSoft, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    PenButton("Print", { scope.launch { printPdf(ctx, pdf(), "${a.title} answer sheets") } }, Modifier.weight(1f))
                    GhostButton("Share PDF", { scope.launch { shareFile(ctx, pdf(), "application/pdf", "${a.title} — answer sheets") } }, Modifier.weight(1f))
                }
                Text("No printer? Use “Exercise book page” in the Mark tab — students write in their own books.", color = RP.InkSoft, fontSize = 13.sp)
                if (pages > 1) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (0 until pages).forEach { i -> if (i == page) PenButton("Page ${i + 1}", {}) else GhostButton("Page ${i + 1}", { page = i }) }
                }
            }
        }
        item {
            preview?.let { Image(it.asImageBitmap(), "Answer sheet page ${page + 1} of $pages", Modifier.fillMaxWidth().padding(horizontal = 16.dp).background(Color.White)) }
                ?: Busy("Drawing the sheet…")
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
}

/** Submissions helper shared by tabs. */
fun List<Submission>.find(id: String?) = firstOrNull { it.id == id }
