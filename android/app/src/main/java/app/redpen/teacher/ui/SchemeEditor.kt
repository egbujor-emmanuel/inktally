package app.redpen.teacher.ui

import androidx.compose.foundation.layout.widthIn
import app.redpen.teacher.domain.shownLabel
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.domain.Question

private val TYPES = listOf("objective" to "Multiple choice", "numeric" to "Number", "short" to "Word / phrase", "points" to "Theory (points)")

private fun typeOf(q: Question) = when (q) { is Question.Objective -> "objective"; is Question.Numeric -> "numeric"; is Question.Short -> "short"; is Question.Points -> "points" }

/** Converts a question to another type, keeping number, prompt and marks (mirrors web retype). */
private fun retype(q: Question, type: String): Question = when (type) {
    "objective" -> Question.Objective(q.q, q.prompt, q.max, listOf("A"), q.label)
    "numeric" -> Question.Numeric(q.q, q.prompt, q.max, listOf(0.0), label = q.label)
    "points" -> Question.Points(q.q, q.prompt, q.max, listOf(""), label = q.label)
    else -> Question.Short(q.q, q.prompt, q.max, listOf(""), label = q.label)
}

private fun Question.withBase(prompt: String = this.prompt, max: Int = this.max, q: Int = this.q, label: String? = this.label): Question = when (this) {
    is Question.Objective -> copy(q = q, prompt = prompt, max = max, label = label)
    is Question.Numeric -> copy(q = q, prompt = prompt, max = max, label = label)
    is Question.Short -> copy(q = q, prompt = prompt, max = max, label = label)
    is Question.Points -> copy(q = q, prompt = prompt, max = max, label = label)
}

private fun lines(s: String) = s.split(Regex("\n|;")).map { it.trim() }.filter { it.isNotEmpty() }
private fun numberOf(s: String) = s.replace(Regex("[,₦\$£€\\s]"), "").toDoubleOrNull()
private fun fmt(d: Double) = if (d % 1.0 == 0.0) d.toLong().toString() else d.toString()

/** Keeps the raw text while typing (so "27," is not reformatted mid-word) and reports parsed values. */
@Composable
private fun ListField(key: Any, initial: String, label: String, minLines: Int = 1, numeric: Boolean = false, onParsed: (String) -> Unit) {
    var raw by remember(key) { mutableStateOf(initial) }
    androidx.compose.material3.OutlinedTextField(
        raw, { raw = it; onParsed(it) }, label = { Text(label) }, minLines = minLines, singleLine = minLines == 1,
        keyboardOptions = if (numeric) KeyboardOptions(keyboardType = KeyboardType.Text) else KeyboardOptions.Default,
        colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(focusedContainerColor = Color.White, unfocusedContainerColor = Color.White),
        modifier = Modifier.fillMaxWidth(),
    )
}

/**
 * Edit the answer key: type, question, marks and accepted answers per question. Same fields as the web editor.
 * [locked]: students are already marked, so questions can't be added, removed or change type (printed sheets would no longer match).
 */
@Composable
fun SchemeEditor(questions: List<Question>, locked: Boolean = false, onChange: (List<Question>) -> Unit) {
    fun update(next: Question) = onChange(questions.map { if (it.q == next.q) next else it })
    fun remove(n: Int) = onChange(questions.filter { it.q != n }.mapIndexed { i, q -> q.withBase(q = i + 1) })
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        questions.forEach { q ->
            val type = typeOf(q)
            Paper {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(q.shownLabel, fontFamily = RP.Hand, fontSize = 36.sp, color = RP.Pen, modifier = Modifier.widthIn(min = 40.dp).padding(end = 4.dp))
                    ListField("p-${q.q}-$type-${questions.size}", q.prompt, "Question") { update(q.withBase(prompt = it)) }
                }
                if (locked) Text(TYPES.firstOrNull { it.first == type }?.second ?: "", fontSize = 13.sp, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, color = RP.InkSoft)
                else FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TYPES.forEach { (t, label) ->
                        FilterChip(selected = type == t, onClick = { if (type != t) update(retype(q, t)) }, label = { Text(label, fontSize = 13.sp) },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = RP.Ink, selectedLabelColor = Color.White))
                    }
                }
                ListField("lb-${q.q}-${questions.size}", q.label ?: "", "Number as printed (optional, e.g. 6(a))") { v ->
                    update(q.withBase(label = v.trim().take(16).ifEmpty { null }))
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Marks", fontSize = 14.sp)
                    TextButton(onClick = { update(q.withBase(max = (q.max - 1).coerceAtLeast(1))) }) { Text("–", fontSize = 20.sp) }
                    Text("${q.max}", fontFamily = RP.Hand, fontSize = 28.sp, color = RP.Pen)
                    TextButton(onClick = { update(q.withBase(max = (q.max + 1).coerceAtMost(20))) }) { Text("+", fontSize = 20.sp) }
                    androidx.compose.foundation.layout.Spacer(Modifier.weight(1f))
                    if (!locked) TextButton(onClick = { remove(q.q) }) { Text("Remove", color = RP.InkSoft) }
                }
                when (q) {
                    is Question.Objective -> ListField("o-${q.q}-${questions.size}", q.correct.joinToString(", "), "Correct letter(s)") { v ->
                        update(q.copy(correct = v.uppercase().split(Regex("[,\\s]+")).filter { it.isNotEmpty() }))
                    }
                    is Question.Numeric -> {
                        ListField("n-${q.q}-${questions.size}", q.accept.joinToString("; ") { fmt(it) }, "Accepted answer(s), separated by ;", numeric = true) { v ->
                            update(q.copy(accept = lines(v).mapNotNull(::numberOf)))
                        }
                        // Once sheets are printed, a question keeps (or keeps not having) method marks: its box size depends on it.
                        if (!locked || q.methodPoints.isNotEmpty()) {
                            ListField("nm-${q.q}-${questions.size}", q.methodPoints.joinToString("\n"), "Method marks — for working when the answer is wrong (one per line)", minLines = 2) { v ->
                                val m = lines(v)
                                if (!(locked && m.isEmpty())) update(q.copy(methodPoints = m))
                            }
                        }
                    }
                    is Question.Short -> {
                        ListField("sa-${q.q}-${questions.size}", q.accept.joinToString("\n"), "Accept (one per line)", minLines = 2) { update(q.copy(accept = lines(it))) }
                        ListField("sr-${q.q}-${questions.size}", q.reject.joinToString("\n"), "Do not accept", minLines = 2) { update(q.copy(reject = lines(it))) }
                    }
                    is Question.Points -> {
                        ListField("pp-${q.q}-${questions.size}", q.points.joinToString("\n"), "Marking points — 1 mark each (one per line)", minLines = 3) { update(q.copy(points = lines(it))) }
                        ListField("pr-${q.q}-${questions.size}", q.reject.joinToString("\n"), "Do not accept", minLines = 2) { update(q.copy(reject = lines(it))) }
                    }
                }
            }
        }
        if (!locked) GhostButton("+ Add question", { onChange(questions + Question.Short(questions.size + 1, "", 1, listOf(""))) }, Modifier.padding(horizontal = 16.dp))
    }
}

/** A question is usable once it has at least one answer to mark against. */
fun Question.isComplete(): Boolean = when (this) {
    is Question.Objective -> correct.isNotEmpty()
    is Question.Numeric -> accept.isNotEmpty()
    is Question.Short -> accept.any { it.isNotBlank() }
    is Question.Points -> points.any { it.isNotBlank() }
}
