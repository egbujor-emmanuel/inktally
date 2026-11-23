package app.redpen.teacher.scan

import app.redpen.teacher.domain.shownLabel
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import androidx.core.content.res.ResourcesCompat
import app.redpen.teacher.R
import app.redpen.teacher.domain.Mark
import app.redpen.teacher.domain.MarkStatus
import app.redpen.teacher.domain.Profile
import app.redpen.teacher.domain.Question
import java.io.File
import java.text.DateFormat
import java.util.Date
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Everything REDPEN draws: the printable A4 answer sheet (PDF + preview), the marked copy of a student's work,
 * and the institution letterhead. Mirrors web/src/components/AnswerSheet.tsx, scan/markedCopy.ts and scan/letterhead.ts.
 */
object Render {
    private const val INK = 0xFF1F2A44.toInt()
    private const val SOFT = 0xFF5B6273.toInt()
    private const val PEN = 0xFFD7263D.toInt()
    private const val FLAG = 0xFFD99A1E.toInt()
    private const val MM_TO_PT = 72.0 / 25.4

    private class Fonts(val display: Typeface, val body: Typeface, val hand: Typeface)
    private var fonts: Fonts? = null
    private fun fonts(ctx: Context): Fonts = fonts ?: Fonts(
        Typeface.create(ResourcesCompat.getFont(ctx, R.font.fraunces) ?: Typeface.SERIF, Typeface.BOLD),
        ResourcesCompat.getFont(ctx, R.font.inter_tight) ?: Typeface.SANS_SERIF,
        Typeface.create(ResourcesCompat.getFont(ctx, R.font.caveat) ?: Typeface.DEFAULT, Typeface.BOLD),
    ).also { fonts = it }

    private val HINT = mapOf(
        Question.Objective::class to "Write ONE letter", Question.Numeric::class to "Answer =",
        Question.Short::class to "Answer", Question.Points::class to "Write your answer",
    )

    private fun paint(color: Int, size: Float, tf: Typeface, bold: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        this.color = color; textSize = size; typeface = tf; isFakeBoldText = bold
    }

    /** Draws one sheet page in mm units scaled by [s] (pt or px per mm). */
    private fun drawSheetPage(c: Canvas, ctx: Context, s: Float, title: String, className: String, questions: List<Question>,
                              boxes: List<SheetLayout.Box>, page: Int, pages: Int, profile: Profile) {
        val f = fonts(ctx)
        c.drawColor(Color.WHITE)
        val black = Paint().apply { color = Color.BLACK }
        val half = SheetLayout.FIDUCIAL_SIZE / 2
        SheetLayout.FIDUCIALS.forEach { p -> c.drawRect(((p.x - half) * s).toFloat(), ((p.y - half) * s).toFloat(), ((p.x + half) * s).toFloat(), ((p.y + half) * s).toFloat(), black) }
        fun text(t: String, x: Double, y: Double, p: Paint, maxMm: Double = 150.0) {
            val maxW = (maxMm * s).toFloat()
            val w = p.measureText(t)
            if (w > maxW) { c.save(); c.scale(maxW / w, 1f, (x * s).toFloat(), (y * s).toFloat()); c.drawText(t, (x * s).toFloat(), (y * s).toFloat(), p); c.restore() }
            else c.drawText(t, (x * s).toFloat(), (y * s).toFloat(), p)
        }
        if (profile.institution.isNotBlank()) text(profile.institution.uppercase(), 32.0, 13.5, paint(PEN, 3.8f * s, f.body, bold = true).apply { letterSpacing = 0.05f })
        text(title, 32.0, 21.0, paint(INK, 7f * s, f.display))
        text("${if (className.isNotBlank()) "$className · " else ""}Page $page of $pages · Keep the four black squares in the photo", 32.0, 28.0, paint(0xFF555555.toInt(), 3.6f * s, f.body))
        if (profile.details.isNotBlank()) text(profile.details, 32.0, 34.0, paint(0xFF777777.toInt(), 3f * s, f.body))
        val label = paint(INK, 4.2f * s, f.body)
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = INK; strokeWidth = 0.3f * s }
        text("Name", 32.0, 41.0, label); c.drawLine(46 * s, 41.5f * s, 130 * s, 41.5f * s, line)
        text("No.", 136.0, 41.0, label); c.drawLine(146 * s, 41.5f * s, 192 * s, 41.5f * s, line)
        text("Write each answer inside its box. Do not write on the black squares. Marked by REDPEN.", 32.0, 52.0, paint(0xFF777777.toInt(), 3.2f * s, f.body))
        val box = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = INK; style = Paint.Style.STROKE; strokeWidth = 0.35f * s }
        val num = paint(INK, 5f * s, f.display).apply { textAlign = Paint.Align.RIGHT }
        val hint = paint(0xFF9999AA.toInt(), 2.6f * s, f.body).apply { textAlign = Paint.Align.RIGHT }
        val byQ = questions.associateBy { it.q }
        for (b in boxes) {
            c.drawText(byQ[b.q]?.shownLabel ?: "${b.q}", ((b.x - 3) * s).toFloat(), ((b.y + 6) * s).toFloat(), num)
            c.drawRoundRect(RectF((b.x * s).toFloat(), (b.y * s).toFloat(), ((b.x + b.w) * s).toFloat(), ((b.y + b.h) * s).toFloat()), 1.2f * s, 1.2f * s, box)
            byQ[b.q]?.let { q ->
                // Hint sits ABOVE the box so it is never inside the scanned crop.
                c.drawText("${HINT[q::class]} · ${q.max} mark${if (q.max > 1) "s" else ""}", ((b.x + b.w) * s).toFloat(), ((b.y - 1) * s).toFloat(), hint)
            }
        }
    }

    /** Printable PDF of every answer-sheet page (A4). */
    fun sheetPdf(ctx: Context, title: String, className: String, questions: List<Question>, profile: Profile): File {
        val pages = SheetLayout.pages(questions)
        val doc = PdfDocument()
        val w = (SheetLayout.WIDTH * MM_TO_PT).roundToInt(); val h = (SheetLayout.HEIGHT * MM_TO_PT).roundToInt()
        try {
            pages.forEachIndexed { i, boxes ->
                val pg = doc.startPage(PdfDocument.PageInfo.Builder(w, h, i + 1).create())
                drawSheetPage(pg.canvas, ctx, MM_TO_PT.toFloat(), title, className, questions, boxes, i + 1, pages.size, profile)
                doc.finishPage(pg)
            }
            val out = File(File(ctx.cacheDir, "share").apply { mkdirs() }, "${safeName(title)}-answer-sheets.pdf")
            out.outputStream().use { doc.writeTo(it) }
            return out
        } finally { doc.close() }
    }

    /** On-screen preview of one sheet page. */
    fun sheetPreview(ctx: Context, title: String, className: String, questions: List<Question>, profile: Profile, pageIndex: Int, pxPerMm: Float = 4f): Bitmap {
        val pages = SheetLayout.pages(questions)
        val bmp = Bitmap.createBitmap((SheetLayout.WIDTH * pxPerMm).roundToInt(), (SheetLayout.HEIGHT * pxPerMm).roundToInt(), Bitmap.Config.ARGB_8888)
        drawSheetPage(Canvas(bmp), ctx, pxPerMm, title, className, questions, pages[pageIndex], pageIndex + 1, pages.size, profile)
        return bmp
    }

    fun safeName(s: String) = s.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-').lowercase().ifBlank { "redpen" }

    // ---- marked copy ----

    private fun glyph(c: Canvas, mark: Mark, x: Float, y: Float, size: Float, hand: Typeface) {
        val s = size / 56f
        val flagged = mark.status == MarkStatus.FLAGGED
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = if (flagged) FLAG else PEN; style = Paint.Style.STROKE; strokeWidth = 6 * s; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND
        }
        fun line(vararg pts: Pair<Float, Float>) {
            val path = Path().apply { moveTo(x + pts[0].first * s, y + pts[0].second * s); pts.drop(1).forEach { lineTo(x + it.first * s, y + it.second * s) } }
            c.drawPath(path, p)
        }
        when {
            flagged -> c.drawText("?", x + 14 * s, y + 48 * s, paint(FLAG, size, hand))
            mark.awarded == mark.max -> line(6f to 30f, 20f to 44f, 50f to 10f)
            mark.awarded > 0 -> { line(6f to 30f, 20f to 44f, 50f to 10f); line(30f to 44f, 44f to 30f) }
            else -> { line(10f to 10f, 46f to 46f); line(46f to 10f, 10f to 46f) }
        }
    }

    private fun totalBadge(c: Canvas, total: Int, max: Int, cx: Float, cy: Float, r: Float, hand: Typeface) {
        val ring = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = PEN; style = Paint.Style.STROKE; strokeWidth = r * 0.08f }
        c.save(); c.rotate(-7f, cx, cy); c.drawOval(RectF(cx - r * 1.25f, cy - r, cx + r * 1.25f, cy + r), ring); c.restore()
        val t = paint(PEN, r, hand).apply { textAlign = Paint.Align.CENTER }
        c.drawText("$total/$max", cx, cy + r * 0.35f, t)
    }

    private fun footer(c: Canvas, pupil: String, height: Int, scale: Float, body: Typeface) {
        c.drawText("$pupil · marked by REDPEN · ${DateFormat.getDateInstance().format(Date())}", 16 * scale, height - 12 * scale, paint(SOFT, 11 * scale, body))
    }

    /** Straightens the A4 sheet out of the photo through the scanner's homography (bilinear). */
    private fun straighten(photo: Bitmap, h: Homography, pxPerMm: Int): Bitmap {
        val outW = (SheetLayout.WIDTH * pxPerMm).toInt(); val outH = (SheetLayout.HEIGHT * pxPerMm).toInt()
        val pw = photo.width; val ph = photo.height
        val src = IntArray(pw * ph); photo.getPixels(src, 0, pw, 0, 0, pw, ph)
        val out = IntArray(outW * outH)
        for (oy in 0 until outH) for (ox in 0 until outW) {
            val p = h.apply(Pt(ox.toDouble() / pxPerMm, oy.toDouble() / pxPerMm))
            if (p.x < 0 || p.y < 0 || p.x >= pw - 1 || p.y >= ph - 1) { out[oy * outW + ox] = -1; continue }
            val xi = floor(p.x).toInt(); val yi = floor(p.y).toInt(); val fx = p.x - xi; val fy = p.y - yi
            var argb = 0xff shl 24
            for (shift in intArrayOf(16, 8, 0)) {
                fun ch(i: Int) = (src[i] shr shift) and 0xff
                val i00 = yi * pw + xi
                val top = ch(i00) * (1 - fx) + ch(i00 + 1) * fx
                val bottom = ch(i00 + pw) * (1 - fx) + ch(i00 + pw + 1) * fx
                argb = argb or ((top * (1 - fy) + bottom * fy).roundToInt().coerceIn(0, 255) shl shift)
            }
            out[oy * outW + ox] = argb
        }
        return Bitmap.createBitmap(out, outW, outH, Bitmap.Config.ARGB_8888)
    }

    /** Printed REDPEN sheet: draw each mark beside its own answer box on the straightened sheet. */
    fun sheetCopy(ctx: Context, photo: Bitmap, sheetToPhoto: Homography, boxes: List<SheetLayout.Box>, marks: List<Mark>, pupil: String): Bitmap {
        val mm = 4
        val page = straighten(photo, sheetToPhoto, mm).copy(Bitmap.Config.ARGB_8888, true)
        val c = Canvas(page); val f = fonts(ctx)
        for (b in boxes) {
            val m = marks.firstOrNull { it.q == b.q } ?: continue
            val size = (min(14.0, b.h - 2) * mm).toFloat()
            glyph(c, m, ((b.x + b.w - 30) * mm).toFloat(), ((b.y + 1) * mm).toFloat(), size, f.hand)
            c.drawText("${m.awarded}/${m.max}", ((b.x + b.w - 14) * mm).toFloat(), ((b.y + 10) * mm).toFloat(),
                paint(if (m.status == MarkStatus.FLAGGED) FLAG else PEN, 9f * mm, f.hand))
        }
        totalBadge(c, marks.sumOf { it.awarded }, marks.sumOf { it.max }, 172f * mm, 25f * mm, 9f * mm, f.hand)
        footer(c, pupil, page.height, mm / 2.5f, f.body)
        return page
    }

    /** Exercise-book page: keep the photo, add a red marking panel listing every question and the total. */
    fun pageCopy(ctx: Context, photo: Bitmap, marks: List<Mark>, pupil: String): Bitmap {
        val f = fonts(ctx)
        val scale = min(1f, 1600f / maxOf(photo.width, photo.height))
        val pw = (photo.width * scale).roundToInt(); val ph = (photo.height * scale).roundToInt()
        val panel = (pw * 0.32f).roundToInt()
        val out = Bitmap.createBitmap(pw + panel, ph, Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        c.drawColor(0xFFFBF8F1.toInt())
        c.drawBitmap(Bitmap.createScaledBitmap(photo, pw, ph, true), 0f, 0f, null)
        val u = panel / 100f
        totalBadge(c, marks.sumOf { it.awarded }, marks.sumOf { it.max }, pw + panel / 2f, 18 * u, 11 * u, f.hand)
        val row = min(14 * u, (ph - 46 * u) / maxOf(marks.size, 1))
        marks.forEachIndexed { i, m ->
            val y = 40 * u + i * row
            c.drawText("Q${m.shownLabel}", pw + 8 * u, y + row * 0.62f, paint(INK, row * 0.55f, f.display))
            glyph(c, m, pw + 34 * u, y + row * 0.1f, row * 0.8f, f.hand)
            c.drawText("${m.awarded}/${m.max}", pw + 62 * u, y + row * 0.68f, paint(if (m.status == MarkStatus.FLAGGED) FLAG else PEN, row * 0.7f, f.hand))
        }
        footer(c, pupil, out.height, u / 3, f.body)
        return out
    }

    // ---- letterhead ----

    data class Letterhead(val profile: Profile, val title: String, val className: String, val pupil: String, val total: Int, val max: Int, val comment: String)

    /** Splits text into lines that fit [maxWidth]; a single over-long word keeps its own line. */
    fun wrap(measure: (String) -> Float, text: String, maxWidth: Float): List<String> = text.split(Regex("\n+")).flatMap { para ->
        val lines = mutableListOf<String>(); var line = ""
        para.split(Regex("\\s+")).filter { it.isNotEmpty() }.forEach { word ->
            val next = if (line.isEmpty()) word else "$line $word"
            if (measure(next) <= maxWidth || line.isEmpty()) line = next else { lines += line; line = word }
        }
        if (line.isNotEmpty()) lines += line
        lines
    }

    /** Institution letterhead above the marked copy and the teacher's comment below it. */
    fun withLetterhead(ctx: Context, copy: Bitmap, info: Letterhead): Bitmap {
        val f = fonts(ctx)
        val width = copy.width; val u = width / 100f; val pad = 4 * u
        val details = paint(SOFT, 2.6f * u, f.body)
        val hand = paint(PEN, 4.2f * u, f.hand)
        val detailLines = if (info.profile.details.isBlank()) emptyList() else wrap(details::measureText, info.profile.details, width - 2 * pad)
        val commentLines = if (info.comment.isBlank()) emptyList() else wrap(hand::measureText, info.comment, width - 2 * pad)
        val headerH = (pad + (if (info.profile.institution.isNotBlank()) 5.2f * u else 0f) + detailLines.size * 3.4f * u + 7 * u + pad / 2).roundToInt()
        val footerH = if (commentLines.isEmpty()) pad / 2 else pad + 4 * u + commentLines.size * 5 * u + pad
        val out = Bitmap.createBitmap(width, (headerH + copy.height + footerH).roundToInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(out)
        c.drawColor(Color.WHITE)
        var y = pad
        if (info.profile.institution.isNotBlank()) { y += 4.4f * u; c.drawText(info.profile.institution, pad, y, paint(INK, 4.4f * u, f.display)); y += 0.8f * u }
        detailLines.forEach { y += 3f * u; c.drawText(it, pad, y, details); y += 0.4f * u }
        y += 1.2f * u + 3 * u
        val date = DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date())
        val meta = paint(INK, 3f * u, f.body, bold = true)
        val metaText = "${info.pupil} · ${info.title}${if (info.className.isNotBlank()) " · ${info.className}" else ""} · $date"
        val maxMeta = width - 2 * pad - 14 * u
        val w = meta.measureText(metaText)
        if (w > maxMeta) { c.save(); c.scale(maxMeta / w, 1f, pad, y); c.drawText(metaText, pad, y, meta); c.restore() } else c.drawText(metaText, pad, y, meta)
        c.drawText("${info.total}/${info.max}", width - pad, y + 1 * u, paint(PEN, 6f * u, f.hand).apply { textAlign = Paint.Align.RIGHT })
        c.drawLine(pad, headerH - pad / 4, width - pad, headerH - pad / 4, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = PEN; strokeWidth = maxOf(1f, 0.3f * u) })
        c.drawBitmap(copy, 0f, headerH.toFloat(), null)
        if (commentLines.isNotEmpty()) {
            var fy = headerH + copy.height + pad + 2.6f * u
            val who = info.profile.teacher.takeIf { it.isNotBlank() }?.let { "COMMENT FROM ${it.uppercase()}" } ?: "TEACHER’S COMMENT"
            c.drawText(who, pad, fy, paint(SOFT, 2.6f * u, f.body, bold = true)); fy += 1.4f * u
            commentLines.forEach { fy += 4.6f * u; c.drawText(it, pad, fy, hand) }
        }
        return out
    }

    /** Printable mark register (A4 landscape): letterhead, then students x questions with totals, status and comments. */
    fun registerPdf(ctx: Context, a: app.redpen.teacher.data.Assignment, rows: List<app.redpen.teacher.data.Register.Row>): File {
        val profile = registerProfile
        val f = fonts(ctx)
        val doc = PdfDocument()
        val w = (297 * MM_TO_PT).roundToInt(); val h = (210 * MM_TO_PT).roundToInt()
        val pad = 36f
        val qs = a.scheme.questions
        val nameW = 140f; val qW = 38f; val totW = 52f; val statW = 72f
        val commentW = (w - 2 * pad - nameW - qs.size * qW - totW - statW).coerceAtLeast(120f)
        val rowH = 30f
        var page: PdfDocument.Page? = null
        var y = 0f
        var pageNo = 0
        fun newPage() {
            page?.let { doc.finishPage(it) }
            pageNo += 1
            page = doc.startPage(PdfDocument.PageInfo.Builder(w, h, pageNo).create())
            val c = page!!.canvas
            y = pad
            if (profile.institution.isNotBlank()) { y += 18f; c.drawText(profile.institution, pad, y, paint(INK, 18f, f.display)) }
            if (profile.details.isNotBlank()) { y += 14f; c.drawText(profile.details, pad, y, paint(SOFT, 10f, f.body)) }
            y += 18f; c.drawText("${a.title} — ${a.className}", pad, y, paint(INK, 13f, f.body, bold = true))
            if (profile.teacher.isNotBlank()) { y += 13f; c.drawText("Teacher: ${profile.teacher}", pad, y, paint(SOFT, 10f, f.body)) }
            y += 14f
            val head = Paint().apply { color = INK }
            c.drawRect(pad, y, w - pad, y + 22f, head)
            val white = paint(Color.WHITE, 9f, f.body, bold = true)
            var x = pad + 4
            c.drawText("Student", x, y + 15f, white); x = pad + nameW
            qs.forEach { q -> c.drawText("Q${q.shownLabel} /${q.max}", x + 2, y + 15f, white); x += qW }
            c.drawText("Total /${a.maxTotal}", x + 2, y + 15f, white); x += totW
            c.drawText("Status", x + 2, y + 15f, white); x += statW
            c.drawText("Teacher’s comment", x + 2, y + 15f, white)
            y += 22f
        }
        newPage()
        val body = paint(INK, 10f, f.body); val bold = paint(INK, 10f, f.body, bold = true)
        val hand = paint(PEN, 13f, f.hand); val soft = paint(SOFT, 9f, f.body)
        val rule = Paint().apply { color = 0xFFE5DECF.toInt(); strokeWidth = 0.8f }
        for (r in rows) {
            if (y + rowH > h - pad) newPage()
            val c = page!!.canvas
            var x = pad + 4
            c.drawText(r.submission.pupil.take(28), x, y + 19f, bold); x = pad + nameW
            r.scores.forEachIndexed { i, v -> c.drawText(v?.toString() ?: "–", x + 8, y + 20f, if (v != null && v < qs[i].max) hand else paint(INK, 13f, f.hand)); x += qW }
            c.drawText("${r.total}", x + 8, y + 20f, hand); x += totW
            c.drawText(if (r.submission.queued != null) "Waiting" else if (r.unchecked > 0) "${r.unchecked} to check" else "Marked", x + 2, y + 19f, soft); x += statW
            val comment = wrap(body::measureText, r.submission.comment, commentW - 6).take(2)
            comment.forEachIndexed { i, line -> c.drawText(line, x + 2, y + 13f + i * 12f, body) }
            y += rowH
            c.drawLine(pad, y, w - pad, y, rule)
        }
        page?.let { doc.finishPage(it) }
        val out = File(File(ctx.cacheDir, "share").apply { mkdirs() }, "${safeName(a.title)}-register.pdf")
        try { out.outputStream().use { doc.writeTo(it) } } finally { doc.close() }
        return out
    }

    /** School details used by registerPdf (set by the register screen before printing). */
    var registerProfile: Profile = Profile()

    /** Printable catch-up sheet: heading, explanation, numbered practice questions with answers. */
    fun catchUpPdf(ctx: Context, title: String, q: Int, explanation: String, practice: List<Pair<String, String>>): File {
        val f = fonts(ctx)
        val doc = PdfDocument()
        val w = (210 * MM_TO_PT).roundToInt(); val h = (297 * MM_TO_PT).roundToInt()
        val pg = doc.startPage(PdfDocument.PageInfo.Builder(w, h, 1).create())
        val c = pg.canvas
        val pad = 48f
        var y = pad + 20f
        c.drawText("catch-up · question $q", pad, y, paint(PEN, 18f, f.hand)); y += 30f
        c.drawText("Let’s fix this together", pad, y, paint(INK, 22f, f.display)); y += 26f
        val body = paint(INK, 12f, f.body); val soft = paint(SOFT, 11f, f.body)
        wrap(body::measureText, explanation, w - 2 * pad).forEach { c.drawText(it, pad, y, body); y += 17f }
        y += 10f
        practice.forEachIndexed { i, (question, answer) ->
            wrap(body::measureText, "${i + 1}. $question", w - 2 * pad).forEach { c.drawText(it, pad, y, body); y += 17f }
            wrap(soft::measureText, "Answer: $answer", w - 2 * pad - 14).forEach { c.drawText(it, pad + 14, y, soft); y += 15f }
            y += 8f
        }
        c.drawText(title, pad, h - pad / 2, paint(SOFT, 9f, f.body))
        doc.finishPage(pg)
        val out = File(File(ctx.cacheDir, "share").apply { mkdirs() }, "${safeName(title)}-catch-up-q$q.pdf")
        try { out.outputStream().use { doc.writeTo(it) } } finally { doc.close() }
        return out
    }

    fun savePng(ctx: Context, bmp: Bitmap, name: String): File {
        val out = File(File(ctx.cacheDir, "share").apply { mkdirs() }, "${safeName(name)}.png")
        out.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
        return out
    }
}
