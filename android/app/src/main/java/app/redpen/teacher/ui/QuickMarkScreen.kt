@file:OptIn(com.google.firebase.ai.type.PublicPreviewAPI::class)

package app.redpen.teacher.ui

import android.graphics.Bitmap
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.Connectivity
import app.redpen.teacher.ai.Ai
import app.redpen.teacher.data.Repo
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkingScheme
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.maxTotal
import app.redpen.teacher.domain.total
import app.redpen.teacher.marking.Marker
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private sealed interface QuickStep {
    data object Snap : QuickStep
    data object Drafting : QuickStep
    data class Confirm(val questions: List<Question>) : QuickStep
    data object Marking : QuickStep
    data class Done(val assignmentId: String, val marks: List<Mark>) : QuickStep
}

/**
 * Quick mark: one photo of a student's page (questions visible) -> the cloud drafts the answer key from the QUESTIONS
 * -> the teacher confirms it -> code marks the page. The key is saved so the rest of the class can be marked with it.
 */
@Composable
fun QuickMarkScreen(onOpenAssignment: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by Connectivity.online.collectAsState()
    var subject by remember { mutableStateOf("Mathematics") }
    var level by remember { mutableStateOf("Grade 6") }
    var pupil by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<Bitmap?>(null) }
    var step by remember { mutableStateOf<QuickStep>(QuickStep.Snap) }
    var error by remember { mutableStateOf<String?>(null) }

    val input = rememberPhotoInput(onPhoto = { bmp ->
        photo = bmp; error = null; step = QuickStep.Drafting
        scope.launch {
            runCatching { Ai.draftScheme(listOf(bmp), null, subject, level, isStudentPage = true) }
                .onSuccess { step = QuickStep.Confirm(it.questions) }
                .onFailure { error = Repo.friendly(it); step = QuickStep.Snap }
        }
    }, onError = { error = it })

    fun confirm(questions: List<Question>) {
        val page = photo ?: return
        val usable = questions.filter { it.isComplete() }
        if (usable.isEmpty()) { error = "Add at least one question with an answer."; return }
        step = QuickStep.Marking
        scope.launch {
            try {
                val today = SimpleDateFormat("d MMM", Locale.getDefault()).format(Date())
                val aid = Repo.createAssignment("Quick mark — $subject, $today", level, MarkingScheme(subject, level, usable))
                val sid = Repo.createSubmission(aid, pupil.ifBlank { "Student" })
                withContext(Dispatchers.IO) { Repo.saveCrop(ctx, sid, Repo.PAGE_KEY, page) }
                val marks = Marker.markPage(usable, page)
                Repo.saveMarks(aid, sid, marks)
                step = QuickStep.Done(aid, marks)
            } catch (e: Exception) {
                error = Repo.friendly(e); step = QuickStep.Confirm(questions)
            }
        }
    }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { PageTitle("no preparation needed", "Quick mark", "Photograph one student’s page with the questions on it. REDPEN works out the answers from the questions, you check them in seconds, then it marks the page. The answer key is saved so you can mark the rest of the class.") }
        if (step == QuickStep.Snap) item {
            Paper {
                Field(subject, { subject = it }, "Subject")
                LevelField(level) { level = it }
                Field(pupil, { pupil = it }, "Student", placeholder = "Name or number")
                if (online) PhotoButtons(input, "Photograph the page") else Text("Quick mark needs internet (the cloud writes the answer key).", color = RP.Pen)
            }
        }
        item { ErrorText(error) }
        photo?.takeIf { step != QuickStep.Snap }?.let { bmp ->
            item { Image(bmp.asImageBitmap(), "The student's page", Modifier.fillMaxWidth().heightIn(max = 260.dp).padding(horizontal = 16.dp), contentScale = ContentScale.Fit) }
        }
        when (val s = step) {
            QuickStep.Drafting -> item { Busy("Working out the answers from the questions…") }
            is QuickStep.Confirm -> {
                item {
                    Paper(borderColor = RP.Flag) {
                        Text("Does this answer key look right?", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                        Text("REDPEN worked these answers out from the questions. Every mark depends on them, so fix anything that is wrong.", color = RP.InkSoft, fontSize = 14.sp)
                    }
                }
                item {
                    var edited by remember(s) { mutableStateOf(s.questions) }
                    androidx.compose.foundation.layout.Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        SchemeEditor(edited) { edited = it }
                        PenButton("Looks right — mark it", { confirm(edited) }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), enabled = edited.isNotEmpty())
                    }
                }
            }
            QuickStep.Marking -> item { Busy("Marking the page…") }
            is QuickStep.Done -> {
                item {
                    Text("Total: ${s.marks.total()}/${s.marks.maxTotal()}", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 30.sp,
                        modifier = Modifier.padding(horizontal = 16.dp))
                }
                items(s.marks, key = { it.q }) { androidx.compose.foundation.layout.Box(Modifier.padding(horizontal = 16.dp)) { MarkCard(it, null) } }
                item {
                    androidx.compose.foundation.layout.Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        PenButton("Mark the rest of the class with this key", { onOpenAssignment(s.assignmentId) }, Modifier.fillMaxWidth())
                        GhostButton("Quick mark another page", { step = QuickStep.Snap; photo = null; pupil = "" }, Modifier.fillMaxWidth())
                    }
                }
            }
            QuickStep.Snap -> {}
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
}
