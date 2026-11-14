package app.redpen.teacher.ai

// Subject and level of an assignment (pure, unit-tested). Same rules and wording as web/src/ai/scheme.ts.

/** Asks the model to name the subject and level so an untouched form never prints the wrong ones. */
const val DETECT_LABELS_NOTE = "Also return \"subject\" and \"level\": the subject and the class or level this paper is for, as short labels " +
    "(for example \"Mathematics\", \"JSS 2\"). Use an empty string for either one if the paper does not show it."

private const val MAX_LABEL = 60
private val LABEL_BREAKERS = Regex("""[<>"]""")
private val LABEL_SPACES = Regex("""\s+""")

private fun cleanLabel(text: String?) = (text ?: "").replace(LABEL_BREAKERS, " ").replace(LABEL_SPACES, " ").trim().take(MAX_LABEL)

/** What the teacher typed wins; otherwise what the paper says; otherwise a neutral label (never a made-up subject). */
fun resolveLabels(typedSubject: String, typedLevel: String, detectedSubject: String? = null, detectedLevel: String? = null): Pair<String, String> =
    (cleanLabel(typedSubject).ifEmpty { cleanLabel(detectedSubject) }.ifEmpty { "General" }) to
        cleanLabel(typedLevel).ifEmpty { cleanLabel(detectedLevel) }
