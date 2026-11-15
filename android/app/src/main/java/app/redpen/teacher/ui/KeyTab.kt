package app.redpen.teacher.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Repo
import app.redpen.teacher.data.Submission
import app.redpen.teacher.marking.remarkAll
import app.redpen.teacher.marking.remarkNotice

/**
 * The saved answer key, editable after saving (same as the web Answer key tab). Once students are marked the questions
 * stay as printed; fixing an answer or a mark re-marks everyone from what REDPEN already read.
 */
@Composable
fun KeyTab(a: Assignment, submissions: List<Submission>) {
    val saved = a.scheme.questions
    var draft by remember { mutableStateOf(saved) }
    var base by remember { mutableStateOf(saved) }
    var version by remember { mutableIntStateOf(0) } // remounts the editor's fields after Undo
    var notice by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    // The saved key can change elsewhere (e.g. "accept for everyone"): follow it unless the teacher is mid-edit.
    if (base != saved) {
        if (draft == base) { draft = saved; version++ }
        base = saved
    }
    val dirty = draft != saved
    val locked = submissions.any { it.marks.isNotEmpty() || it.queued != null }

    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text(if (locked) "Students have been marked, so the questions stay as printed. Fix any answer or mark and REDPEN re-marks everyone from what it already read — no new photos, no new AI reading."
                else "Check the answer key. You can still add or remove questions until marking starts (then reprint the sheets).",
                color = RP.InkSoft, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp))
        }
        item { key(version) { SchemeEditor(draft, locked = locked) { draft = it; notice = null } } }
        item {
            PenButton("Save answer key", {
                if (!draft.all { it.isComplete() }) { error = "Every question needs at least one answer."; return@PenButton }
                error = null
                val result = remarkAll(saved, draft, submissions)
                Repo.saveQuestions(a, draft)
                result.updates.forEach { (sid, marks) -> Repo.saveMarks(a.id, sid, marks) }
                notice = remarkNotice(result.summary)
            }, Modifier.padding(horizontal = 16.dp), enabled = dirty)
        }
        if (dirty) item { GhostButton("Undo changes", { draft = saved; version++; notice = null; error = null }, Modifier.padding(horizontal = 16.dp)) }
        notice?.let { item { Text(it, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp)) } }
        error?.let { item { ErrorText(it) } }
    }
}
