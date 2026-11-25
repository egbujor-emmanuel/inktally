package app.redpen.teacher.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.data.Repo
import app.redpen.teacher.domain.Profile

/** Institution details printed on answer sheets, marked copies, the mark register and the Excel file. */
@Composable
fun SchoolScreen(onDone: () -> Unit) {
    val saved by remember { Repo.profile() }.collectAsState(initial = Profile())
    var institution by remember { mutableStateOf("") }
    var details by remember { mutableStateOf("") }
    var teacher by remember { mutableStateOf("") }
    var touched by remember { mutableStateOf(false) }
    var savedNote by remember { mutableStateOf(false) }

    // Adopt the stored profile when it arrives, unless the teacher has started typing.
    LaunchedEffect(saved) { if (!touched) { institution = saved.institution; details = saved.details; teacher = saved.teacher } }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            PageTitle("on every sheet and record", "School details",
                "Your school, college, university department, training centre or tutoring business. It appears on printed answer sheets, marked copies sent to parents, the mark register and the Excel download.")
        }
        item {
            Paper {
                Field(institution, { institution = it; touched = true; savedNote = false }, "Institution name", placeholder = "e.g. Greenfield College", maxLength = Profile.INSTITUTION_LIMIT)
                Field(details, { details = it; touched = true; savedNote = false }, "Details under the name (optional)",
                    placeholder = "Address, phone or email, term or session", singleLine = false, minLines = 2, maxLength = Profile.DETAILS_LIMIT)
                Field(teacher, { teacher = it; touched = true; savedNote = false }, "Teacher or examiner name (optional)", placeholder = "e.g. Mrs A. Okafor", maxLength = Profile.TEACHER_LIMIT)
                PenButton("Save details", {
                    val p = Profile.clean(institution, details, teacher)
                    Repo.saveProfile(p); institution = p.institution; details = p.details; teacher = p.teacher; touched = false; savedNote = true
                }, Modifier.fillMaxWidth())
                if (savedNote) Text("Saved — it will show on sheets, copies and the register.", color = RP.InkSoft, fontSize = 14.sp)
                GhostButton("Back to my assignments", onDone, Modifier.fillMaxWidth())
            }
        }
        item { PrivacyCard() }
        if (institution.isNotBlank() || details.isNotBlank()) item {
            Paper(borderColor = RP.Rule) {
                Text("PREVIEW", fontSize = 11.sp, color = RP.InkSoft, fontWeight = FontWeight.SemiBold)
                Text(institution, fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                if (details.isNotBlank()) Text(details, color = RP.InkSoft, fontSize = 14.sp)
                if (teacher.isNotBlank()) Text("Teacher: $teacher", fontSize = 14.sp)
            }
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
}

/** Same wording as the web PrivacyCard. */
@Composable
private fun PrivacyCard() {
    val on by app.redpen.teacher.ai.Privacy.on.collectAsState()
    Paper {
        Row(Modifier.fillMaxWidth().toggleable(on, role = androidx.compose.ui.semantics.Role.Checkbox) { app.redpen.teacher.ai.Privacy.set(it) },
            verticalAlignment = Alignment.Top) {
            androidx.compose.material3.Checkbox(on, onCheckedChange = null)
            Column(Modifier.padding(start = 8.dp)) {
                Text("Private mode: pupils’ work stays on this device", fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                Text("Every answer is read and marked here by Gemini Nano. No photo, answer or name is sent to any cloud AI, and the cloud check is off, " +
                    "so you confirm uncertain marks yourself. The cloud is used only to draft an answer key from your own question paper or marking guide. " +
                    "Needs Gemini Nano on this device.", color = RP.InkSoft, fontSize = 13.sp)
            }
        }
        Text("With Private mode off, answers also go to Gemini in the cloud for a second reading, which is what lets InkTally mark an answer “Verified”: " +
            "a printed InkTally sheet sends only the cut-out answer boxes, an exercise-book page sends the page. Names you type are never sent to any AI.",
            color = RP.InkSoft, fontSize = 13.sp)
    }
}
