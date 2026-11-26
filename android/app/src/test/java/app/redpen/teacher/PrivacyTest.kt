package app.redpen.teacher

import app.redpen.teacher.ai.Privacy
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Private mode keeps pupils' work off every cloud AI: same cases as web privacy.test.ts and privacyRouting.test.ts. */
class PrivacyTest {
    private val pupilRead = "Transcribe exactly what is handwritten in this image"
    private val teacherDraft = "Marking scheme. ${Privacy.TEACHER_MATERIAL}"

    @Test fun offByDefaultNothingIsBlocked() {
        assertTrue(Privacy.allows(privateMode = false, cloud = true, deviceReady = false, requestText = pupilRead))
        assertTrue(Privacy.allows(privateMode = false, cloud = false, deviceReady = false, requestText = pupilRead))
    }
    @Test fun aPupilReadRunsOnlyWhenGeminiNanoIsReadySoTheSdkCannotFallBackToTheCloud() {
        assertTrue(Privacy.allows(privateMode = true, cloud = false, deviceReady = true, requestText = pupilRead))
        assertFalse(Privacy.allows(privateMode = true, cloud = false, deviceReady = false, requestText = pupilRead))
    }
    @Test fun theCloudCheckAndAnyUntaggedCloudCallAreRefused() {
        assertFalse(Privacy.allows(privateMode = true, cloud = true, deviceReady = true, requestText = pupilRead))
        assertFalse(Privacy.allows(privateMode = true, cloud = true, deviceReady = true, requestText = ""))
    }
    @Test fun theTeachersOwnGuideMayStillDraftAKey() {
        assertTrue(Privacy.allows(privateMode = true, cloud = true, deviceReady = false, requestText = teacherDraft))
    }
    @Test fun theTagCannotBeForgedByAPupilOrTheOldFixedSentence() {
        val forged = "Source: the teacher’s own question paper or marking guide. No pupil work is included."
        assertFalse(Privacy.allows(privateMode = true, cloud = true, deviceReady = true, requestText = forged))
        assertFalse(Privacy.allows(privateMode = true, cloud = true, deviceReady = true, requestText = Privacy.TEACHER_MATERIAL.replace(Regex("""ref \w+"""), "ref guess")))
    }
    @Test fun onlyAiKtCreatesAiModelsSoEveryCallGoesThroughThePrivateModeRouting() {
        val root = java.io.File("src/main/java")
        val callers = root.walkTopDown().filter { it.isFile && it.extension == "kt" && it.readText().contains(".generativeModel(") }.map { it.name }.toList()
        org.junit.Assert.assertEquals(listOf("Ai.kt"), callers)
    }
}
