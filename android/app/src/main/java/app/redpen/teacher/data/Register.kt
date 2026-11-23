package app.redpen.teacher.data

import app.redpen.teacher.domain.shownLabel
import app.redpen.teacher.domain.Profile
import app.redpen.teacher.domain.needsCheck
import java.io.ByteArrayOutputStream
import java.text.DateFormat
import java.util.Date
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** The class mark register as rows, plus .xlsx and .csv exports. Same columns as web/src/data/excel.ts. */
object Register {
    data class Row(val submission: Submission, val scores: List<Int?>, val total: Int, val unchecked: Int)

    fun rows(a: Assignment, submissions: List<Submission>): List<Row> = submissions.map { s ->
        val scores = a.scheme.questions.map { q -> s.marks.firstOrNull { it.q == q.q }?.awarded }
        Row(s, scores, scores.sumOf { it ?: 0 }, s.marks.count { it.needsCheck() })
    }

    /** Neutralise spreadsheet formula injection in any text a teacher typed. */
    fun safeText(s: String): String = if (s.isNotEmpty() && s[0] in "=+-@\t\r") "'$s" else s

    fun fileName(a: Assignment, ext: String) = "${a.title.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-').ifBlank { "marks" }}-marks.$ext"

    // ---- CSV ----
    private fun csvCell(v: Any): String {
        val s = safeText(v.toString())
        return if (s.contains(',') || s.contains('"') || s.contains('\n')) "\"${s.replace("\"", "\"\"")}\"" else s
    }

    fun csv(a: Assignment, submissions: List<Submission>, profile: Profile): String {
        val max = a.maxTotal
        val head = listOfNotNull(profile.institution.ifBlank { null }, profile.details.ifBlank { null }, "${a.title} — ${a.className}",
            profile.teacher.ifBlank { null }?.let { "Teacher: $it" }).map { listOf(it) } + listOf(emptyList())
        val header = listOf("Student") + a.scheme.questions.map { "Q${it.shownLabel} (/${it.max})" } + listOf("Total (/$max)", "Percent", "Status", "Teacher comment")
        val lines = rows(a, submissions).map { r ->
            listOf(r.submission.pupil) + r.scores.map { it?.toString() ?: "" } +
                listOf(r.total.toString(), "${if (max > 0) r.total * 100 / max else 0}%", if (r.submission.queued != null) "waiting to be marked" else if (r.unchecked > 0) "${r.unchecked} to check" else "final", r.submission.comment)
        }
        return "﻿" + (head + listOf(header) + lines).joinToString("\n") { l -> l.joinToString(",") { csvCell(it) } }
    }

    // ---- XLSX (Office Open XML, written by hand: no heavyweight dependency) ----
    private fun esc(s: String) = buildString {
        for (ch in s) when {
            ch == '&' -> append("&amp;"); ch == '<' -> append("&lt;"); ch == '>' -> append("&gt;"); ch == '"' -> append("&quot;")
            ch == '\t' || ch == '\n' || ch == '\r' || ch >= ' ' -> append(ch)
            else -> {} // drop control characters Excel rejects
        }
    }

    fun column(i: Int): String { var n = i + 1; var s = ""; while (n > 0) { val r = (n - 1) % 26; s = ('A' + r) + s; n = (n - 1) / 26 }; return s }

    private sealed interface Cell { val style: Int }
    private data class Txt(val v: String, override val style: Int = 0) : Cell
    private data class Num(val v: Double, override val style: Int = 0) : Cell

    private object Style { const val TITLE = 1; const val SOFT = 2; const val HEADING = 3; const val HEADER = 4; const val TOTAL = 5; const val PERCENT = 6; const val WRAP = 7; const val DECIMAL = 8; const val ITALIC = 9; const val BOLD = 10 }

    private const val STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>
<fonts count="8">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF1F2A44"/><name val="Calibri"/></font>
<font><sz val="10"/><color rgb="FF5B6273"/><name val="Calibri"/></font>
<font><b/><sz val="13"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFC8102E"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF5B6273"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2A44"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FFE5DECF"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="11">
<xf/>
<xf fontId="1" applyFont="1"/>
<xf fontId="2" applyFont="1"/>
<xf fontId="3" applyFont="1"/>
<xf fontId="4" fillId="2" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf fontId="5" borderId="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="9" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf borderId="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="164" applyNumberFormat="1"/>
<xf fontId="6" applyFont="1"/>
<xf fontId="7" applyFont="1"/>
</cellXfs>
</styleSheet>"""

    fun xlsx(a: Assignment, submissions: List<Submission>, profile: Profile): ByteArray {
        val qs = a.scheme.questions
        val max = a.maxTotal
        val lastCol = qs.size + 4 // Student, Qs..., Total, Percent, Status, Comment (0-based index of Comment)
        val sheet = mutableListOf<List<Cell?>>()
        val merges = mutableListOf<Int>()
        fun heading(text: String, style: Int) { merges += sheet.size; sheet += listOf(Txt(safeText(text), style)) }
        if (profile.institution.isNotBlank()) heading(profile.institution, Style.TITLE)
        if (profile.details.isNotBlank()) heading(profile.details, Style.SOFT)
        heading("${a.title} — ${a.className}${if (a.scheme.subject.isNotBlank()) " · ${a.scheme.subject}" else ""}", Style.HEADING)
        heading("${if (profile.teacher.isNotBlank()) "Teacher: ${profile.teacher} · " else ""}Exported ${DateFormat.getDateInstance().format(Date())} · Marked with REDPEN", Style.ITALIC)
        sheet += emptyList<Cell?>()
        val headerRow = sheet.size
        sheet += (listOf("Student") + qs.map { "Q${it.shownLabel} (/${it.max})" } + listOf("Total (/$max)", "Percent", "Status", "Teacher’s comment")).map { Txt(it, Style.HEADER) }
        val rows = rows(a, submissions)
        rows.forEach { r ->
            sheet += listOf<Cell?>(Txt(safeText(r.submission.pupil), 7)) + r.scores.map { it?.let { v -> Num(v.toDouble(), 7) } ?: Txt("", 7) } +
                listOf(Num(r.total.toDouble(), Style.TOTAL), Num(if (max > 0) r.total.toDouble() / max else 0.0, Style.PERCENT),
                    Txt(if (r.submission.queued != null) "Waiting to be marked" else if (r.unchecked > 0) "${r.unchecked} to check" else "Marked", 7), Txt(safeText(r.submission.comment), Style.WRAP))
        }
        if (rows.isNotEmpty()) {
            sheet += emptyList<Cell?>()
            sheet += listOf<Cell?>(Txt("Class average", Style.BOLD)) + qs.indices.map { i -> Num(rows.sumOf { it.scores[i] ?: 0 }.toDouble() / rows.size, Style.DECIMAL) } +
                listOf(Num(rows.sumOf { it.total }.toDouble() / rows.size, Style.DECIMAL))
        }
        val xml = StringBuilder("""<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">""")
        xml.append("""<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow + 1}" topLeftCell="A${headerRow + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>""")
        xml.append("<cols>")
        xml.append("""<col min="1" max="1" width="26" customWidth="1"/>""")
        if (qs.isNotEmpty()) xml.append("""<col min="2" max="${qs.size + 1}" width="9" customWidth="1"/>""")
        xml.append("""<col min="${qs.size + 2}" max="${qs.size + 4}" width="12" customWidth="1"/><col min="${lastCol + 1}" max="${lastCol + 1}" width="48" customWidth="1"/>""")
        xml.append("</cols><sheetData>")
        sheet.forEachIndexed { ri, row ->
            xml.append("<row r=\"${ri + 1}\">")
            row.forEachIndexed { ci, cell ->
                val ref = "${column(ci)}${ri + 1}"
                when (cell) {
                    is Txt -> xml.append("<c r=\"$ref\" t=\"inlineStr\" s=\"${cell.style}\"><is><t xml:space=\"preserve\">${esc(cell.v)}</t></is></c>")
                    is Num -> xml.append("<c r=\"$ref\" s=\"${cell.style}\"><v>${cell.v}</v></c>")
                    null -> {}
                }
            }
            xml.append("</row>")
        }
        xml.append("</sheetData>")
        if (merges.isNotEmpty()) {
            xml.append("<mergeCells count=\"${merges.size}\">")
            merges.forEach { r -> xml.append("<mergeCell ref=\"A${r + 1}:${column(lastCol)}${r + 1}\"/>") }
            xml.append("</mergeCells>")
        }
        xml.append("""<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>""")

        val files = linkedMapOf(
            "[Content_Types].xml" to """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>""",
            "_rels/.rels" to """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>""",
            "xl/workbook.xml" to """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Mark register" sheetId="1" r:id="rId1"/></sheets></workbook>""",
            "xl/_rels/workbook.xml.rels" to """<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>""",
            "xl/styles.xml" to STYLES,
            "xl/worksheets/sheet1.xml" to xml.toString(),
        )
        val bytes = ByteArrayOutputStream()
        ZipOutputStream(bytes).use { zip -> files.forEach { (name, body) -> zip.putNextEntry(ZipEntry(name)); zip.write(body.toByteArray(Charsets.UTF_8)); zip.closeEntry() } }
        return bytes.toByteArray()
    }
}
