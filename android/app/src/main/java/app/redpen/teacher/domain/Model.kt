package app.redpen.teacher.domain

// Mirrors web/src/domain/types.ts so web and Android share one Firestore schema.

enum class ReadSource(val wire: String) { ON_DEVICE("on_device"), IN_CLOUD("in_cloud"), TEACHER("teacher") }
enum class MarkEngine(val wire: String) { CODE("code"), AI_POINTS("ai-points"), AI_PAGE("ai-page"), TEACHER("teacher") }
enum class MarkStatus(val wire: String) { PROVISIONAL("provisional"), VERIFIED("verified"), FLAGGED("flagged"), REVIEWED("reviewed") }

sealed interface Question {
    val q: Int
    val prompt: String
    val max: Int

    data class Objective(override val q: Int, override val prompt: String, override val max: Int, val correct: List<String>) : Question
    data class Numeric(
        override val q: Int, override val prompt: String, override val max: Int,
        val accept: List<Double>, val tolerance: Double? = null, val methodPoints: List<String> = emptyList(),
    ) : Question
    data class Short(
        override val q: Int, override val prompt: String, override val max: Int,
        val accept: List<String>, val reject: List<String> = emptyList(), val spellingTolerant: Boolean = true,
    ) : Question
    data class Points(
        override val q: Int, override val prompt: String, override val max: Int,
        val points: List<String>, val reject: List<String> = emptyList(),
    ) : Question
}

data class MarkingScheme(val subject: String, val level: String, val questions: List<Question>)

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
)
