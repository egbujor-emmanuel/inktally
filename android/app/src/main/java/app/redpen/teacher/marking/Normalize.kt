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

/** Written fractions ("4⅜") become "4 3/8" so the mixed-number rule reads them (same as web normalize.ts). */
private val VULGAR = mapOf(
    '½' to "1/2", '⅓' to "1/3", '⅔' to "2/3", '¼' to "1/4", '¾' to "3/4", '⅕' to "1/5", '⅖' to "2/5", '⅗' to "3/5", '⅘' to "4/5",
    '⅙' to "1/6", '⅚' to "5/6", '⅛' to "1/8", '⅜' to "3/8", '⅝' to "5/8", '⅞' to "7/8",
)
private val VULGAR_CHAR = Regex("""\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])""")

/**
 * A unit after the answer ("50 km/h", "8 g/cm³") is dropped BEFORE look-alike letters are mapped to digits. Multi-letter
 * units may touch the number; one-letter units ("50 s") only count after a space, so "1s" (a misread 15) is never cut short.
 */
private val UNIT = Regex("""(?:\s*(?:ms⁻²|ms⁻¹|ms-2|ms-1|m s⁻²|m s⁻¹|m\/s\/s|n\/m²|n\/m2|n\/m\^2|nm⁻²|kg\/m²|joules?|newtons?|watts?|volts?|amperes?|amps?|ohms?|Ω|khz|hz|kpa|kj|kw|mj|g\/cm\^3|kg\/m\^3|cm\^3|cm\^2|m\^3|m\^2|m\/s\^2|km\/hr?|kmh|kph|m\/s²|m\/s2|m\/s|ms-1|g\/cm³|g\/cm3|kg\/m³|kg\/m3|cm³|cm3|cm²|cm2|m³|m²|mm|cm|km|kg|mg|ml|litres?|liters?|secs?|seconds?|mins?|minutes?|hrs?|hours?|°c|°f|°|pa|units?)|(?:m|h|n|j|w|v|a|k)|\s+(?:s|g|l))\.?\s*$""", RegexOption.IGNORE_CASE)

/** Superscript/subscript digits and the fraction slash ("4³/₈") become ordinary "4 3/8" (same as web normalize.ts). */
private val SMALL_DIGITS = Regex("""([0-9])?([⁰¹²³⁴⁵⁶⁷⁸⁹]+)\s*[/⁄]\s*([₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+)""")
private fun plainDigits(s: String) = s.map { c -> "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c).takeIf { it >= 0 }?.digitToChar() ?: "₀₁₂₃₄₅₆₇₈₉".indexOf(c).takeIf { it >= 0 }?.digitToChar() ?: c }.joinToString("")

/** Standard form: "1.0 × 10^5", "6.02 x 10²³", "2.5×10⁻³", "1e5" (after any unit has been dropped). Same as web. */
private val STANDARD_FORM = Regex("""^\s*(-?\d+(?:\.\d+)?)\s*(?:[x×*·]\s*10\s*(?:\^|\*\*)?\s*([-−⁻+]?[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]+)|[eE]([-+]?\d+))\s*$""")
private fun standardForm(text: String): Double? {
    val m = STANDARD_FORM.find(text) ?: return null
    val exp = (m.groupValues[2].ifEmpty { m.groupValues[3] }).replace('−', '-').replace('⁻', '-')
        .map { c -> "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c).takeIf { it >= 0 }?.digitToChar() ?: c }.joinToString("")
    val value = m.groupValues[1].toDouble() * Math.pow(10.0, exp.toDouble())
    return if (value.isFinite()) "%.12g".format(java.util.Locale.ROOT, value).toDouble() else null
}

/** Any other unit after the number ("4 ms− 2", "20m− 1"), only when it has a letter that is not a digit look-alike (same as web). */
private val UNIT_TAIL = Regex("""^(\s*-?[\d.,]+(?:\s*[x×*·]\s*10\s*(?:\^|\*\*)?\s*[-−⁻+]?[0-9⁰¹²³⁴⁵⁶⁷⁸⁹]+)?)\s*(?![x×*·]\s*10|[eE][-+]?\d)([A-Za-zΩ°µ][A-Za-zΩ°µ/^⁻⁰¹²³⁴⁵⁶⁷⁸⁹0-9\s.−-]*)$""")
private val NOT_LOOKALIKE = Regex("""[^OoDlIi|!ZzSsBgqбБОо\s\d.−-]""")
private fun dropUnitTail(text: String): String {
    val m = UNIT_TAIL.find(text) ?: return text
    return if (NOT_LOOKALIKE.containsMatchIn(m.groupValues[2])) m.groupValues[1] else text
}

fun parseNumericAnswer(raw: String): NumericParse {
    val hasEquals = raw.contains('=')
    val lastPart = (if (hasEquals) raw.substring(raw.lastIndexOf('=') + 1) else raw).replace(SMALL_DIGITS) { m ->
        val whole = m.groupValues[1]
        (if (whole.isNotEmpty()) "$whole " else "") + plainDigits(m.groupValues[2]) + "/" + plainDigits(m.groupValues[3])
    }
    val afterEquals = dropUnitTail(lastPart.replace(UNIT, "")).replace(VULGAR_CHAR) { m -> " " + VULGAR.getValue(m.groupValues[1][0]) }
    val signAfterEquals = hasEquals && Regex("""^\s*[-−–]""").containsMatchIn(afterEquals)
    standardForm(afterEquals.replace(",", ""))?.let { return NumericParse(it, true, signAfterEquals) }
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

/** Method marks are for working: an entry that is just "the answer" is not one (same as web workingSteps). */
private val ANSWER_ONLY = Regex("""^(the\s+)?(correct\s+|final\s+)?answers?\b[\s.:()0-9a-z-]*$""", RegexOption.IGNORE_CASE)
fun workingSteps(points: List<String>): List<String> = points.map { it.trim() }.filter { it.isNotEmpty() && !ANSWER_ONLY.matches(it) }

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
