package app.redpen.teacher.scan

import android.graphics.Bitmap
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.roundToInt

/** Photo -> corner markers -> perspective fix -> one Bitmap per answer box (names never leave the device). */
object Scanner {
    private const val DETECT_MAX_SIDE = 1000
    private const val PX_PER_MM = 6.0
    private const val INNER_MARGIN_MM = 1.2

    sealed interface Result {
        data class Ok(val crops: Map<Int, Bitmap>, val sheetToPhoto: Homography) : Result
        data class Failed(val reason: String) : Result
    }

    private fun gray(bitmap: Bitmap): GrayImage {
        val px = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(px, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        val data = IntArray(px.size) { i ->
            val c = px[i]
            (((c shr 16) and 0xff) * 299 + ((c shr 8) and 0xff) * 587 + (c and 0xff) * 114) / 1000
        }
        return GrayImage(bitmap.width, bitmap.height, data)
    }

    fun scan(photo: Bitmap, boxes: List<SheetLayout.Box>): Result {
        val scale = minOf(1.0, DETECT_MAX_SIDE.toDouble() / max(photo.width, photo.height))
        val small = Bitmap.createScaledBitmap(photo, (photo.width * scale).roundToInt(), (photo.height * scale).roundToInt(), true)
        val found = when (val r = Fiducials.find(gray(small))) {
            is FiducialResult.Missing -> return Result.Failed(r.reason)
            is FiducialResult.Found -> r.corners
        }
        val photoCorners = found.map { Pt(it.x / scale, it.y / scale) }
        val h = Homography.compute(SheetLayout.FIDUCIALS, photoCorners)
        val src = IntArray(photo.width * photo.height)
        photo.getPixels(src, 0, photo.width, 0, 0, photo.width, photo.height)
        return Result.Ok(boxes.associate { it.q to warp(src, photo.width, photo.height, h, it) }, h)
    }

    private fun warp(src: IntArray, pw: Int, ph: Int, h: Homography, box: SheetLayout.Box): Bitmap {
        val x0 = box.x + INNER_MARGIN_MM; val y0 = box.y + INNER_MARGIN_MM
        val outW = ((box.w - 2 * INNER_MARGIN_MM) * PX_PER_MM).roundToInt()
        val outH = ((box.h - 2 * INNER_MARGIN_MM) * PX_PER_MM).roundToInt()
        val out = IntArray(outW * outH)
        for (oy in 0 until outH) for (ox in 0 until outW) {
            val p = h.apply(Pt(x0 + ox / PX_PER_MM, y0 + oy / PX_PER_MM))
            if (p.x < 0 || p.y < 0 || p.x >= pw - 1 || p.y >= ph - 1) { out[oy * outW + ox] = -1; continue }
            val xi = floor(p.x).toInt(); val yi = floor(p.y).toInt()
            val fx = p.x - xi; val fy = p.y - yi
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
}
