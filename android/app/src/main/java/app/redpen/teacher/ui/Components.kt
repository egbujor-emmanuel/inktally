package app.redpen.teacher.ui

import app.redpen.teacher.domain.shownLabel
import android.graphics.Bitmap
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.Connectivity
import app.redpen.teacher.DeviceModel
import app.redpen.teacher.ai.Telemetry
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.marking.statusLabel
import kotlinx.coroutines.launch

@Composable
fun Pill(label: String, colour: Color) {
    Text(label, color = colour, fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
        modifier = Modifier.border(BorderStroke(1.dp, colour), RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp))
}

/** A red-pen tick / cross / half / query that draws itself, like a teacher marking a book. */
@Composable
fun MarkGlyph(mark: Mark, size: Int = 40) {
    val kind = when {
        mark.status == MarkStatus.FLAGGED -> "query"
        mark.awarded == mark.max -> "tick"
        mark.awarded > 0 -> "half"
        else -> "cross"
    }
    val progress = remember(mark) { Animatable(0f) }
    LaunchedEffect(mark) { progress.animateTo(1f, tween(450)) }
    val colour = if (kind == "query") RP.Flag else RP.Pen
    Canvas(Modifier.size(size.dp).semantics { contentDescription = if (kind == "query") "Needs checking" else "${mark.awarded} of ${mark.max}" }) {
        val s = this.size.width / 56f
        val strokes = when (kind) {
            "tick" -> listOf(listOf(6f to 30f, 20f to 44f, 50f to 10f))
            "cross" -> listOf(listOf(10f to 10f, 46f to 46f), listOf(46f to 10f, 10f to 46f))
            "half" -> listOf(listOf(6f to 30f, 20f to 44f, 50f to 10f), listOf(30f to 44f, 44f to 30f))
            else -> listOf(listOf(18f to 16f, 28f to 8f, 40f to 16f, 28f to 30f, 28f to 36f), listOf(28f to 46f, 28f to 47f))
        }
        strokes.forEach { pts ->
            val path = Path().apply { moveTo(pts[0].first * s, pts[0].second * s); pts.drop(1).forEach { lineTo(it.first * s, it.second * s) } }
            val measure = PathMeasure().apply { setPath(path, false) }
            val partial = Path(); measure.getSegment(0f, measure.length * progress.value, partial, true)
            drawPath(partial, colour, style = Stroke(width = 6f * s, cap = StrokeCap.Round))
        }
    }
}

/** Static red tick for list rows. */
@Composable
fun TickGlyph(size: Int = 30) {
    Canvas(Modifier.size(size.dp)) {
        val s = this.size.width / 56f
        val path = Path().apply { moveTo(6f * s, 30f * s); lineTo(20f * s, 44f * s); lineTo(50f * s, 10f * s) }
        drawPath(path, RP.Pen, style = Stroke(width = 6f * s, cap = StrokeCap.Round))
    }
}

@Composable
fun MarkCard(mark: Mark, crop: Bitmap?, extra: @Composable () -> Unit = {}) {
    Card(colors = CardDefaults.cardColors(containerColor = RP.Paper), border = BorderStroke(1.dp, Color(0xFFE5DECF)), modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Q${mark.shownLabel}", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                Spacer(Modifier.weight(1f))
                MarkGlyph(mark)
                Text("${mark.awarded}/${mark.max}", fontFamily = RP.Hand, fontSize = 30.sp, color = RP.Pen)
            }
            crop?.let { Image(it.asImageBitmap(), "Pupil's handwriting for question ${mark.q}", Modifier.fillMaxWidth().height(60.dp).background(Color.White)) }
            Text("AI read: “${mark.read.ifBlank { "—" }}”", color = RP.InkSoft, fontSize = 14.sp)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                when (mark.readSource) {
                    ReadSource.ON_DEVICE -> Pill("On-device", RP.Device)
                    ReadSource.IN_CLOUD -> Pill("Cloud", RP.Cloud)
                    ReadSource.TEACHER -> Pill("Teacher", RP.Ink)
                }
                Pill(if (mark.engine.wire == "code") "Marked by code" else if (mark.engine.wire == "ai-points") "Point check" else "Teacher", RP.InkSoft)
                // "Verified" only when two readings agreed; a single cloud reading is "Cloud read" (marking/StatusLabel.kt).
                Pill(statusLabel(mark), when (mark.status) {
                    MarkStatus.PROVISIONAL -> RP.InkSoft
                    MarkStatus.VERIFIED -> RP.Device
                    MarkStatus.FLAGGED -> RP.Flag
                    MarkStatus.REVIEWED -> RP.Ink
                })
            }
            Text(mark.reasons.joinToString(" "), fontSize = 14.sp)
            extra()
        }
    }
}

@Composable
private fun Chip(text: String, dot: Color? = null, colour: Color = RP.InkSoft) {
    Row(Modifier.border(BorderStroke(1.dp, RP.Border), RoundedCornerShape(50)).background(Color.White, RoundedCornerShape(50))
        .padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        if (dot != null) { Spacer(Modifier.size(7.dp).background(dot, CircleShape)); Spacer(Modifier.width(6.dp)) }
        Text(text, fontSize = 12.sp, color = colour, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun StatusStrip(trailing: @Composable () -> Unit = {}) {
    val online by Connectivity.online.collectAsState()
    val device by DeviceModel.state.collectAsState()
    val counts by Telemetry.counts.collectAsState()
    val scope = rememberCoroutineScope()
    val deviceText = when (val d = device) {
        DeviceModel.State.Checking -> "Checking on-device AI…"
        DeviceModel.State.Ready -> "Gemini Nano ready"
        DeviceModel.State.Unavailable -> "Cloud AI (no on-device model)"
        DeviceModel.State.Downloadable -> "Gemini Nano not downloaded"
        is DeviceModel.State.Downloading -> "Downloading Gemini Nano… ${d.bytes / 1_000_000} MB"
        is DeviceModel.State.Failed -> d.message
    }
    Column(Modifier.fillMaxWidth().background(RP.Paper).padding(vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        // One swipeable line so the header stays short on phones.
        Row(Modifier.horizontalScroll(androidx.compose.foundation.rememberScrollState()).padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Chip(if (online) "Online" else if (device == DeviceModel.State.Ready) "Offline — marking on this device" else "Offline — marked when back online",
                dot = if (online) RP.Device else RP.Flag, colour = RP.Ink)
            Chip(deviceText, dot = if (device == DeviceModel.State.Ready) RP.Device else RP.Cloud)
            val total = (counts[ReadSource.ON_DEVICE] ?: 0) + (counts[ReadSource.IN_CLOUD] ?: 0)
            if (total > 0) Chip("${counts[ReadSource.ON_DEVICE]} on-device · ${counts[ReadSource.IN_CLOUD]} cloud", colour = RP.Ink)
            trailing()
        }
        if (device == DeviceModel.State.Downloadable) Button(modifier = Modifier.padding(horizontal = 16.dp), onClick = { scope.launch { DeviceModel.download() } }) { Text("Download on-device AI") }
    }
}

/** Guests are nudged to save their work; signed-in teachers see who they are. */
@Composable
fun AccountChip() {
    val account by app.redpen.teacher.Account.state.collectAsState()
    val activity = androidx.compose.ui.platform.LocalContext.current as android.app.Activity
    val scope = rememberCoroutineScope()
    var note by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }
    Column(horizontalAlignment = Alignment.End) {
        if (account.isGuest) {
            androidx.compose.material3.OutlinedButton(onClick = {
                scope.launch {
                    note = runCatching { app.redpen.teacher.Account.signInWithGoogle(activity) }.fold(
                        onSuccess = { r -> when (r) {
                            app.redpen.teacher.Account.Result.Linked -> "Saved to your Google account"
                            app.redpen.teacher.Account.Result.Switched -> "Signed in to your account"
                            app.redpen.teacher.Account.Result.Cancelled -> null
                        } },
                        onFailure = { "Sign-in failed: ${it.message}" },
                    )
                }
            }) { Text("Save my work", fontSize = 13.sp) }
        } else {
            Text(account.label, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = RP.Ink)
            Text("Sign out", fontSize = 12.sp, color = RP.InkSoft, modifier = Modifier.clickable { scope.launch { app.redpen.teacher.Account.signOutToGuest() } })
        }
        note?.let { Text(it, fontSize = 11.sp, color = RP.InkSoft) }
    }
}
