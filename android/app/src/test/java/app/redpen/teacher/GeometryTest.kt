package app.redpen.teacher

import app.redpen.teacher.scan.FiducialResult
import app.redpen.teacher.scan.Fiducials
import app.redpen.teacher.scan.GrayImage
import app.redpen.teacher.scan.Homography
import app.redpen.teacher.scan.Pt
import app.redpen.teacher.scan.SheetLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot

class GeometryTest {
    private val sheetCorners = listOf(Pt(0.0, 0.0), Pt(SheetLayout.WIDTH, 0.0), Pt(SheetLayout.WIDTH, SheetLayout.HEIGHT), Pt(0.0, SheetLayout.HEIGHT))

    @Test fun homographyMapsCornersExactly() {
        val photo = listOf(Pt(120.0, 90.0), Pt(860.0, 140.0), Pt(900.0, 1210.0), Pt(60.0, 1150.0))
        val h = Homography.compute(sheetCorners, photo)
        sheetCorners.forEachIndexed { i, s ->
            val p = h.apply(s)
            assertEquals(photo[i].x, p.x, 1e-6); assertEquals(photo[i].y, p.y, 1e-6)
        }
    }

    @Test fun findsFiducialsOnTiltedSyntheticSheet() {
        val w = 900; val hgt = 1200
        val photoCorners = listOf(Pt(110.0, 70.0), Pt(820.0, 120.0), Pt(860.0, 1150.0), Pt(60.0, 1100.0))
        val toSheet = Homography.compute(photoCorners, sheetCorners)
        val half = SheetLayout.FIDUCIAL_SIZE / 2
        val data = IntArray(w * hgt) { idx ->
            val s = toSheet.apply(Pt((idx % w).toDouble(), (idx / w).toDouble()))
            when {
                s.x < 0 || s.y < 0 || s.x > SheetLayout.WIDTH || s.y > SheetLayout.HEIGHT -> 70
                SheetLayout.FIDUCIALS.any { abs(s.x - it.x) <= half && abs(s.y - it.y) <= half } -> 15
                abs(s.y - 80) < 0.4 && s.x in 40.0..150.0 -> 30 // handwriting-like stroke
                else -> 235
            }
        }
        val result = Fiducials.find(GrayImage(w, hgt, data))
        assertTrue(result is FiducialResult.Found)
        val toPhoto = Homography.compute(sheetCorners, photoCorners)
        (result as FiducialResult.Found).corners.forEachIndexed { i, c ->
            val e = toPhoto.apply(SheetLayout.FIDUCIALS[i])
            assertTrue(hypot(c.x - e.x, c.y - e.y) < 4)
        }
    }

    @Test fun layoutMatchesWebForEnglishSample() {
        val boxes = SheetLayout.pages(listOf(
            app.redpen.teacher.domain.Question.Objective(1, "", 1, listOf("B")),
            app.redpen.teacher.domain.Question.Short(4, "", 1, listOf("Abuja")),
        )).single()
        assertEquals(62.0, boxes[0].y, 0.0)
        assertEquals(83.0, boxes[1].y, 0.0) // 62 + 16 + 5, same as web/src/scan/layout.ts
    }

    /** Same 12-question assignment as web/e2e/multipage-scan.mjs: both platforms must split sheet pages identically. */
    @Test fun multiPageSplitMatchesWeb() {
        val questions = (1..12).map { n ->
            if (n % 3 == 0) app.redpen.teacher.domain.Question.Points(n, "Theory $n", 3, listOf("a", "b", "c"))
            else app.redpen.teacher.domain.Question.Short(n, "Q$n", 1, listOf("x"))
        }
        val pages = SheetLayout.pages(questions)
        org.junit.Assert.assertEquals(2, pages.size)
        org.junit.Assert.assertEquals(listOf(7, 8, 9, 10, 11, 12), pages[1].map { it.q })
    }
}
