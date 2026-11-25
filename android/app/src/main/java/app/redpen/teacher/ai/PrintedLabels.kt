package app.redpen.teacher.ai

import app.redpen.teacher.domain.Question

// Reads the question labels printed in a typed marking guide ("1.", "6(a)", "(b)(i)" under 6, "9."), so the answer
// key's questions and labels come from the teacher's own text, not from whichever cloud model answered (same as web).

private val ROMAN = setOf("i", "ii", "iii", "iv", "v", "vi", "vii", "viii")
private val NUMBERED = Regex("""^(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*(?:[.)]\s*)?((?:\(\s*[a-z]\s*\))?(?:\(\s*[ivx]+\s*\))?)\s*[.):]?(?:\s+(\S+)|\s*$)""", RegexOption.IGNORE_CASE)
private val LETTERED = Regex("""^\(\s*([a-z]{1,4})\s*\)\s*((?:\(\s*[ivx]+\s*\))?)\s*\S""", RegexOption.IGNORE_CASE)
/** "2 marks for the method", "10 m is the height": a number followed by a unit, not a question. */
private val NOT_A_QUESTION = Regex("""^(marks?|m|cm|mm|km|kg|%|×|x)$""", RegexOption.IGNORE_CASE)

private fun clean(sub: String) = sub.replace(Regex("""\s+"""), "").lowercase()

private data class LabelLine(val label: String, val line: Int)

/** Every label line in the text, with the line it starts on (headings with parts under them still included). */
private fun labelLines(text: String): List<LabelLine> {
    val found = mutableListOf<LabelLine>()
    var num: Int? = null
    var letter: String? = null
    text.lines().forEachIndexed { index, raw ->
        val line = raw.trim()
        val numbered = NUMBERED.find(line)
        if (numbered != null && !NOT_A_QUESTION.matches(numbered.groupValues[3])) {
            val n = numbered.groupValues[1].toInt()
            val sub = clean(numbered.groupValues[2])
            if (num == null || n == num!! + 1 || (n == num && sub.isNotEmpty())) {
                num = n
                letter = Regex("""^\(([a-z])\)""").find(sub)?.groupValues?.get(1)
                found += LabelLine("$n$sub", index)
                return@forEachIndexed
            }
        }
        val lettered = if (num != null) LETTERED.find(line) else null
        if (lettered != null) {
            val token = lettered.groupValues[1].lowercase()
            val roman = clean(lettered.groupValues[2])
            if (letter != null && token in ROMAN && !(token == "i" && letter == "h")) found += LabelLine("$num($letter)($token)", index)
            else if (token.length == 1) { letter = token; found += LabelLine("$num($token)$roman", index) }
        }
    }
    return found
}

/** The printed labels in order, or empty when the text does not look like a numbered list of questions. */
fun printedLabels(text: String): List<String> {
    val labels = labelLines(text).map { it.label }
    // A heading such as "6." or "6(b)" with parts printed under it is not a question of its own.
    val kept = labels.filterIndexed { i, l -> labels.drop(i + 1).none { it.startsWith("$l(") } }
    return if (kept.size >= 2 && kept.toSet().size == kept.size) kept else emptyList()
}

/** Each printed question's own text in the guide: from its label line up to the next label line (same as web). */
fun printedSections(text: String): Map<String, String> {
    val lines = text.lines()
    val all = labelLines(text)
    val kept = printedLabels(text).toSet()
    val sections = LinkedHashMap<String, String>()
    all.forEachIndexed { i, x ->
        if (x.label in kept) sections[x.label] = lines.subList(x.line, all.getOrNull(i + 1)?.line ?: lines.size).joinToString(" ").trim()
    }
    return sections
}

private val CALCULATION = Regex("""\b(calculat\w*|find|work out|determine|how (?:much|many|far|long|fast))\b""", RegexOption.IGNORE_CASE)
private val STATED_ANSWER = Regex("""\banswer\s*[:=]?\s*(.+?)(?=\s*\(|;|\.\s|\.$|$)""", RegexOption.IGNORE_CASE)
private val ACCEPTED = Regex("""\baccept\s+([^)]+)\)""", RegexOption.IGNORE_CASE)
private val ANSWER_WORD = Regex("""^\s*(?:the\s+)?(?:correct\s+|final\s+)?answers?\s*[:=(]?\s*""", RegexOption.IGNORE_CASE)

/** The numbers a guide states as the answer to a calculation, or empty when it is not one (same as web). */
fun statedAnswers(section: String): List<Double> {
    if (!CALCULATION.containsMatchIn(section)) return emptyList()
    val stated = STATED_ANSWER.find(section)?.groupValues?.get(1) ?: return emptyList()
    val value = app.redpen.teacher.marking.parseNumericAnswer(stated).value ?: return emptyList()
    val extra = ACCEPTED.findAll(section).flatMap { it.groupValues[1].split(Regex("""\bor\b|,(?!\d{3})""")) }
        .mapNotNull { app.redpen.teacher.marking.parseNumericAnswer(it).value }
    return (listOf(value) + extra).distinct()
}

/**
 * The teacher's guide decides which questions are calculations: a question whose guide text calculates and states a
 * numeric answer is marked as a number with those answers, whatever type the model chose (same as web).
 */
fun pinCalculations(questions: List<Question>, sections: Map<String, String>): List<Question> = questions.map { q ->
    val answers = statedAnswers(sections[q.label ?: q.q.toString()] ?: "")
    when {
        answers.isEmpty() || q is Question.Objective -> q
        q is Question.Numeric -> q.copy(accept = (q.accept + answers).distinct())
        else -> {
            val said = if (q is Question.Points) q.points else (q as Question.Short).accept
            fun isAnswer(p: String): Boolean {
                val v = app.redpen.teacher.marking.parseNumericAnswer(p.replace(ANSWER_WORD, "")).value ?: return false
                return answers.any { Math.abs(it - v) <= 1e-9 * maxOf(1.0, Math.abs(it)) }
            }
            val steps = app.redpen.teacher.marking.workingSteps(said).filterNot(::isAnswer)
            Question.Numeric(q.q, q.prompt, q.max, answers, methodPoints = if (steps.isNotEmpty() && q.max > 1) steps else emptyList(), label = q.label)
        }
    }
}

fun printedLabelsNote(labels: List<String>) =
    "This marking guide has exactly ${labels.size} questions. Return exactly ${labels.size} items, numbered q = 1 to ${labels.size} in this order, " +
        "with these printed labels in \"label\": ${labels.joinToString(", ") { "\"$it\"" }}."

private fun renumber(q: Question, n: Int, label: String?): Question = when (q) {
    is Question.Objective -> q.copy(q = n, label = label)
    is Question.Numeric -> q.copy(q = n, label = label)
    is Question.Short -> q.copy(q = n, label = label)
    is Question.Points -> q.copy(q = n, label = label)
}

/** Puts the printed labels on the drafted questions; a short draft keeps the matching ones and names the rest. */
fun alignToPrinted(questions: List<Question>, labels: List<String>): Pair<List<Question>, List<Int>> {
    fun relabel(q: Question, i: Int) = renumber(q, i + 1, labels[i].takeIf { it != (i + 1).toString() })
    if (questions.size == labels.size) return questions.mapIndexed { i, q -> relabel(q, i) } to emptyList()
    fun norm(l: String?) = (l ?: "").replace(Regex("""\s+"""), "").lowercase()
    val byLabel = questions.associateBy { norm(it.label ?: it.q.toString()) }
    val found = mutableListOf<Question>()
    val missing = mutableListOf<Int>()
    labels.forEachIndexed { i, l -> byLabel[norm(l)]?.let { found += relabel(it, i) } ?: missing.add(i + 1) }
    return found to missing
}
