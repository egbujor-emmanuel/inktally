package app.redpen.teacher.scan

import app.redpen.teacher.domain.Question
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

// Kotlin port of web/src/scan/{homography,layout,fiducials}.ts — identical geometry on both platforms.

data class Pt(val x: Double, val y: Double)

class Homography(private val h: DoubleArray) {
    fun apply(p: Pt): Pt {
        val w = h[6] * p.x + h[7] * p.y + h[8]
        return Pt((h[0] * p.x + h[1] * p.y + h[2]) / w, (h[3] * p.x + h[4] * p.y + h[5]) / w)
    }

    companion object {
        fun compute(from: List<Pt>, to: List<Pt>): Homography {
            require(from.size == 4 && to.size == 4) { "Need exactly 4 point pairs" }
            val a = Array(8) { DoubleArray(9) }
            for (i in 0 until 4) {
                val (x, y) = from[i]; val (u, v) = to[i]
                a[2 * i] = doubleArrayOf(x, y, 1.0, 0.0, 0.0, 0.0, -u * x, -u * y, u)
                a[2 * i + 1] = doubleArrayOf(0.0, 0.0, 0.0, x, y, 1.0, -v * x, -v * y, v)
            }
            for (col in 0 until 8) {
                var pivot = col
                for (r in col + 1 until 8) if (abs(a[r][col]) > abs(a[pivot][col])) pivot = r
                require(abs(a[pivot][col]) > 1e-12) { "Degenerate points: cannot compute perspective" }
                val tmp = a[col]; a[col] = a[pivot]; a[pivot] = tmp
                for (r in 0 until 8) if (r != col) {
                    val f = a[r][col] / a[col][col]
                    for (c in col..8) a[r][c] -= f * a[col][c]
                }
            }
            return Homography(DoubleArray(9) { i -> if (i == 8) 1.0 else a[i][8] / a[i][i] })
        }
    }
}

object SheetLayout {
    const val WIDTH = 210.0
    const val HEIGHT = 297.0
    const val FIDUCIAL_SIZE = 12.0
    private const val INSET = 10.0
    private const val HALF = FIDUCIAL_SIZE / 2
    val FIDUCIALS = listOf(
        Pt(INSET + HALF, INSET + HALF), Pt(WIDTH - INSET - HALF, INSET + HALF),
        Pt(WIDTH - INSET - HALF, HEIGHT - INSET - HALF), Pt(INSET + HALF, HEIGHT - INSET - HALF),
    )
    private const val LEFT = 32.0
    private const val RIGHT = WIDTH - 18
    private const val TOP = 62.0
    private const val BOTTOM = HEIGHT - 26
    private const val GAP = 5.0

    data class Box(val q: Int, val x: Double, val y: Double, val w: Double, val h: Double)

    fun boxHeight(q: Question): Double = when (q) {
        is Question.Objective -> 16.0
        is Question.Numeric -> if (q.methodPoints.isNotEmpty()) 34.0 else 18.0
        is Question.Short -> 18.0
        is Question.Points -> min(70.0, 22.0 + q.max * 9.0)
    }

    fun pages(questions: List<Question>): List<List<Box>> {
        val pages = mutableListOf<List<Box>>()
        var current = mutableListOf<Box>()
        var y = TOP
        for (q in questions) {
            val h = boxHeight(q)
            if (y + h > BOTTOM && current.isNotEmpty()) { pages += current; current = mutableListOf(); y = TOP }
            current += Box(q.q, LEFT, y, RIGHT - LEFT, h)
            y += h + GAP
        }
        if (current.isNotEmpty()) pages += current
        return pages
    }
}

/** Grayscale image as a flat array of 0..255 luminance values. */
class GrayImage(val width: Int, val height: Int, val data: IntArray)

sealed interface FiducialResult {
    data class Found(val corners: List<Pt>) : FiducialResult
    data class Missing(val reason: String) : FiducialResult
}

object Fiducials {
    private const val MIN_SIDE = 0.02
    private const val MAX_SIDE = 0.14
    private const val MIN_FILL = 0.72
    private const val MAX_SKEW = 0.45

    fun otsu(img: GrayImage): Int {
        val hist = IntArray(256); img.data.forEach { hist[it]++ }
        val total = img.data.size
        var sumAll = 0.0; for (i in 0 until 256) sumAll += i * hist[i].toDouble()
        var sumB = 0.0; var wB = 0; var best = 0.0; var threshold = 127
        for (t in 0 until 256) {
            wB += hist[t]; if (wB == 0) continue
            val wF = total - wB; if (wF == 0) break
            sumB += t * hist[t].toDouble()
            val between = wB.toDouble() * wF * (sumB / wB - (sumAll - sumB) / wF).let { it * it }
            if (between > best) { best = between; threshold = t }
        }
        return threshold
    }

    fun find(img: GrayImage): FiducialResult {
        val threshold = otsu(img)
        val minDim = min(img.width, img.height)
        val seen = BooleanArray(img.data.size)
        val stack = IntArray(img.data.size)
        val candidates = mutableListOf<Pt>()
        for (start in img.data.indices) {
            if (seen[start] || img.data[start] > threshold) continue
            var sp = 0; stack[sp++] = start; seen[start] = true
            var area = 0; var sx = 0L; var sy = 0L
            var minX = img.width; var minY = img.height; var maxX = 0; var maxY = 0
            while (sp > 0) {
                val idx = stack[--sp]; val x = idx % img.width; val y = idx / img.width
                area++; sx += x; sy += y
                minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
                fun push(n: Int) { if (!seen[n] && img.data[n] <= threshold) { seen[n] = true; stack[sp++] = n } }
                if (x > 0) push(idx - 1); if (x < img.width - 1) push(idx + 1)
                if (y > 0) push(idx - img.width); if (y < img.height - 1) push(idx + img.width)
            }
            val w = maxX - minX + 1; val h = maxY - minY + 1; val side = max(w, h)
            val plausible = side >= minDim * MIN_SIDE && side <= minDim * MAX_SIDE &&
                abs(w - h).toDouble() / side <= MAX_SKEW && area.toDouble() / (w * h) >= MIN_FILL
            if (plausible) candidates += Pt(sx.toDouble() / area, sy.toDouble() / area)
        }
        if (candidates.size < 4) return FiducialResult.Missing("Found ${candidates.size} of 4 corner squares. Fit the whole sheet in the photo, in good light.")
        val tl = candidates.maxBy { -(it.x + it.y) }
        val tr = candidates.maxBy { it.x - it.y }
        val br = candidates.maxBy { it.x + it.y }
        val bl = candidates.maxBy { it.y - it.x }
        val corners = listOf(tl, tr, br, bl)
        if (corners.toSet().size < 4) return FiducialResult.Missing("Corner squares are ambiguous. Retake the photo straight above the sheet.")
        return FiducialResult.Found(corners)
    }
}
