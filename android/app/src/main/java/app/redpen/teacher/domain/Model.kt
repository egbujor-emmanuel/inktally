package app.redpen.teacher.domain

// Mirrors web/src/domain/types.ts so web and Android share one Firestore schema.

enum class ReadSource(val wire: String) { ON_DEVICE("on_device"), IN_CLOUD("in_cloud"), TEACHER("teacher") }
enum class MarkEngine(val wire: String) { CODE("code"), AI_POINTS("ai-points"), AI_PAGE("ai-page"), TEACHER("teacher") }
enum class MarkStatus(val wire: String) { PROVISIONAL("provisional"), VERIFIED("verified"), FLAGGED("flagged"), REVIEWED("reviewed") }

sealed interface Question {
    val q: Int
    val prompt: String
    val max: Int
    /** The question's label as printed, when it is not just the number: "6(a)", "6(b)(ii)" (same as web). */
    val label: String?

    data class Objective(override val q: Int, override val prompt: String, override val max: Int, val correct: List<String>, override val label: String? = null) : Question
    data class Numeric(
        override val q: Int, override val prompt: String, override val max: Int,
        val accept: List<Double>, val tolerance: Double? = null, val methodPoints: List<String> = emptyList(), override val label: String? = null,
    ) : Question
    data class Short(
        override val q: Int, override val prompt: String, override val max: Int,
        val accept: List<String>, val reject: List<String> = emptyList(), val spellingTolerant: Boolean = true, override val label: String? = null,
    ) : Question
    data class Points(
        override val q: Int, override val prompt: String, override val max: Int,
        val points: List<String>, val reject: List<String> = emptyList(), override val label: String? = null,
    ) : Question
}

data class MarkingScheme(val subject: String, val level: String, val questions: List<Question>,
    /** Question numbers a draft could not find (shown to the teacher; never saved). */ val missing: List<Int> = emptyList())

data class Mark(
    val q: Int,
    val read: String,
    val readSource: ReadSource,
    val awarded: Int,
    val max: Int,
    val engine: MarkEngine,
    val status: MarkStatus,
    val reasons: List<String>,
    val pointsFound: List<String> = emptyList(),
    /** The question's printed label ("6(a)"), copied from the question when marked. */
    val label: String? = null,
)

/** How a question or mark is shown to people: its printed label ("6(a)") or else its number (same as web qLabel). */
fun qLabel(q: Int, label: String?) = label?.trim()?.takeIf { it.isNotEmpty() } ?: q.toString()
val Question.shownLabel get() = qLabel(q, label)
val Mark.shownLabel get() = qLabel(q, label)

/** Institution details printed on sheets, marked copies, the register and the Excel file. Same doc as web/src/data/profile.ts. */
data class Profile(val institution: String = "", val details: String = "", val teacher: String = "") {
    val isEmpty get() = institution.isBlank() && details.isBlank() && teacher.isBlank()

    companion object {
        const val INSTITUTION_LIMIT = 120
        const val DETAILS_LIMIT = 240
        const val TEACHER_LIMIT = 80
        private fun clip(s: String, n: Int) = s.replace(Regex("\\s+"), " ").trim().take(n)
        fun clean(institution: String, details: String, teacher: String) =
            Profile(clip(institution, INSTITUTION_LIMIT), clip(details, DETAILS_LIMIT), clip(teacher, TEACHER_LIMIT))
    }
}

fun List<Mark>.total() = sumOf { it.awarded }
fun List<Mark>.maxTotal() = sumOf { it.max }
fun Mark.needsCheck() = status == MarkStatus.PROVISIONAL || status == MarkStatus.FLAGGED

/** The question type as stored in Firestore ("objective" | "numeric" | "short" | "points"), same as web QuestionType. */
val Question.wireType: String get() = when (this) {
    is Question.Objective -> "objective"
    is Question.Numeric -> "numeric"
    is Question.Short -> "short"
    is Question.Points -> "points"
}
