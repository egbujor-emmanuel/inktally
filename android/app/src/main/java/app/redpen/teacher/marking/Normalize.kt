package app.redpen.teacher.marking

// Kotlin port of web/src/marking/normalize.ts. Conservative: ambiguity is reported, never silently fixed.

private val DIGIT_LOOKALIKES = mapOf(
    'б' to '6', 'Б' to '6', 'O' to '0', 'o' to '0', 'О' to '0', 'о' to '0', 'D' to '0',
    'l' to '1', 'I' to '1', '|' to '1', 'i' to '1', '!' to '1',
    'Z' to '2', 'z' to '2', 'S' to '5', 's' to '5', 'B' to '8', 'g' to '9', 'q' to '9',
    '٠' to '0', '١' to '1', '٢' to '2', '٣' to '3', '٤' to '4', '٥' to '5', '٦' to '6', '٧' to '7', '٨' to '8', '٩' to '9',
)

/** Same whitespace set as JavaScript's \s (incl. no-break and thin spaces), so both platforms parse identically. */
internal const val WS = "\\s\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"

data class NumericParse(val value: Double?, val clean: Boolean, val signAfterEquals: Boolean)

// "#" before a number is how many Nigerian teachers and pupils write ₦ (same as web normalize.ts).
private val CURRENCY_AND_SPACING = Regex("[₦$£€,$WS]|(?<![a-zA-Z])N(?=\\d)|#(?=\\d)", RegexOption.IGNORE_CASE)

fun parseNumericAnswer(raw: String): NumericParse {
    val hasEquals = raw.contains('=')
    val afterEquals = if (hasEquals) raw.substring(raw.lastIndexOf('=') + 1) else raw
    val signAfterEquals = hasEquals && Regex("""^\s*[-−–]""").containsMatchIn(afterEquals)
    var clean = true
    val mapped = afterEquals.map { ch -> DIGIT_LOOKALIKES[ch]?.also { clean = false } ?: ch }.joinToString("")
    val compact = mapped.replace('−', '-').replace('–', '-').trim()

    Regex("^(-?\\d+)[$WS]+(\\d+)/(\\d+)$").find(compact)?.let { m ->
        val whole = m.groupValues[1].toDouble()
        val frac = m.groupValues[2].toDouble() / m.groupValues[3].toDouble()
        return NumericParse(if (whole < 0) whole - frac else whole + frac, clean, signAfterEquals)
    }
    val stripped = compact.replace(CURRENCY_AND_SPACING, "")
    Regex("""^(-?\d+)/(\d+)$""").find(stripped)?.let { m ->
        val den = m.groupValues[2].toDouble()
        if (den != 0.0) return NumericParse(m.groupValues[1].toDouble() / den, clean, signAfterEquals)
    }
    if (Regex("""^-?\d+(\.\d+)?%?$""").matches(stripped)) {
        return NumericParse(stripped.removeSuffix("%").toDouble(), clean, signAfterEquals)
    }
    return NumericParse(null, clean, signAfterEquals)
}

fun normalizeOptionLetter(raw: String): String? {
    val withoutLabel = raw.replace(Regex("""^\s*Q?\d+\s*[:.)-]?\s*""", RegexOption.IGNORE_CASE), "")
    val letters = Regex("""\b[A-E]\b""").findAll(withoutLabel.uppercase()).map { it.value }.toSet()
    return letters.singleOrNull()
}

private fun levenshtein(a: String, b: String): Int {
    val prev = IntArray(b.length + 1) { it }
    for (i in 1..a.length) {
        var diag = prev[0]
        prev[0] = i
        for (j in 1..b.length) {
            val temp = prev[j]
            prev[j] = minOf(prev[j] + 1, prev[j - 1] + 1, diag + if (a[i - 1] == b[j - 1]) 0 else 1)
            diag = temp
        }
    }
    return prev[b.length]
}

private fun canonical(s: String) = s.lowercase().replace(Regex("[^a-z0-9 ]"), "").replace(Regex("\\s+"), " ").trim()

fun textSimilarity(a: String, b: String): Double {
    val x = canonical(a)
    val y = canonical(b)
    if (x.isEmpty() && y.isEmpty()) return 1.0
    return 1.0 - levenshtein(x, y).toDouble() / maxOf(x.length, y.length)
}
