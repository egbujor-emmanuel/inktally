@file:OptIn(com.google.firebase.ai.type.PublicPreviewAPI::class)

package app.redpen.teacher

import android.graphics.BitmapFactory
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.redpen.teacher.ai.Ai
import app.redpen.teacher.domain.Question
import app.redpen.teacher.domain.ReadSource
import app.redpen.teacher.marking.parseNumericAnswer
import com.google.firebase.ai.InferenceMode
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeoutOrNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Proof run on real Gemini Nano hardware (Firebase Test Lab: Pixel 10 / 11, Galaxy S25 / S26).
 * Downloads Nano if needed, then reads the same handwriting crops as bench/cloud.mjs with ON-DEVICE ONLY inference
 * (no cloud fallback) and logs each reading, where it ran and how long it took. Logcat tag: REDPEN_NANO.
 */
@RunWith(AndroidJUnit4::class)
class OnDeviceNanoTest {
    private fun log(msg: String) { Log.i(TAG, msg); println("$TAG $msg") }

    private val cases = listOf(
        Triple("m1", Question.Numeric(1, "", 1, listOf(56.0)), "56"),
        Triple("m2", Question.Numeric(2, "", 1, listOf(24.0)), "23"),
        Triple("m3", Question.Numeric(3, "", 1, listOf(12.0)), "12"),
        Triple("m4", Question.Numeric(4, "", 1, listOf(1.0)), "1"),
        Triple("m5", Question.Numeric(5, "", 1, listOf(20.0)), "25"),
        Triple("m6b", Question.Numeric(6, "", 2, listOf(27000.0)), "27000"),
        Triple("b1", Question.Points(7, "", 2, listOf("carries oxygen")), "Blood carries oxygen round the body and it fights germs"),
        Triple("b2", Question.Points(8, "", 3, listOf("makes bile")), "It makes bile and stores sugar"),
        Triple("b3", Question.Short(9, "", 1, listOf("photosynthesis")), "Photosynthesis"),
        Triple("b4", Question.Points(10, "", 1, listOf("carries oxygen")), "To fight diseases"),
    )

    @Test
    fun readsStudentHandwritingWithGeminiNanoOnDevice() = runBlocking {
        val device = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} (API ${android.os.Build.VERSION.SDK_INT})"
        // Same check the app makes (DeviceModel): every Nano option through the reading model's own on-device API.
        DeviceModel.refresh()
        log("DEVICE $device | Nano ${DeviceModel.state.value} | ${DeviceModel.lastStatuses}")
        // A freshly wiped phone may not have fetched its AICore configuration yet: keep checking for a few minutes.
        val waitUntil = System.currentTimeMillis() + CONFIG_WAIT_MS
        while (DeviceModel.state.value == DeviceModel.State.Unavailable && System.currentTimeMillis() < waitUntil) {
            delay(30_000)
            DeviceModel.refresh()
            log("re-check | ${DeviceModel.state.value} | ${DeviceModel.lastStatuses}")
        }
        if (DeviceModel.state.value == DeviceModel.State.Downloadable || DeviceModel.state.value is DeviceModel.State.Downloading) {
            val started = System.currentTimeMillis()
            val progress = launch { while (true) { delay(30_000); log("download ${DeviceModel.state.value}") } }
            withTimeoutOrNull(20 * 60_000L) { DeviceModel.download() } ?: log("download timed out after 20 min")
            progress.cancel()
            DeviceModel.refresh()
            log("after download (${(System.currentTimeMillis() - started) / 1000} s) | ${DeviceModel.state.value} | ${DeviceModel.lastStatuses}")
        }
        val status = DeviceModel.state.value
        assumeTrue("Gemini Nano not ready on $device: $status | ${DeviceModel.lastStatuses}", status == DeviceModel.State.Ready)
        log("USING Nano option ${Ai.deviceOption?.let { Ai.optionName(it) }}")

        val assets = InstrumentationRegistry.getInstrumentation().context.assets
        var mathsExact = 0
        var onDeviceReads = 0
        for ((id, question, truth) in cases) {
            val bmp = assets.open("crops/$id.png").use { BitmapFactory.decodeStream(it) }
            val started = System.currentTimeMillis()
            val read = runCatching { Ai.readAnswer(bmp, question, InferenceMode.ONLY_ON_DEVICE) }
                .getOrElse { log("READ $id ERROR ${it::class.simpleName}: ${it.message}"); continue }
            val ms = System.currentTimeMillis() - started
            if (read.source == ReadSource.ON_DEVICE) onDeviceReads++
            if (id.startsWith("m") && parseNumericAnswer(read.text).value == parseNumericAnswer(truth).value) mathsExact++
            log("READ $id | ${read.source} | $ms ms | read \"${read.text}\" | truth \"$truth\"")
        }
        log("SUMMARY device=$device onDeviceReads=$onDeviceReads/${cases.size} mathsExact=$mathsExact/6")
        assertTrue("expected every read to run on-device", onDeviceReads == cases.size)
    }

    private companion object {
        const val TAG = "REDPEN_NANO"
        /** How long to wait for a freshly wiped Test Lab phone to fetch its AICore (Gemini Nano) configuration. */
        const val CONFIG_WAIT_MS = 5 * 60_000L
    }
}
