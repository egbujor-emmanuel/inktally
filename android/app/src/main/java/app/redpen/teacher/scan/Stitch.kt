package app.redpen.teacher.scan

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect

// A student's script often runs over several exercise-book pages, and an answer can continue onto the next page.
// The pages are joined one above the other into one image, so the whole script is read, marked, saved, queued offline
// and cloud-checked exactly like a one-page script. Same rules as web/src/scan/stitch.ts.
object Stitch {
    /** Widest joined image, in pixels: enough for handwriting, small enough to hold several pages in memory. */
    const val MAX_WIDTH = 1400
    /** Grey band between pages, in pixels, so the reader sees where each page ends. */
    const val GAP = 24
    /** Most pages joined into one script. */
    const val MAX_PAGES = 4

    data class Box(val x: Int, val y: Int, val w: Int, val h: Int)
    data class Layout(val width: Int, val height: Int, val boxes: List<Box>)

    /** Every page scaled to one shared width (the widest page, at most [maxWidth]) and stacked top to bottom in order. */
    fun layout(sizes: List<Pair<Int, Int>>, maxWidth: Int = MAX_WIDTH, gap: Int = GAP): Layout {
        require(sizes.isNotEmpty()) { "No pages to join." }
        val width = minOf(maxWidth, sizes.maxOf { it.first })
        var y = 0
        val boxes = sizes.mapIndexed { i, (w, h) ->
            val scaled = Math.round(h.toDouble() * width / w).toInt()
            Box(0, y + if (i > 0) gap else 0, width, scaled).also { y = it.y + scaled }
        }
        return Layout(width, y, boxes)
    }

    /** Joins the photographed pages of one student's script into one image, in the order chosen. */
    fun join(photos: List<Bitmap>): Bitmap {
        require(photos.size <= MAX_PAGES) { "Choose at most $MAX_PAGES pages for one student." }
        val pages = photos.map { Orient.upright(it) } // each page turned upright if it was photographed sideways
        val plan = layout(pages.map { it.width to it.height })
        val out = Bitmap.createBitmap(plan.width, plan.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)
        canvas.drawColor(Color.rgb(0x9a, 0xa0, 0xa6))
        val paint = Paint(Paint.FILTER_BITMAP_FLAG)
        pages.forEachIndexed { i, page ->
            val b = plan.boxes[i]
            canvas.drawBitmap(page, null, Rect(b.x, b.y, b.x + b.w, b.y + b.h), paint)
        }
        pages.forEachIndexed { i, page -> if (page !== photos[i]) page.recycle() }
        return out
    }
}
