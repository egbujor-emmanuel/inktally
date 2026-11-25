package app.redpen.teacher.scan

import android.graphics.Bitmap
import android.graphics.Matrix

// Turns a sideways exercise-book photo upright before it is read (same rules and numbers as web/src/scan/orient.ts).
// On a page photographed sideways the model attached every answer to the label above it, so the page is turned in code.
// 1) Which way do the lines run? Each blob of ink looks at its two nearest neighbours: neighbours on the same line are
//    closer than those on the next line, so the directions pile up along the lines ("docstrum").
// 2) Which way round? Writing starts at a straight left margin and ends ragged.
// A page is only turned on clear evidence; upside-down pages are left alone.
object Orient {
    const val SIDE = 480
    const val SIDEWAYS_RATIO = 0.75
    const val MIN_MARGIN_EVIDENCE = 10.0
    private const val LOCAL_RADIUS = 15
    private const val INK_DARKER_BY = 18
    private const val MIN_BLOBS = 10

    class Mask(val w: Int, val h: Int, val ink: BooleanArray)

    /** Ink = noticeably darker than the paper around it (a local mean, so shadows and uneven light do not count). */
    fun inkMask(gray: IntArray, w: Int, h: Int): Mask {
        val k = LOCAL_RADIUS
        val stride = w + 1
        val sums = DoubleArray(stride * (h + 1))
        for (y in 0 until h) {
            var row = 0.0
            for (x in 0 until w) { row += gray[y * w + x]; sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row }
        }
        val ink = BooleanArray(w * h)
        for (y in 0 until h) {
            val y0 = maxOf(0, y - k); val y1 = minOf(h, y + k)
            for (x in 0 until w) {
                val x0 = maxOf(0, x - k); val x1 = minOf(w, x + k)
                val total = sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0]
                if (gray[y * w + x] < total / ((y1 - y0) * (x1 - x0)) - INK_DARKER_BY) ink[y * w + x] = true
            }
        }
        return Mask(w, h, ink)
    }

    private class InkBlob(val size: Int, val cy: Double, val cx: Double, val height: Int, val width: Int)

    private fun blobs(m: Mask): List<InkBlob> {
        val seen = BooleanArray(m.w * m.h)
        val out = mutableListOf<InkBlob>()
        val stack = ArrayDeque<Int>()
        for (start in 0 until m.w * m.h) {
            if (!m.ink[start] || seen[start]) continue
            seen[start] = true; stack.addLast(start)
            var size = 0; var sy = 0L; var sx = 0L; var minY = m.h; var maxY = 0; var minX = m.w; var maxX = 0
            while (stack.isNotEmpty()) {
                val i = stack.removeLast(); val y = i / m.w; val x = i % m.w
                size++; sy += y; sx += x
                minY = minOf(minY, y); maxY = maxOf(maxY, y); minX = minOf(minX, x); maxX = maxOf(maxX, x)
                for (dy in -1..1) for (dx in -1..1) {
                    val yy = y + dy; val xx = x + dx
                    if (yy < 0 || yy >= m.h || xx < 0 || xx >= m.w) continue
                    val j = yy * m.w + xx
                    if (m.ink[j] && !seen[j]) { seen[j] = true; stack.addLast(j) }
                }
            }
            out += InkBlob(size, sy.toDouble() / size, sx.toDouble() / size, maxY - minY + 1, maxX - minX + 1)
        }
        return out
    }

    data class Votes(val horizontal: Int, val vertical: Int, val blobs: Int)

    /** How many nearest-neighbour directions run along rows versus along columns. */
    fun lineVotes(m: Mask, neighbours: Int = 2): Votes {
        val pts = blobs(m).filter { it.size >= 4 && it.height < m.h / 6.0 && it.width < m.w / 3.0 }
        var horizontal = 0; var vertical = 0
        for (i in pts.indices) {
            val nearest = pts.indices.filter { it != i }.sortedBy { j -> Math.hypot(pts[j].cy - pts[i].cy, pts[j].cx - pts[i].cx) }.take(neighbours)
            for (j in nearest) {
                val angle = Math.abs(Math.toDegrees(Math.atan2(pts[j].cy - pts[i].cy, pts[j].cx - pts[i].cx))) % 180
                val fromHorizontal = minOf(angle, 180 - angle)
                if (fromHorizontal < 30) horizontal++ else if (fromHorizontal > 60) vertical++
            }
        }
        return Votes(horizontal, vertical, pts.size)
    }

    /** The mask turned a quarter turn: clockwise when [cw], else anticlockwise. */
    fun quarterTurn(m: Mask, cw: Boolean): Mask {
        val out = BooleanArray(m.w * m.h)
        for (y in 0 until m.h) for (x in 0 until m.w) {
            val nx = if (cw) m.h - 1 - y else y
            val ny = if (cw) x else m.w - 1 - x
            out[ny * m.h + nx] = m.ink[y * m.w + x]
        }
        return Mask(m.h, m.w, out)
    }

    private fun spread(v: List<Int>): Double { val mean = v.average(); return Math.sqrt(v.sumOf { (it - mean) * (it - mean) } / v.size) }

    /** Positive when rows start at a straighter edge on the left than they end on the right, as upright writing does. */
    fun marginScore(m: Mask): Double {
        val firsts = mutableListOf<Int>(); val lasts = mutableListOf<Int>()
        for (y in 0 until m.h) {
            var first = -1; var last = -1; var count = 0
            for (x in 0 until m.w) if (m.ink[y * m.w + x]) { if (first < 0) first = x; last = x; count++ }
            if (count > 2) { firsts += first; lasts += last }
        }
        return if (firsts.size < 5) 0.0 else spread(lasts) - spread(firsts)
    }

    /** Degrees to turn the page clockwise so its writing is upright: 0, 90 or 270. */
    fun uprightTurn(m: Mask): Int {
        val v = lineVotes(m)
        if (v.blobs < MIN_BLOBS || v.horizontal >= SIDEWAYS_RATIO * v.vertical) return 0
        val cw = marginScore(quarterTurn(m, true)); val ccw = marginScore(quarterTurn(m, false))
        if (Math.abs(cw - ccw) < 2 * MIN_MARGIN_EVIDENCE) return 0
        return if (cw > ccw) 90 else 270
    }

    /** The photo turned upright, or the same bitmap when it already is or when the evidence is unclear. */
    fun upright(photo: Bitmap): Bitmap {
        val scale = minOf(1.0, SIDE.toDouble() / maxOf(photo.width, photo.height))
        val w = maxOf(1, Math.round(photo.width * scale).toInt()); val h = maxOf(1, Math.round(photo.height * scale).toInt())
        val small = Bitmap.createScaledBitmap(photo, w, h, true)
        val px = IntArray(w * h).also { small.getPixels(it, 0, w, 0, 0, w, h) }
        if (small != photo) small.recycle()
        val gray = IntArray(w * h) { i -> val c = px[i]; (((c shr 16) and 0xff) * 299 + ((c shr 8) and 0xff) * 587 + (c and 0xff) * 114) / 1000 }
        val turn = uprightTurn(inkMask(gray, w, h))
        return if (turn == 0) photo else Bitmap.createBitmap(photo, 0, 0, photo.width, photo.height, Matrix().apply { postRotate(turn.toFloat()) }, true)
    }
}
