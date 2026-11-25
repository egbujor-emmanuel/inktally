package app.redpen.teacher

import app.redpen.teacher.ai.ModelRouting
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Quota-aware routing across cloud models and per-request error attribution: same cases as web/src/ai/routing.test.ts.
 * The clock is fake, so expiry is tested without waiting.
 */
class RoutingTest {
    private var clock = 1_000_000L
    private val routing = ModelRouting(readModel = { "model-a" }, fallbackModels = { listOf("model-b", "model-c") }, now = { clock })
    private val quota = "FirebaseAIException [429] RESOURCE_EXHAUSTED quota exceeded"
    private val daily = "$quota GenerateRequestsPerDay"

    /** Mirrors Ai.retry's switching: pick a model per attempt, fail it, and ask the routing whether to retry. */
    private fun failEveryAttempt(error: String): List<String> {
        val calls = mutableListOf<String>()
        while (calls.size < 10) {
            val model = routing.activeCloudModel()
            calls += model
            if (!routing.handleModelError(model, error)) break
        }
        return calls
    }

    @Test fun aQuotaErrorOnThePrimaryModelSwitchesToTheFirstFallbackAtOnce() {
        assertTrue(routing.handleModelError("model-a", quota))
        assertEquals("model-b", routing.activeCloudModel())
    }

    @Test fun aRateLimitExpiresAfterAMinuteADailyQuotaLastsForHours() {
        routing.handleModelError("model-a", quota)
        clock += 61_000
        assertEquals("model-a", routing.activeCloudModel())

        routing.handleModelError("model-a", daily)
        clock += 6 * 3_600_000L
        assertEquals("model-b", routing.activeCloudModel())
        clock += 7 * 3_600_000L
        assertEquals("model-a", routing.activeCloudModel())
    }

    @Test fun whenEveryModelIsOutOfQuotaTheErrorSurfacesInsteadOfLooping() {
        assertEquals(listOf("model-a", "model-b", "model-c"), failEveryAttempt(daily))
        assertFalse(routing.handleModelError("model-a", daily)) // nowhere left to go: no retry
        assertEquals("model-a", routing.activeCloudModel()) // falls back to the primary name
    }

    @Test fun errorsAreAttributedPerRequestAFailureOnOneModelNeverMarksAnother() {
        assertFalse(routing.handleModelError(null, quota)) // unattributed error: no switch
        assertEquals("model-a", routing.activeCloudModel())
        // A request that was built on model-b fails while model-a is the active model: only model-b is exhausted.
        assertTrue(routing.handleModelError("model-b", quota))
        assertEquals("model-a", routing.activeCloudModel())
        assertTrue(routing.isExhausted("model-b"))
        assertFalse(routing.isExhausted("model-a"))
    }

    @Test fun aModelThatRejectsTheThinkingLevelIsRetriedWithoutIt() {
        assertTrue(routing.thinkingAllowed("model-a"))
        assertTrue(routing.handleModelError("model-a", "thinking level MINIMAL is not supported"))
        assertFalse(routing.thinkingAllowed("model-a"))
        assertFalse(routing.handleModelError("model-a", "thinking level MINIMAL is not supported")) // only once
        assertTrue(routing.thinkingAllowed("model-b"))
    }

    @Test fun nonQuotaErrorsDoNotSwitchModels() {
        assertFalse(routing.handleModelError("model-a", "AppCheck token is invalid"))
        assertEquals("model-a", routing.activeCloudModel())
    }
    // Same cases as web routing.test.ts "when a cloud model is overloaded" (25 Nov: "high demand" on every page read).
    @Test fun anOverloadedModelHandsTheReadToTheNextModelAndIsTriedAgainAfterAMinute() {
        val highDemand = "[500 ] This model is currently experiencing high demand. Spikes in demand are usually temporary."
        assertTrue(routing.handleModelError("model-a", highDemand))
        assertEquals("model-b", routing.activeCloudModel())
        clock += 61_000
        assertEquals("model-a", routing.activeCloudModel())
    }
    @Test fun whenEveryModelIsOverloadedItStopsSwitchingNeverLoops() {
        val calls = failEveryAttempt("503 UNAVAILABLE high demand")
        assertEquals(listOf("model-a", "model-b", "model-c"), calls.take(3))
        assertTrue(calls.size < 10)
    }

    @Test fun theAuthorFallbackMovesToADifferentModelWithQuotaLeft() {
        assertEquals("model-b", routing.authorFallback("model-a"))
        assertEquals("model-a", routing.authorFallback("author-x"))
        routing.handleModelError("model-b", daily)
        assertEquals("model-c", routing.authorFallback("model-a"))
        routing.handleModelError("model-c", daily)
        assertEquals("model-a", routing.authorFallback("model-a")) // nowhere else: same model
    }

    @Test fun resetForgetsExhaustedAndNoThinkingModels() {
        routing.handleModelError("model-a", daily)
        routing.handleModelError("model-b", "thinking not supported")
        routing.reset()
        assertEquals("model-a", routing.activeCloudModel())
        assertTrue(routing.thinkingAllowed("model-b"))
    }
}
