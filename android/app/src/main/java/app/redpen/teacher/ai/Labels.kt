package app.redpen.teacher.ai

// Subject and level of an assignment (pure, unit-tested). Same rules and wording as web/src/ai/scheme.ts.

/** Asks the model to name the subject and level so an untouched form never prints the wrong ones. */
const val DETECT_LABELS_NOTE = "Also return \"questionCount\": how many numbered questions the paper or scheme has in total. Also return \"subject\" and \"level\": the subject and the class or level this paper is for, as short labels " +
    "(for example \"Mathematics\", \"JSS 2\"). Use an empty string for either one if the paper does not show it."

/** WAEC-style sub-parts: each part that earns its own marks is its own question, numbered on, with its printed label. Same text as web. */
const val SUBPARTS_NOTE = "Treat every sub-part that earns its own marks as its own question: number them 1, 2, 3 and so on in order in \"q\", and always put the label printed on the paper in \"label\", for every question (for example \"1\", \"6(a)\", \"6(b)(ii)\", \"9\")."

/** Marks for working on calculations (WAEC-style partial credit). Same text as web. */
const val METHOD_MARKS_NOTE = "Method marks: only when the question paper or the teacher’s scheme itself gives a calculation more than 1 mark, list what earns marks for working in \"methodPoints\" (for example \"uses speed = distance ÷ time\" or \"finds the profit, 9,000\"), one item per mark, never the final answer itself, and put only the final answer in \"acceptNumbers\". Never give a question more marks than the paper or scheme shows. When the teacher’s scheme gives method marks, copy them exactly."

/** Question numbers a draft left out: gaps in 1..N, where N is the highest number found or the count the model saw (same as web). */
fun missingQuestions(found: List<Int>, declaredCount: Int = 0): List<Int> {
    val last = minOf(100, maxOf(declaredCount, found.maxOrNull() ?: 0))
    val have = found.toSet()
    return (1..last).filter { it !in have }
}

/** The sentence shown when questions are still missing after the second try (same as web). */
fun missingNotice(missing: List<Any>) =
    "REDPEN could not find question${if (missing.size == 1) "" else "s"} ${missing.joinToString(", ")}. Check the paper, and add ${if (missing.size == 1) "it" else "them"} with \"+ Add question\"."

private val SUBPART = Regex("""^(\d+)\(([a-z])\)""", RegexOption.IGNORE_CASE)

/** Fills in labels the model left out from the questions around them; labels end up unique (same as web inferLabels). */
fun inferLabels(questions: List<app.redpen.teacher.domain.Question>): List<app.redpen.teacher.domain.Question> {
    if (questions.none { it.label?.let { l -> SUBPART.containsMatchIn(l) } == true }) return questions
    val labels = questions.map { it.label }.toMutableList()
    fun lead(l: String?) = l?.let { Regex("""^\d+""").find(it)?.value?.toIntOrNull() }
    for (i in labels.indices) {
        if (labels[i] != null) continue
        val prev = labels.getOrNull(i - 1); val next = labels.getOrNull(i + 1)
        val nextSub = next?.let { SUBPART.find(it) }; val prevSub = prev?.let { SUBPART.find(it) }
        labels[i] = when {
            nextSub != null && nextSub.groupValues[2].equals("b", true) -> "${nextSub.groupValues[1]}(a)"
            prevSub != null && Regex("""^\d+\(a\)$""", RegexOption.IGNORE_CASE).matches(prev) -> "${prevSub.groupValues[1]}(b)"
            lead(prev) != null && (next == null || (lead(next) ?: -99) - lead(prev)!! == 2) -> (lead(prev)!! + 1).toString()
            else -> null
        }
    }
    val seen = mutableSetOf<String>()
    return questions.mapIndexed { i, q ->
        val l = labels[i]?.trim()
        val keep = l != null && l.isNotEmpty() && seen.add(l) && l != q.q.toString()
        withLabel(q, if (keep) l else null)
    }
}

private fun withLabel(q: app.redpen.teacher.domain.Question, label: String?) = when (q) {
    is app.redpen.teacher.domain.Question.Objective -> q.copy(label = label)
    is app.redpen.teacher.domain.Question.Numeric -> q.copy(label = label)
    is app.redpen.teacher.domain.Question.Short -> q.copy(label = label)
    is app.redpen.teacher.domain.Question.Points -> q.copy(label = label)
}

private const val MAX_LABEL = 60
private val LABEL_BREAKERS = Regex("""[<>"]""")
private val LABEL_SPACES = Regex("""\s+""")

private fun cleanLabel(text: String?) = (text ?: "").replace(LABEL_BREAKERS, " ").replace(LABEL_SPACES, " ").trim().take(MAX_LABEL)

/** What the teacher typed wins; otherwise what the paper says; otherwise a neutral label (never a made-up subject). */
fun resolveLabels(typedSubject: String, typedLevel: String, detectedSubject: String? = null, detectedLevel: String? = null): Pair<String, String> =
    (cleanLabel(typedSubject).ifEmpty { cleanLabel(detectedSubject) }.ifEmpty { "General" }) to
        cleanLabel(typedLevel).ifEmpty { cleanLabel(detectedLevel) }
