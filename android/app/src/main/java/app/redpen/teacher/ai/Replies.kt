package app.redpen.teacher.ai

// Strict parsing of model replies that decide marks (pure, unit-tested).

private val PRESENT_FIELD = Regex(""""present"\s*:\s*(true|false)""", RegexOption.IGNORE_CASE)
private val BARE_YES = Regex("""^(true|yes)\b""", RegexOption.IGNORE_CASE)
private val BARE_NO = Regex("""^(false|no)\b""", RegexOption.IGNORE_CASE)

/**
 * The yes/no answer of one marking-point check. Accepts {"present": true|false} (cloud, or on-device honouring the
 * schema) or a bare true/false/yes/no (on-device models may ignore the schema). Anything else — "The answer does not
 * mention…" — throws, so the answer is flagged for the teacher instead of being given or denied credit by guesswork.
 * Same rule as web points.ts.
 */
fun parsePresent(raw: String): Boolean {
    val text = raw.trim().removePrefix("```json").removePrefix("```").removeSuffix("```").trim()
    PRESENT_FIELD.find(text)?.let { return it.groupValues[1].equals("true", ignoreCase = true) }
    if (text.startsWith("{")) throw IllegalStateException("The marking-point check did not give a yes/no answer.")
    if (BARE_YES.containsMatchIn(text)) return true
    if (BARE_NO.containsMatchIn(text)) return false
    throw IllegalStateException("The marking-point check did not give a yes/no answer.")
}
