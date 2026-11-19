package app.redpen.teacher.ai

// Subject and level of an assignment (pure, unit-tested). Same rules and wording as web/src/ai/scheme.ts.

/** Asks the model to name the subject and level so an untouched form never prints the wrong ones. */
const val DETECT_LABELS_NOTE = "Also return \"subject\" and \"level\": the subject and the class or level this paper is for, as short labels " +
    "(for example \"Mathematics\", \"JSS 2\"). Use an empty string for either one if the paper does not show it."

/** Marks for working on calculations (WAEC-style partial credit). Same text as web. */
const val METHOD_MARKS_NOTE = "For a calculation worth more than 1 mark, list what earns marks for working in \"methodPoints\" (for example \"uses speed = distance ÷ time\" or \"finds the profit, 9,000\"), one item per mark, never the final answer itself, and put only the final answer in \"acceptNumbers\". When the teacher's scheme gives method marks, copy them exactly."

private const val MAX_LABEL = 60
private val LABEL_BREAKERS = Regex("""[<>"]""")
private val LABEL_SPACES = Regex("""\s+""")

private fun cleanLabel(text: String?) = (text ?: "").replace(LABEL_BREAKERS, " ").replace(LABEL_SPACES, " ").trim().take(MAX_LABEL)

/** What the teacher typed wins; otherwise what the paper says; otherwise a neutral label (never a made-up subject). */
fun resolveLabels(typedSubject: String, typedLevel: String, detectedSubject: String? = null, detectedLevel: String? = null): Pair<String, String> =
    (cleanLabel(typedSubject).ifEmpty { cleanLabel(detectedSubject) }.ifEmpty { "General" }) to
        cleanLabel(typedLevel).ifEmpty { cleanLabel(detectedLevel) }
