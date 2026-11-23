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

/** The printed labels in order, or empty when the text does not look like a numbered list of questions. */
fun printedLabels(text: String): List<String> {
    val labels = mutableListOf<String>()
    var num: Int? = null
    var letter: String? = null
    for (raw in text.lines()) {
        val line = raw.trim()
        val numbered = NUMBERED.find(line)
        if (numbered != null && !NOT_A_QUESTION.matches(numbered.groupValues[3])) {
            val n = numbered.groupValues[1].toInt()
            val sub = clean(numbered.groupValues[2])
            if (num == null || n == num + 1 || (n == num && sub.isNotEmpty())) {
                num = n
                letter = Regex("""^\(([a-z])\)""").find(sub)?.groupValues?.get(1)
                labels += "$n$sub"
                continue
            }
        }
        val lettered = if (num != null) LETTERED.find(line) else null
        if (lettered != null) {
            val token = lettered.groupValues[1].lowercase()
            val roman = clean(lettered.groupValues[2])
            if (letter != null && token in ROMAN && !(token == "i" && letter == "h")) labels += "$num($letter)($token)"
            else if (token.length == 1) { letter = token; labels += "$num($token)$roman" }
        }
    }
    // A heading such as "6." or "6(b)" with parts printed under it is not a question of its own.
    val kept = labels.filterIndexed { i, l -> labels.drop(i + 1).none { it.startsWith("$l(") } }
    return if (kept.size >= 2 && kept.toSet().size == kept.size) kept else emptyList()
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
