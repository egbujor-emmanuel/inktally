package app.redpen.teacher.marking

// Checks a student's working the way an examiner does before giving a method mark (same as web working.ts).
// Correct arithmetic that still misses the key's answer means a different relationship (50 ÷ 0.4 for v = fλ):
// no method mark. A slip in the arithmetic (50 × 0.4 = 25) does not stop a method mark.

/** The last plain arithmetic step in the working, e.g. "50/0.4" in "v = f/λ = 50/0.4 = 125 m/s". */
fun substitutedArithmetic(read: String): String? {
    val parts = read.split('=').dropLast(1).reversed()
    for (part in parts) {
        val expr = part
            .replace(Regex("""(\d)\s*[x×·*]\s*(?=[\d(])"""), "$1*")
            .replace('÷', '/')
            .replace(Regex("[−–]"), "-")
            .replace(Regex("""(\d),(?=\d{3}\b)"""), "$1")
            .replace(Regex("""\s+"""), "")
        if (Regex("""^[\d.()+\-*/^]+$""").matches(expr) && Regex("""\d[)]*[+\-*/^][(]*[\d.]""").containsMatchIn(expr)) return expr
    }
    return null
}

/** Evaluates + − × ÷ ^ and brackets. Returns null for anything it cannot read. */
fun evaluateArithmetic(expr: String): Double? {
    val tokens = Regex("""\d*\.?\d+|[()+\-*/^]""").findAll(expr).map { it.value }.toList()
    if (tokens.isEmpty() || tokens.joinToString("") != expr) return null
    var i = 0
    fun peek() = tokens.getOrNull(i)
    lateinit var sum: () -> Double
    fun factor(): Double {
        val t = tokens.getOrNull(i++) ?: throw IllegalArgumentException("end")
        if (t == "-") return -factor()
        if (t == "(") { val v = sum(); if (tokens.getOrNull(i++) != ")") throw IllegalArgumentException("bracket"); return v }
        return t.toDoubleOrNull() ?: throw IllegalArgumentException("number")
    }
    fun power(): Double { val b = factor(); return if (peek() == "^") { i++; Math.pow(b, power()) } else b }
    fun product(): Double {
        var v = power()
        while (peek() == "*" || peek() == "/") v = if (tokens[i++] == "*") v * power() else v / power()
        return v
    }
    sum = {
        var v = product()
        while (peek() == "+" || peek() == "-") v = if (tokens[i++] == "+") v + product() else v - product()
        v
    }
    return try { val v = sum(); if (i == tokens.size && v.isFinite()) v else null } catch (e: IllegalArgumentException) { null }
}

private fun close(a: Double, b: Double) = kotlin.math.abs(a - b) <= 1e-6 + 0.005 * kotlin.math.abs(b)

data class Contradiction(val step: String, val value: Double)

/** The working, done correctly, leads to the student's own wrong answer rather than the key's. */
fun workingContradictsKey(read: String, studentValue: Double?, accepted: List<Double>): Contradiction? {
    if (studentValue == null) return null
    val step = substitutedArithmetic(read) ?: return null
    val value = evaluateArithmetic(step) ?: return null
    if (!close(value, studentValue) || accepted.any { close(value, it) }) return null
    return Contradiction(step, value)
}

fun contradictionReason(c: Contradiction): String {
    val shown = java.math.BigDecimal(c.value).round(java.math.MathContext(6)).stripTrailingZeros().toPlainString()
    return "The working ${c.step} = $shown is worked out correctly but does not give the key's answer, so a different formula was used. No method mark — check it."
}
