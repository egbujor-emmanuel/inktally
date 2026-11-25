package app.redpen.teacher.marking

// Checks a student's working the way an examiner does before giving a method mark (same as web working.ts).
// A step worked out correctly but with different operations from the guide's formula is a different relationship
// (50 ÷ 0.4 for v = fλ; 4 × 2 where the resistances add): no method mark. The same operations with one wrong number
// (10 × 1000 × 1 for P = hρg) is a substitution slip, and so is an arithmetic slip (50 × 0.4 = 25).

/** Turns one side of an "=" into plain arithmetic (2 × 10 -> 2*10), or null when it is not plain arithmetic. */
private fun asArithmetic(part: String): String? {
    val expr = part
        .replace(Regex("""(\d)\s*[xX×·*]\s*(?=[\d(])"""), "$1*")
        .replace('÷', '/')
        .replace(Regex("[−–]"), "-")
        .replace(Regex("""(\d),(?=\d{3}\b)"""), "$1")
        .replace(Regex("""\s+"""), "")
    return if (Regex("""^[\d.()+\-*/^]+$""").matches(expr) && Regex("""\d[)]*[+\-*/^][(]*[\d.]""").containsMatchIn(expr)) expr else null
}

/** The last plain arithmetic step in the working, e.g. "50/0.4" in "v = f/λ = 50/0.4 = 125 m/s". */
fun substitutedArithmetic(read: String): String? =
    read.split('=').dropLast(1).reversed().firstNotNullOfOrNull { asArithmetic(it) }

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

/**
 * The operations a formula or a line of working uses, as a sorted string of "+", "-" and "/". Multiplication and powers
 * are left out because written formulas leave them implicit (hρg, ½at²), and ½ or 1/2 is a number, not a division.
 */
fun operationSignature(text: String): String {
    val t = text
        .replace(Regex("""\b1\s*/\s*2\b"""), "½")
        .replace('÷', '/')
        .replace(Regex("[−–]"), " - ")
        .replace(Regex("""(^|[(+\-*/^=]\s*)-"""), "$1")
    val ops = sortedSetOf<String>()
    if ('+' in t) ops += "+"
    if ('/' in t) ops += "/"
    if (Regex("""(\s-\s|[\d)²³]\s*-\s*[\d(a-zA-Zα-ω]|[a-zA-Zα-ω]\s+-|-\s+[a-zA-Zα-ω(])""").containsMatchIn(t)) ops += "-"
    return ops.joinToString("")
}

/** The operation signatures of the formulas a marking guide accepts as method ("v = fλ", "4 + 2 = 6 Ω, or I = V ÷ R"). */
private fun acceptedSignatures(methodPoints: List<String>): Set<String> =
    methodPoints.flatMap { it.split(Regex("""\bor\b|;""", RegexOption.IGNORE_CASE)) }
        .filter { Regex("""[=+÷/×]|\s[−–-]\s""").containsMatchIn(it) }
        .map(::operationSignature).toSet()

private fun close(a: Double, b: Double) = kotlin.math.abs(a - b) <= 1e-6 + 0.005 * kotlin.math.abs(b)

/** The number a step claims to give: the leading number (or arithmetic) of the next side of the "=". */
private fun claimedResult(next: String): Double? {
    asArithmetic(next)?.let { return evaluateArithmetic(it) }
    return Regex("""^[\d,]*\.?\d+""").find(next.trim())?.value?.replace(",", "")?.toDoubleOrNull()
}

data class Contradiction(val step: String, val value: Double)

/**
 * A step of the working that is worked out correctly but does not follow the guide's formula. With the guide's method
 * formulas every correct step is checked for the formula's operations; without them only the last step is checked
 * (correct arithmetic landing on the student's own wrong answer).
 */
fun workingContradictsKey(read: String, studentValue: Double?, accepted: List<Double>, methodPoints: List<String> = emptyList()): Contradiction? {
    if (studentValue == null) return null
    val signatures = acceptedSignatures(methodPoints)
    val sides = read.split('=')
    for (i in 0 until sides.size - 1) {
        val step = asArithmetic(sides[i]) ?: continue
        val isLast = sides.subList(i + 1, sides.size - 1).none { asArithmetic(it) != null }
        if (signatures.isEmpty() && !isLast) continue
        val value = evaluateArithmetic(step) ?: continue
        val claimed = (if (isLast) studentValue else claimedResult(sides[i + 1])) ?: continue
        if (!close(value, claimed)) continue // an arithmetic slip, not a different formula
        if (accepted.any { close(value, it) }) continue
        if (signatures.isEmpty() || operationSignature(step) !in signatures) return Contradiction(step, value)
    }
    return null
}

fun contradictionReason(c: Contradiction): String {
    val shown = java.math.BigDecimal(c.value).round(java.math.MathContext(6)).stripTrailingZeros().toPlainString()
    return "The working ${c.step} = $shown is worked out correctly but does not follow the marking guide's formula, so a different formula was used. No method mark — check it."
}
