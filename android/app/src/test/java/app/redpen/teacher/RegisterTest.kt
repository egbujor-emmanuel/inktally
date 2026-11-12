package app.redpen.teacher

import app.redpen.teacher.data.Assignment
import app.redpen.teacher.data.Register
import app.redpen.teacher.data.Submission
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkEngine
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.MarkingScheme
import app.redpen.teacher.domain.Profile
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.util.zip.ZipInputStream

/** Mark register rows + the hand-written .xlsx/.csv exports. CI also opens the .xlsx with openpyxl. */
class RegisterTest {
    private fun mark(q: Int, awarded: Int, max: Int, status: MarkStatus = MarkStatus.VERIFIED) =
        Mark(q, "x", ReadSource.IN_CLOUD, awarded, max, MarkEngine.CODE, status, emptyList())

    private val assignment = Assignment("a1", "English & <Grammar>", "JSS 1A", MarkingScheme("English", "JSS 1", listOf(
        Question.Objective(1, "plural of child", 1, listOf("B")),
        Question.Short(2, "past tense of run", 2, listOf("ran")),
    )))
    private val subs = listOf(
        Submission("s1", "Ada Obi", listOf(mark(1, 1, 1), mark(2, 1, 2, MarkStatus.FLAGGED)), "Revise past tenses, \"ran\" not runned"),
        Submission("s2", "=HYPERLINK(\"evil\")", listOf(mark(1, 0, 1))),
    )
    private val profile = Profile("Greenfield College", "12 Bode Thomas St · First Term", "Mrs A. Okafor")

    private fun entries(bytes: ByteArray): Map<String, String> {
        val out = mutableMapOf<String, String>()
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            generateSequence { zip.nextEntry }.forEach { e -> out[e.name] = zip.readBytes().toString(Charsets.UTF_8) }
        }
        return out
    }

    @Test fun rowsTotalScoresAndCountUnchecked() {
        val rows = Register.rows(assignment, subs)
        assertEquals(listOf(1, 1), rows[0].scores)
        assertEquals(2, rows[0].total)
        assertEquals(1, rows[0].unchecked)
        assertEquals(listOf(0, null), rows[1].scores)
    }

    @Test fun columnLettersFollowExcel() {
        assertEquals("A", Register.column(0)); assertEquals("Z", Register.column(25))
        assertEquals("AA", Register.column(26)); assertEquals("AZ", Register.column(51))
    }

    @Test fun guardsFormulaInjection() {
        assertEquals("'=1+1", Register.safeText("=1+1"))
        assertEquals("'@cmd", Register.safeText("@cmd"))
        assertEquals("Ada", Register.safeText("Ada"))
    }

    @Test fun xlsxHasAllPartsLetterheadCommentsAndEscapes() {
        val bytes = Register.xlsx(assignment, subs, profile)
        val parts = entries(bytes)
        listOf("[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml")
            .forEach { assertTrue("missing $it", it in parts) }
        val sheet = parts.getValue("xl/worksheets/sheet1.xml")
        assertTrue(sheet.contains("Greenfield College"))
        assertTrue(sheet.contains("Mrs A. Okafor"))
        assertTrue(sheet.contains("English &amp; &lt;Grammar&gt;"))
        assertTrue(sheet.contains("Revise past tenses, &quot;ran&quot; not runned"))
        assertTrue(sheet.contains("'=HYPERLINK"))
        assertFalse(sheet.contains("<Grammar>"))
        assertTrue(sheet.contains("<mergeCell ref=\"A1:"))
        // Written for CI's independent check (openpyxl must open it and find the same text).
        File("build/test-xlsx").apply { mkdirs() }.resolve("register.xlsx").writeBytes(bytes)
    }

    @Test fun csvHasLetterheadAndQuotesCommas() {
        val csv = Register.csv(assignment, subs, profile)
        assertTrue(csv.startsWith("﻿Greenfield College"))
        assertTrue(csv.contains("\"Revise past tenses, \"\"ran\"\" not runned\""))
        assertTrue(csv.contains("'=HYPERLINK"))
    }
}

/** Guards the 0.2.0 bug: the prompt template regex must compile on Android's ICU engine (escaped braces). */
class PromptTemplateTest {
    @Test fun placeholderPatternEscapesBothBraces() {
        val src = File("src/main/java/app/redpen/teacher/ai/Ai.kt").readText()
        assertTrue("PLACEHOLDER must escape both braces", src.contains("""Regex("\\{(\\w+)\\}")"""))
    }
}
