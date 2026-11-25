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
    @Test fun definitionWithFillerWords() {
        val q = Question.Short(6, "Define acceleration", 1, listOf("the rate of change of velocity"))
        assertEquals(1, markShort(q, "Acceleration is the rate of change of velocity.", ReadSource.IN_CLOUD).awarded)
        assertEquals(0, markShort(q, "Acceleration is change in speed.", ReadSource.IN_CLOUD).awarded)
        assertEquals(0, markShort(q, "It is not the rate of change of velocity.", ReadSource.IN_CLOUD).awarded)
    }
    @Test fun strayBracketAfterNumber() = assertEquals(100.0, parseNumericAnswer("PE = 2 × 10 × 5 = 100]").value!!, 0.0)
    @Test fun workingThatFollowsAnotherFormula() {
        assertEquals("50/0.4", app.redpen.teacher.marking.substitutedArithmetic("v = f/λ = 50/0.4 = 125 m/s"))
        assertEquals(125.0, app.redpen.teacher.marking.evaluateArithmetic("50/0.4")!!, 0.0)
        assertEquals(12.0, app.redpen.teacher.marking.evaluateArithmetic("(4+2)*2")!!, 0.0)
        assertEquals("50/0.4", app.redpen.teacher.marking.workingContradictsKey("v = fλ = 50/0.4 = 125 m/s", 125.0, listOf(20.0))?.step)
        assertEquals(null, app.redpen.teacher.marking.workingContradictsKey("v = fλ = 50 × 0.4 = 25 m/s", 25.0, listOf(20.0)))
        assertEquals(null, app.redpen.teacher.marking.workingContradictsKey("I = 12/6 = 2 A", 2.0, listOf(2.0)))
    }
    // The real handwritten WAEC scripts (samples/waec-handwritten): same cases as web working.test.ts.
    @Test fun realScriptsWrongNumberIsASlipDifferentOperationIsAnotherFormula() {
        assertEquals("", app.redpen.teacher.marking.operationSignature("uses P = hρg"))
        assertEquals("-/", app.redpen.teacher.marking.operationSignature("uses a = (v − u) ÷ t"))
        assertEquals("+", app.redpen.teacher.marking.operationSignature("1/2*(0+20)*5"))
        assertEquals(null, app.redpen.teacher.marking.workingContradictsKey("P=hρg=10X1000X1=10,000Pa", 10000.0, listOf(100000.0), listOf("uses P = hρg")))
        assertEquals(null, app.redpen.teacher.marking.workingContradictsKey("PE=mgh=2X10X50=1000J", 1000.0, listOf(100.0), listOf("uses PE = mgh")))
        assertEquals("50/0.4", app.redpen.teacher.marking.workingContradictsKey("V=fλ=50/0.4=125 m/s", 125.0, listOf(20.0), listOf("uses v = fλ"))?.step)
        assertEquals("4*2", app.redpen.teacher.marking.workingContradictsKey("R=4X2=8Ω I=12/8=1.5A", 1.5, listOf(2.0), listOf("total resistance 4 + 2 = 6 Ω, or I = V ÷ R with 6 Ω"))?.step)
        assertEquals("20*5", app.redpen.teacher.marking.workingContradictsKey("a=20X5=100m/s^2", 100.0, listOf(4.0), listOf("uses a = (v − u) ÷ t"))?.step)
        assertEquals(null, app.redpen.teacher.marking.workingContradictsKey("P = ρgh = 10 x 1000 x 10 = 10 x 10^5 Pa", 1000000.0, listOf(100000.0), listOf("uses P = hρg")))
    }
    // Same cases as web pageAlign.test.ts: Script 3 (sideways photo) came back with every number from 7(a) on shifted.
    @Test fun pageAnswersMatchTheLabelTheStudentWrote() {
        val labels = listOf("1", "2", "3", "4", "5", "6(a)", "6(b)(i)", "6(b)(ii)", "7(a)", "7(b)", "8(a)", "8(b)", "9", "10")
        val waec = labels.mapIndexed { i, l -> app.redpen.teacher.domain.Question.Short(q = i + 1, prompt = "Q", max = 1, accept = listOf("x"), label = l) }
        assertEquals("7a", app.redpen.teacher.ai.labelKey("7a)"))
        assertEquals(app.redpen.teacher.ai.labelKey("6(b)(ii)"), app.redpen.teacher.ai.labelKey("6b(ii)"))
        assertEquals("10", app.redpen.teacher.ai.labelKey("Q10."))
        val aligned = app.redpen.teacher.ai.alignPageAnswers(listOf(
            app.redpen.teacher.ai.PageAnswer(10, "7a)", "I ∝ V if the temperature is constant"),
            app.redpen.teacher.ai.PageAnswer(11, "7b)", "I = V/R = 12/6 = 2A"),
            app.redpen.teacher.ai.PageAnswer(2, "", "C"),
        ), waec)
        assertEquals("I ∝ V if the temperature is constant", aligned[9])
        assertEquals("I = V/R = 12/6 = 2A", aligned[10])
        assertEquals("C", aligned[2])
        val keys = waec.map { app.redpen.teacher.ai.labelKey(it.label!!) }.toSet()
        assertEquals(app.redpen.teacher.ai.LeadingLabel("8a", "(i) Transverse"), app.redpen.teacher.ai.leadingLabel("8a)(i) Transverse", keys))
        assertEquals(app.redpen.teacher.ai.LeadingLabel("6bii", ""), app.redpen.teacher.ai.leadingLabel("6b(ii)", keys))
        assertEquals(app.redpen.teacher.ai.LeadingLabel("2", "2 m/s"), app.redpen.teacher.ai.leadingLabel("2) 2 m/s", setOf("2", "22")))
        // 25 Nov run 1: 7(a)'s line came back under the blank 6(b)(ii), but the line carries its own label.
        val shifted = app.redpen.teacher.ai.alignPageAnswers(listOf(
            app.redpen.teacher.ai.PageAnswer(8, "6b(ii)", "7a) I ∝ V if the temperature is constant"),
            app.redpen.teacher.ai.PageAnswer(13, "9)", "10) 100 joules"),
        ), waec)
        assertEquals("I ∝ V if the temperature is constant", shifted[9])
        assertEquals("100 joules", shifted[14])
        assertEquals(null, shifted[8])
    }
    // Same synthetic page as web orient.test.ts: lines of letter-sized blobs from one margin, ending raggedly.
    private fun writtenPage(w: Int = 300, h: Int = 400): app.redpen.teacher.scan.Orient.Mask {
        val ink = BooleanArray(w * h)
        listOf(24, 9, 17, 30, 12, 26, 7, 20, 15, 28, 11, 22, 18, 25, 10, 27).forEachIndexed { line, letters ->
            val top = 20 + line * 22
            var l = 0
            while (l < letters && 20 + l * 9 < w - 6) { for (y in top until top + 5) for (x in 20 + l * 9 until 25 + l * 9) ink[y * w + x] = true; l++ }
        }
        return app.redpen.teacher.scan.Orient.Mask(w, h, ink)
    }
    @Test fun sidewaysPagesAreTurnedUpright() {
        val o = app.redpen.teacher.scan.Orient
        assertEquals(0, o.uprightTurn(writtenPage()))
        assertEquals(270, o.uprightTurn(o.quarterTurn(writtenPage(), cw = true)))
        assertEquals(90, o.uprightTurn(o.quarterTurn(writtenPage(), cw = false)))
        assertEquals(0, o.uprightTurn(app.redpen.teacher.scan.Orient.Mask(50, 80, BooleanArray(50 * 80))))
        val gray = IntArray(60 * 60) { if (it % 60 < 30) 120 else 220 }.also { it[30 * 60 + 10] = 60; it[30 * 60 + 45] = 150 }
        val ink = o.inkMask(gray, 60, 60).ink
        assertTrue(ink[30 * 60 + 10] && ink[30 * 60 + 45] && !ink[10 * 60 + 5] && !ink[10 * 60 + 50])
    }
    @Test fun scriptPagesStackAtOneWidth() {
        val plan = app.redpen.teacher.scan.Stitch.layout(listOf(960 to 1280, 960 to 1280))
        assertEquals(960, plan.width)
        assertEquals(2 * 1280 + app.redpen.teacher.scan.Stitch.GAP, plan.height)
        assertEquals(1280 + app.redpen.teacher.scan.Stitch.GAP, plan.boxes[1].y)
        assertEquals(app.redpen.teacher.scan.Stitch.MAX_WIDTH, app.redpen.teacher.scan.Stitch.layout(listOf(3000 to 4000)).width)
    }
    // Same as web printedLabels.test.ts: a fallback model drafted the WAEC pressure question as a theory answer (25 Nov).
    @Test fun theGuideDecidesWhichQuestionsAreCalculations() {
        val guide = listOf(
            "6(a) Define acceleration. 1 mark: the rate of change of velocity.",
            "6(b)(i) A car starts from rest and reaches 20 m/s in 5 s. Calculate its acceleration. Answer 4 m/s². 2 marks: method (1 mark) uses a = (v − u) ÷ t; answer (1 mark).",
            "9. Calculate the pressure at a depth of 10 m in water. Answer 1.0 × 10^5 Pa (accept 100 000 Pa). 2 marks: method (1 mark) uses P = hρg; answer (1 mark).",
            "10. A 2 kg mass is lifted through a height of 5 m. Calculate the potential energy gained. Answer 100 J.",
        ).joinToString("\n")
        val sections = app.redpen.teacher.ai.printedSections(guide)
        assertEquals(listOf(100000.0), app.redpen.teacher.ai.statedAnswers(sections["9"]!!))
        assertEquals(listOf(4.0), app.redpen.teacher.ai.statedAnswers(sections["6(b)(i)"]!!))
        assertEquals(emptyList<Double>(), app.redpen.teacher.ai.statedAnswers(sections["6(a)"]!!))
        assertEquals(emptyList<Double>(), app.redpen.teacher.ai.statedAnswers("Answer any two of the following reasons."))
        val drafted = app.redpen.teacher.domain.Question.Points(q = 13, prompt = "Calculate the pressure", max = 2, points = listOf("uses P = hρg", "answer 1.0 × 10^5 Pa"), label = "9")
        assertEquals(app.redpen.teacher.domain.Question.Numeric(13, "Calculate the pressure", 2, listOf(100000.0), methodPoints = listOf("uses P = hρg"), label = "9"),
            app.redpen.teacher.ai.pinCalculations(listOf(drafted), sections).single())
        val theory = app.redpen.teacher.domain.Question.Points(q = 6, prompt = "Define", max = 1, points = listOf("the rate of change of velocity"), label = "6(a)")
        assertEquals(listOf(theory), app.redpen.teacher.ai.pinCalculations(listOf(theory), sections))
    }
    @Test fun printedLabelsFromTypedGuide() {
        assertEquals(listOf("1", "2(a)", "2(b)(i)", "2(b)(ii)", "3"),
            app.redpen.teacher.ai.printedLabels(listOf("1. Define work.", "2. (a) State Newton's first law.", "(b) A 2 kg mass...", "(i) Find the force.", "(ii) Find the work done.", "3. B").joinToString("\n")))
        assertEquals(listOf("6(a)", "6(b)(i)", "7"), app.redpen.teacher.ai.printedLabels(listOf("6(a) Define acceleration. 1 mark", "6(b)(i) A car starts from rest", "7. A 2 kg mass").joinToString("\n")))
        assertEquals(listOf("1", "2"), app.redpen.teacher.ai.printedLabels(listOf("1. B", "2 marks for the method", "2. C", "10 m is the height").joinToString("\n")))
    }
    @Test fun missingSubpartLabelsInferred() {
        fun o(n: Int, l: String? = null) = Question.Objective(n, "", 1, listOf("A"), l)
        val got = app.redpen.teacher.ai.inferLabels(listOf(o(6, "6(a)"), o(7, "6(b)(i)"), o(8, "6(b)(ii)"), o(9), o(10, "7(b)"), o(11), o(12, "8(b)"), o(13, "9"), o(14, "10")))
        assertEquals(listOf("6(a)", "6(b)(i)", "6(b)(ii)", "7(a)", "7(b)", "8(a)", "8(b)", "9", "10"), got.map { it.label ?: it.q.toString() })
    }
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
