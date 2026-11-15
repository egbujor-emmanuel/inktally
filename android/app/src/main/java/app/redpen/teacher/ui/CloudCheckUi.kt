package app.redpen.teacher.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.Connectivity
import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Repo
import app.redpen.teacher.data.Submission
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.needsCheck
import app.redpen.teacher.marking.CheckSummary
import app.redpen.teacher.marking.CloudCheckRun
import app.redpen.teacher.marking.checkSummaryLead
import app.redpen.teacher.marking.checkSummaryLearned
import app.redpen.teacher.marking.checkSummaryNeedYou
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean

class CloudCheckState(
    /** done / total while a check is running. */
    val progress: Pair<Int, Int>?,
    val error: String?,
    /** Result of the last finished check, shown as "8 on-device marks confirmed, 1 needs you". */
    val summary: CheckSummary?,
    val run: () -> Unit,
)

/**
 * Verifies on-device marks automatically as soon as the phone is online, on whichever assignment tab is open.
 * Each provisional mark is tried once per connection; going offline and back online tries again. Same as web useCloudCheck.
 */
@Composable
fun rememberCloudCheck(a: Assignment, submissions: List<Submission>): CloudCheckState {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by Connectivity.online.collectAsState()
    var progress by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var summary by remember { mutableStateOf<CheckSummary?>(null) }
    var runs by remember { mutableIntStateOf(0) }
    val running = remember { AtomicBoolean(false) }
    val tried = remember { HashSet<String>() }
    val latest = rememberUpdatedState(submissions)
    val assignment = rememberUpdatedState(a)

    val run: () -> Unit = remember {
        {
            if (running.compareAndSet(false, true)) {
                error = null
                for (s in latest.value) for (m in s.marks) if (m.needsCheck()) tried += "${s.id}:${m.q}"
                scope.launch {
                    try {
                        val result = CloudCheckRun.run(ctx, assignment.value, latest.value, latest = { latest.value },
                            onProgress = { done, total -> progress = done to total }, onError = { error = it })
                        if (result.checked > 0) summary = result
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        error = Repo.friendly(e)
                    } finally {
                        running.set(false)
                        progress = null
                        runs++ // re-check: marks may have arrived while this run was busy
                    }
                }
            }
        }
    }

    LaunchedEffect(online) { if (!online) tried.clear() }

    val key = submissions.filter { it.queued == null }.flatMap { s ->
        s.marks.filter { (it.status == MarkStatus.PROVISIONAL || (it.status == MarkStatus.FLAGGED && it.readSource == app.redpen.teacher.domain.ReadSource.ON_DEVICE && it.read.isNotBlank())) && "${s.id}:${it.q}" !in tried }.map { "${s.id}:${it.q}" }
    }.joinToString(",")
    LaunchedEffect(online, key, runs) {
        if (online && key.isNotEmpty() && !running.get()) run()
    }

    return CloudCheckState(progress, error, summary, run)
}

/** The automatic cloud check, visible on every tab: "Cloud check: 8 on-device marks confirmed, 1 needs you." */
@Composable
fun CheckStatus(check: CloudCheckState, onReview: () -> Unit) {
    val progress = check.progress
    val summary = check.summary
    if (progress == null && summary == null) return
    val pulse = rememberInfiniteTransition(label = "check-pulse")
    val dotAlpha by pulse.animateFloat(0.35f, 1f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "check-dot")
    Row(Modifier.fillMaxWidth().padding(top = 4.dp).background(Color.White, RoundedCornerShape(8.dp)).padding(horizontal = 12.dp, vertical = 6.dp)
        .semantics { liveRegion = LiveRegionMode.Polite }, verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.size(8.dp).alpha(if (progress != null) dotAlpha else 1f).background(if (progress != null) RP.Pen else RP.Device, CircleShape))
        Spacer(Modifier.width(8.dp))
        if (progress != null) {
            Text("Back online — the cloud is checking on-device marks (${progress.first}/${progress.second})…", fontSize = 13.sp)
        } else if (summary != null) {
            val text = buildAnnotatedString {
                append(checkSummaryLead(summary))
                if (summary.needTeacher > 0) {
                    append(", ")
                    val style = TextLinkStyles(SpanStyle(color = RP.Pen, fontWeight = FontWeight.SemiBold, textDecoration = TextDecoration.Underline))
                    withLink(LinkAnnotation.Clickable("review", style) { onReview() }) { append(checkSummaryNeedYou(summary)) }
                }
                append(".")
                append(checkSummaryLearned(summary))
            }
            Text(text, fontSize = 13.sp)
        }
    }
}
