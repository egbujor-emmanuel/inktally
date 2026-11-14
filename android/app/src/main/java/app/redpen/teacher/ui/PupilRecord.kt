package app.redpen.teacher.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
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
import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Repo
import app.redpen.teacher.data.Submission
import app.redpen.teacher.domain.Profile
import app.redpen.teacher.domain.total
import app.redpen.teacher.scan.Render
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** One student's record after marking: the teacher's comment plus the marked copy with letterhead. Same as web PupilRecord. */
@Composable
fun PupilRecord(a: Assignment, s: Submission, profile: Profile, fresh: Bitmap? = null) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    var comment by remember(s.id) { mutableStateOf(s.comment) }
    var savedNote by remember { mutableStateOf(false) }
    LaunchedEffect(s.comment) { if (comment.isBlank()) comment = s.comment }
    val dirty = comment.trim() != s.comment.trim()

    val raw by produceState<Bitmap?>(fresh, s.id, fresh) { value = fresh ?: withContext(Dispatchers.IO) { Repo.loadCrop(ctx, s.id, Repo.MARKED_KEY) } }
    val info = Render.Letterhead(profile, a.title, a.className, s.pupil, s.marks.total(), a.maxTotal, s.comment)
    val lettered by produceState<Bitmap?>(null, raw, info) { value = raw?.let { r -> withContext(Dispatchers.Default) { runCatching { Render.withLetterhead(ctx, r, info) }.getOrDefault(r) } } }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Paper {
            Text("Comment for ${s.pupil}", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 20.sp)
            Field(comment, { comment = it; savedNote = false }, "Teacher’s comment", placeholder = "e.g. Good work on fractions — revise past tenses before Friday.",
                singleLine = false, minLines = 3, maxLength = Repo.COMMENT_LIMIT)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GhostButton("Save comment", { Repo.updateSubmission(a.id, s.id, comment = comment); savedNote = true }, enabled = dirty)
                Text("${comment.length}/${Repo.COMMENT_LIMIT}", color = RP.InkSoft, fontSize = 12.sp, modifier = Modifier.padding(top = 14.dp))
            }
            if (savedNote && !dirty) Text("Saved. It is on the marked copy and in the Excel register.", color = RP.InkSoft, fontSize = 13.sp)
        }
        when {
            raw == null -> Text("The marked copy image stays on the phone that marked this student (photos are never uploaded). The comment and scores are saved to your account.",
                color = RP.InkSoft, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp))
            lettered != null -> Paper {
                Text("ready to hand back", fontFamily = RP.Hand, fontSize = 20.sp, color = RP.Pen)
                Text("Marked copy for ${s.pupil}", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                Image(lettered!!.asImageBitmap(), "Marked copy of ${s.pupil}'s work", Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth)
                Text("The student’s own work with every tick, cross and score — print it or send it to the parent. On the original paper, just write the total.",
                    color = RP.InkSoft, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    PenButton("Share", { scope.launch {
                        val f = withContext(Dispatchers.IO) { Render.savePng(ctx, lettered!!, "${s.pupil}-marked") }
                        shareFile(ctx, f, "image/png", "${s.pupil} — marked by REDPEN")
                    } }, Modifier.weight(1f))
                    GhostButton("Print", { printBitmap(ctx, lettered!!, "${s.pupil} marked copy") }, Modifier.weight(1f))
                }
            }
            else -> Busy("Preparing the marked copy…")
        }
    }
}
