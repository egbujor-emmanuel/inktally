package app.redpen.teacher.ai

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Private mode: pupils' work never reaches a cloud AI (same rules and wording as web/src/ai/privacy.ts).
 * Every reading and marking-point check runs on this phone (Gemini Nano), the cloud check is off, and only the teacher's
 * own material (question paper, marking guide) may be sent to the cloud to draft an answer key. Photos never leave the
 * phone in any mode.
 *
 * Enforced twice: the model layer asks only for on-device inference, and [allows] refuses, before any request is built,
 * every pupil call while Gemini Nano is not ready (so the SDK can never fall back to the cloud) and every cloud call that
 * is not tagged as the teacher's own material.
 */
object Privacy {
    private const val PREFS = "inktally"
    private const val KEY = "privateMode"
    const val TEACHER_MATERIAL = "Source: the teacher’s own question paper or marking guide. No pupil work is included."
    const val BLOCKED = "Private mode is on, so pupils’ work is read only on this device and never sent to the cloud."

    private val _on = MutableStateFlow(false)
    val on: StateFlow<Boolean> = _on
    val isPrivate: Boolean get() = _on.value
    private var prefs: android.content.SharedPreferences? = null

    fun init(ctx: Context) {
        prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        _on.value = prefs?.getBoolean(KEY, false) ?: false
    }

    /** A phone setting: the teacher decides, per device, that pupils' work stays on it. */
    fun set(on: Boolean) {
        _on.value = on
        prefs?.edit()?.putBoolean(KEY, on)?.apply()
    }

    /**
     * Pure rule, unit-tested. [cloud] is true for a cloud-only call (drafting, catch-up sheets, the cloud check);
     * otherwise it is a reading or point check that must run on Gemini Nano.
     */
    fun allows(privateMode: Boolean, cloud: Boolean, deviceReady: Boolean, requestText: String): Boolean = when {
        !privateMode -> true
        cloud -> TEACHER_MATERIAL in requestText
        else -> deviceReady
    }

    /** Throws before anything is sent when Private mode forbids this call. */
    fun check(cloud: Boolean, deviceReady: Boolean, requestText: String = "") {
        if (!allows(isPrivate, cloud, deviceReady, requestText)) throw PrivateModeException()
    }
}

class PrivateModeException : IllegalStateException(Privacy.BLOCKED)
