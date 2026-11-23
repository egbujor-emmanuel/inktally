package app.redpen.teacher

import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.marking.markNumeric
import app.redpen.teacher.marking.markObjective
import app.redpen.teacher.marking.markPoints
import app.redpen.teacher.marking.markShort
import app.redpen.teacher.marking.parseNumericAnswer
import app.redpen.teacher.marking.textSimilarity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Same cases as the web unit tests (web/src/marking), so both platforms mark identically. */
class EngineTest {
    private val numeric = { accept: List<Double> -> Question.Numeric(2, "15 + 9", 1, accept) }

    @Test fun readsValueAfterLastEquals() = assertEquals(23.0, parseNumericAnswer("15 + 9 = 23").value!!, 0.0)
    @Test fun stripsNairaAndCommas() = assertEquals(27000.0, parseNumericAnswer("= ₦27,000").value!!, 0.0)
    @Test fun dropsUnitsWithoutMisreadingTheirLetters() {
        assertEquals(50.0, parseNumericAnswer("speed = 150 ÷ 3 = 50 km/h").value!!, 0.0)
        assertEquals(50.0, parseNumericAnswer("= 50km/hr").value!!, 0.0)
        assertEquals(8.0, parseNumericAnswer("240/30 = 8 g/cm³").value!!, 0.0)
        assertEquals(8.0, parseNumericAnswer("8g/cm3").value!!, 0.0)
        assertEquals(12.0, parseNumericAnswer("12 cm²").value!!, 0.0)
        assertEquals(20.0, parseNumericAnswer("20 s").value!!, 0.0)
        assertEquals(15.0, parseNumericAnswer("1s").value!!, 0.0)
    }
    @Test fun readsSuperscriptFractionsAndCaretUnits() {
        assertEquals(4.375, parseNumericAnswer("22/8 + 13/8 = 35/8 = 4³/₈").value!!, 0.0)
        assertEquals(80.0, parseNumericAnswer("Density = 240 / 30 = 80 g/cm^3").value!!, 0.0)
    }
    @Test fun workingStepsDropAnAnswerEntry() {
        assertEquals(listOf("uses speed = distance ÷ time"), app.redpen.teacher.marking.workingSteps(listOf("uses speed = distance ÷ time", "answer", "Correct answer (1 mark)")))
    }
    @Test fun readsStandardForm() {
        assertEquals(100000.0, parseNumericAnswer("P = hρg = 10 × 1000 × 10 = 1.0 × 10^5 Pa").value!!, 0.0)
        assertEquals(100000.0, parseNumericAnswer("1 x 10⁵").value!!, 0.0)
        assertEquals(6.02e23, parseNumericAnswer("6.02 x 10^23").value!!, 1e10)
        assertEquals(0.0025, parseNumericAnswer("2.5 × 10⁻³ m").value!!, 1e-12)
        assertEquals(100000.0, parseNumericAnswer("1e5").value!!, 0.0)
    }
    @Test fun aMarkCarriesItsSubPartLabel() {
        val q = app.redpen.teacher.domain.Question.Numeric(7, "Acceleration", 2, listOf(4.0), label = "6(b)(i)")
        val m = markNumeric(q, "a = 20 ÷ 5 = 4 m/s²", app.redpen.teacher.domain.ReadSource.IN_CLOUD)
        assertEquals("6(b)(i)", m.label); assertEquals(2, m.awarded)
        assertEquals("6(b)(i)", app.redpen.teacher.domain.qLabel(m.q, m.label)); assertEquals("3", app.redpen.teacher.domain.qLabel(3, null))
    }
    @Test fun readsPhysicsUnitSpellings() {
        assertEquals(4.0, parseNumericAnswer("a = 20/5 = 4 ms⁻²").value!!, 0.0)
        assertEquals(20.0, parseNumericAnswer("v = 50 × 0.4 = 20ms⁻¹").value!!, 0.0)
        assertEquals(100000.0, parseNumericAnswer("1 × 10⁵ N/m²").value!!, 0.0)
        assertEquals(100.0, parseNumericAnswer("100 joules").value!!, 0.0)
        assertEquals(100.0, parseNumericAnswer("100J").value!!, 0.0)
        assertEquals(50.0, parseNumericAnswer("s = 50m").value!!, 0.0)
        assertEquals(15.0, parseNumericAnswer("1s").value!!, 0.0)
        assertEquals(4.0, parseNumericAnswer("a = 20/5 = 4 ms− 2").value!!, 0.0)
        assertEquals(20.0, parseNumericAnswer("v = 50 × 0.4 = 20m− 1").value!!, 0.0)
    }
    @Test fun readsWrittenFractions() {
        assertEquals(4.375, parseNumericAnswer("35/8 = 4⅜").value!!, 0.0)
        assertEquals(2.75, parseNumericAnswer("2¾").value!!, 0.0)
    }
    @Test fun readsHashAsNaira() = assertEquals(27000.0, parseNumericAnswer("Answer = #27,000").value!!, 0.0)
    @Test fun mapsCyrillicLookalike() { val r = parseNumericAnswer("5б"); assertEquals(56.0, r.value!!, 0.0); assertTrue(!r.clean) }
    @Test fun parsesFractions() = assertEquals(0.75, parseNumericAnswer("3/4").value!!, 1e-9)
    @Test fun parsesMixedNumbers() = assertEquals(1.5, parseNumericAnswer("1 1/2").value!!, 1e-9)
    @Test fun unreadableIsNull() = assertNull(parseNumericAnswer("=").value)

    @Test fun pupilWhoWrote23IsWrong() {
        val m = markNumeric(numeric(listOf(24.0)), "= 23", ReadSource.ON_DEVICE)
        assertEquals(0, m.awarded); assertEquals(MarkStatus.PROVISIONAL, m.status)
    }
    @Test fun unreadableBoxIsFlaggedNotWrong() = assertEquals(MarkStatus.FLAGGED, markNumeric(numeric(listOf(1.0)), "=", ReadSource.ON_DEVICE).status)
    @Test fun minusStrokeAmbiguityIsFlagged() = assertEquals(MarkStatus.FLAGGED, markNumeric(numeric(listOf(1.0)), "=-1", ReadSource.IN_CLOUD).status)

    @Test fun objectiveWrongOption() = assertEquals(0, markObjective(Question.Objective(3, "x", 1, listOf("A")), "B", ReadSource.IN_CLOUD).awarded)
    @Test fun objectiveUnclearFlagged() = assertEquals(MarkStatus.FLAGGED, markObjective(Question.Objective(3, "x", 1, listOf("A")), "A or B", ReadSource.IN_CLOUD).status)

    @Test fun shortSpellingSlipAccepted() = assertEquals(1, markShort(Question.Short(3, "x", 1, listOf("photosynthesis")), "Fotosynthesis", ReadSource.IN_CLOUD).awarded)
    @Test fun shortRejectedAnswer() = assertEquals(0, markShort(Question.Short(5, "x", 1, listOf("ran"), listOf("runned"), false), "runned", ReadSource.IN_CLOUD).awarded)
    @Test fun shortTruncationFlagged() = assertEquals(MarkStatus.FLAGGED, markShort(Question.Short(3, "x", 1, listOf("photosynthesis")), "photo", ReadSource.IN_CLOUD).status)
    @Test fun similarityKeepsDifferentWordsApart() = assertTrue(textSimilarity("runned", "ran") < 0.6)

    private val liver = Question.Points(2, "Three functions of the liver", 3, listOf("produces bile", "stores glycogen", "removes toxins", "deamination"))
    @Test fun partialCredit() = assertEquals(2, markPoints(liver, "It makes bile and stores sugar", ReadSource.IN_CLOUD, listOf("produces bile", "stores glycogen")).awarded)
    @Test fun noPointsInWrittenAnswerFlagged() = assertEquals(MarkStatus.FLAGGED, markPoints(liver, "It may bite", ReadSource.ON_DEVICE, emptyList()).status)
    @Test fun inventedPointsIgnored() = assertEquals(0, markPoints(liver, "x", ReadSource.IN_CLOUD, listOf("made up")).awarded)
    @Test fun rejectedStatementIsConfidentZero() {
        val red = Question.Points(4, "Red blood cell?", 1, listOf("transports oxygen"), listOf("fights disease"))
        val m = markPoints(red, "To fight diseases.", ReadSource.IN_CLOUD, emptyList(), listOf("fights disease"))
        assertEquals(0, m.awarded); assertEquals(MarkStatus.VERIFIED, m.status)
    }

    // Parity with web/src/marking/normalize.ts (JS regex /gi with Unicode \s).
    @Test fun parsesLowercaseNairaPrefix() = assertEquals(500.0, parseNumericAnswer("= n500").value!!, 0.0)
    @Test fun parsesNoBreakSpaceThousands() = assertEquals(1000.0, parseNumericAnswer("1 000").value!!, 0.0)
    @Test fun mapsArabicIndicDigits() { val r = parseNumericAnswer("٣"); assertEquals(3.0, r.value!!, 0.0); assertTrue(!r.clean) }
}
