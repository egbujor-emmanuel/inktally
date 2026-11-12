package app.redpen.teacher.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.data.Repo
import app.redpen.teacher.data.Samples

@Composable
fun HomeScreen(onOpen: (String) -> Unit) {
    val assignments by remember { Repo.assignments() }.collectAsState(initial = null)
    LazyColumn(Modifier.fillMaxSize().padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Column(Modifier.padding(top = 20.dp)) {
                Text("for teachers with 50 exercise books tonight", fontFamily = RP.Hand, fontSize = 22.sp, color = RP.Pen)
                Text("A stack of classwork, marked in minutes. Even offline.", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 36.sp)
            }
        }
        item { Text("Your assignments", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 22.sp, modifier = Modifier.padding(top = 12.dp)) }
        when {
            assignments == null -> item { Text("Loading…", color = RP.InkSoft) }
            assignments!!.isEmpty() -> item { Text("Nothing yet — try a sample below.", color = RP.InkSoft) }
            else -> items(assignments!!, key = { it.id }) { a ->
                PaperCard(onClick = { onOpen(a.id) }) {
                    Text(a.title, fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text("${a.className} · ${a.scheme.subject} · ${a.scheme.questions.size} questions", color = RP.InkSoft, fontSize = 14.sp)
                }
            }
        }
        item { Text("Try a sample", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 22.sp, modifier = Modifier.padding(top = 12.dp)) }
        items(Samples.all, key = { it.title }) { s ->
            PaperCard(onClick = { onOpen(Repo.createAssignment(s.title, s.className, s.scheme)) }) {
                Text(s.title, fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text("${s.className} · ${s.scheme.subject}", color = RP.InkSoft, fontSize = 14.sp)
                Text("Use this →", fontFamily = RP.Hand, fontSize = 20.sp, color = RP.Pen)
            }
        }
        item { Text(" ", modifier = Modifier.padding(bottom = 24.dp)) }
    }
}

@Composable
fun PaperCard(onClick: () -> Unit, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = RP.Paper), border = BorderStroke(1.dp, Color(0xFFE5DECF)),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { content() }
    }
}
