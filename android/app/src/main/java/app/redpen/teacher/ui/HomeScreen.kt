package app.redpen.teacher.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.data.Repo
import app.redpen.teacher.data.Samples

private val STEPS = listOf(
    Triple("1", "Questions in", "Snap the question paper. The cloud drafts the marking scheme — it never sees a student."),
    Triple("2", "Marks out, offline", "Photograph each answer sheet. Gemini Nano reads the handwriting on this phone; code does the marking."),
    Triple("3", "Checked when online", "Back on data, every on-device mark is double-checked in the cloud. Disagreements come to you."),
)

/** Exercise-book ruling with a red margin line, like the web hero. */
fun Modifier.ruledPaper(): Modifier = drawBehind {
    val gap = 32.dp.toPx()
    var y = gap
    while (y < size.height) {
        drawLine(RP.Rule, Offset(0f, y), Offset(size.width, y), strokeWidth = 1.dp.toPx())
        y += gap
    }
    val margin = 40.dp.toPx()
    drawLine(RP.Margin, Offset(margin, 0f), Offset(margin, size.height), strokeWidth = 1.5.dp.toPx())
}

@Composable
fun HomeScreen(onOpen: (String) -> Unit, onQuick: () -> Unit, onNew: () -> Unit) {
    // Re-subscribe when the account changes (guest -> Google, or sign-out).
    val account by app.redpen.teacher.Account.state.collectAsState()
    val assignments by remember(account.uid) { Repo.assignments() }.collectAsState(initial = null)
    var shelf by remember { mutableIntStateOf(0) }
    val list = assignments
    val active = list?.filter { !it.isFinished } ?: emptyList()
    val finished = list?.filter { it.isFinished } ?: emptyList()
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item {
            Column(Modifier.fillMaxWidth().ruledPaper().padding(start = 52.dp, end = 16.dp, top = 28.dp, bottom = 28.dp)) {
                Text("for anyone with a stack of scripts to mark tonight", fontFamily = RP.Hand, fontSize = 22.sp, color = RP.Pen)
                Text(
                    buildAnnotatedString {
                        append("A stack of classwork, marked in minutes. ")
                        withStyle(SpanStyle(color = RP.Pen)) { append("Even offline.") }
                    },
                    fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 38.sp, lineHeight = 40.sp, color = RP.Ink,
                    modifier = Modifier.padding(top = 4.dp),
                )
                Text(
                    "REDPEN reads students’ handwriting with the AI on your phone and marks it against your marking scheme. " +
                        "Students’ work stays with you; the cloud double-checks every mark when you’re back online.",
                    color = RP.InkSoft, fontSize = 16.sp, lineHeight = 24.sp, modifier = Modifier.padding(top = 14.dp),
                )
                Text("Any subject, any level — schools, colleges and universities, exam centres, training courses and tutors.",
                    color = RP.InkSoft, fontSize = 13.sp, lineHeight = 19.sp, modifier = Modifier.padding(top = 8.dp))
                Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    PenButton("Quick mark a page", onQuick, Modifier.fillMaxWidth())
                    GhostButton("Set up an assignment", onNew, Modifier.fillMaxWidth())
                }
            }
        }
        item {
            LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                items(STEPS, key = { it.first }) { (n, title, body) ->
                    Card(colors = CardDefaults.cardColors(containerColor = RP.Paper), border = BorderStroke(1.dp, RP.Border),
                        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp), shape = RoundedCornerShape(14.dp), modifier = Modifier.width(250.dp)) {
                        Column(Modifier.padding(18.dp)) {
                            Text(n, fontFamily = RP.Hand, fontSize = 40.sp, color = RP.Pen)
                            Text(title, fontFamily = RP.Display, fontWeight = FontWeight.SemiBold, fontSize = 19.sp)
                            Text(body, color = RP.InkSoft, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                }
            }
        }
        item { SectionTitle("Your assignments") }
        item {
            TabRow(selectedTabIndex = shelf, containerColor = RP.Paper, modifier = Modifier.padding(horizontal = 16.dp)) {
                Tab(selected = shelf == 0, onClick = { shelf = 0 }, text = { Text("Active (${active.size})") })
                Tab(selected = shelf == 1, onClick = { shelf = 1 }, text = { Text("Finished (${finished.size})") })
            }
        }
        val shown = if (shelf == 0) active else finished
        when {
            list == null -> item { Text("Loading…", color = RP.InkSoft, modifier = Modifier.padding(horizontal = 16.dp)) }
            shown.isEmpty() -> item {
                Text(if (shelf == 0) "Nothing yet — quick mark a page, set up an assignment, or try a sample below." else "Finished assignments stay saved here.",
                    color = RP.InkSoft, modifier = Modifier.padding(horizontal = 16.dp))
            }
            else -> items(shown, key = { it.id }) { a ->
                PaperCard(onClick = { onOpen(a.id) }, trailingTick = true) {
                    Text(a.title, fontFamily = RP.Display, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                    Text("${a.className} · ${a.scheme.subject} · ${a.scheme.questions.size} questions", color = RP.InkSoft, fontSize = 14.sp)
                }
            }
        }
        item { SectionTitle("Try it with a sample") }
        items(Samples.all, key = { it.title }) { s ->
            PaperCard(onClick = { onOpen(Repo.createAssignment(s.title, s.className, s.scheme)) }) {
                Text(s.title, fontFamily = RP.Display, fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                Text("${s.className} · ${s.scheme.subject}", color = RP.InkSoft, fontSize = 14.sp)
                Text("Use this →", fontFamily = RP.Hand, fontSize = 22.sp, color = RP.Pen, modifier = Modifier.padding(top = 4.dp))
            }
        }
        item { Spacer(Modifier.padding(bottom = 28.dp)) }
    }
}

@Composable
fun SectionTitle(text: String) {
    Text(text, fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 26.sp, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 14.dp))
}

@Composable
fun PaperCard(onClick: () -> Unit, trailingTick: Boolean = false, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = RP.Paper), border = BorderStroke(1.dp, RP.Border),
        elevation = CardDefaults.cardElevation(defaultElevation = 3.dp), shape = RoundedCornerShape(14.dp),
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp).clickable(onClick = onClick)) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) { content() }
            if (trailingTick) TickGlyph()
        }
    }
}
