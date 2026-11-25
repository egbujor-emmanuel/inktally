package app.redpen.teacher.ai

import java.util.concurrent.ConcurrentHashMap

/**
 * Quota-aware routing across cloud models: same rules as web/src/ai/models.ts. Pure (no Firebase) so it is unit-tested.
 * Every request carries the name of the model it used into [handleModelError], so concurrent requests never blame
 * the wrong model (there is no shared "last model").
 */
class ModelRouting(
    private val readModel: () -> String,
    private val fallbackModels: () -> List<String>,
    private val now: () -> Long = { System.currentTimeMillis() },
) {
    private companion object {
        val QUOTA = Regex("quota|RESOURCE_EXHAUSTED|\\b429\\b|rate.?limit", RegexOption.IGNORE_CASE)
        val UNSUPPORTED_THINKING = Regex("thinking.*not supported", RegexOption.IGNORE_CASE)
        val DAILY = Regex("per ?day|PerDay|daily", RegexOption.IGNORE_CASE)
        const val RATE_LIMIT_MS = 60_000L
        const val DAILY_QUOTA_MS = 12 * 3_600_000L
        /** "High demand" from one model: give it a minute and send requests to the next model meanwhile (25 Nov). */
        val OVERLOADED = Regex("high demand|overloaded|\\b503\\b|UNAVAILABLE", RegexOption.IGNORE_CASE)
        const val BUSY_MS = 60_000L
    }

    /** Model -> time (ms) until which it is skipped. Rate limits expire in a minute, daily quotas in hours. */
    private val exhausted = ConcurrentHashMap<String, Long>()
    private val noThinking: MutableSet<String> = ConcurrentHashMap.newKeySet()
    /** Model -> time (ms) until which it is skipped because it answered "high demand". */
    private val busy = ConcurrentHashMap<String, Long>()

    fun isExhausted(model: String) = (exhausted[model] ?: 0L) > now()
    fun isBusy(model: String) = (busy[model] ?: 0L) > now()
    fun thinkingAllowed(model: String) = model !in noThinking

    private fun chain(primary: String) = (listOf(primary) + fallbackModels()).map { it.trim() }.filter { it.isNotEmpty() }

    /** Primary cloud model, then the Remote Config fallbacks, skipping any whose quota is used up or that is overloaded right now. */
    fun activeCloudModel(primary: String = readModel()): String =
        chain(primary).firstOrNull { !isExhausted(it) && !isBusy(it) } ?: chain(primary).firstOrNull { !isExhausted(it) } ?: primary

    /**
     * Decides whether a request that failed on [model] should be retried. Unattributed errors never switch models.
     * When every model in the chain is out of quota there is nowhere to go, so it does not retry.
     */
    fun handleModelError(model: String?, errorText: String): Boolean {
        if (model.isNullOrEmpty()) return false
        if (UNSUPPORTED_THINKING.containsMatchIn(errorText) && noThinking.add(model)) return true
        if (QUOTA.containsMatchIn(errorText)) {
            if (!isExhausted(model)) exhausted[model] = now() + if (DAILY.containsMatchIn(errorText)) DAILY_QUOTA_MS else RATE_LIMIT_MS
            val next = activeCloudModel()
            return next != model && !isExhausted(next) // only retry if a model with quota left remains
        }
        if (OVERLOADED.containsMatchIn(errorText)) {
            // Already benched and still asked for: every model is busy, so back off on this one instead of switching again.
            if (isBusy(model)) return false
            busy[model] = now() + BUSY_MS
            val next = activeCloudModel()
            return next != model && !isBusy(next)
        }
        return false
    }

    /**
     * Authoring fallback: when the author model stalls or is overloaded, move to a DIFFERENT model from
     * [cloud_read_model, ...cloud_fallback_models] that is not exhausted, instead of waiting on the same model again.
     * Returns [primary] when there is no other model to go to.
     */
    fun authorFallback(primary: String): String = chain(readModel()).firstOrNull { it != primary && !isExhausted(it) } ?: primary

    /** Test hook: forget every exhausted / no-thinking model. */
    fun reset() { exhausted.clear(); busy.clear(); noThinking.clear() }
}
