package app.redpen.teacher

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import app.redpen.teacher.ai.REMOTE_DEFAULTS
import com.google.firebase.Firebase
import app.redpen.teacher.ai.Ai
import com.google.firebase.ai.DownloadStatus
import com.google.firebase.ai.OnDeviceModelOption
import com.google.firebase.ai.OnDeviceModelStatus
import com.google.firebase.ai.type.PublicPreviewAPI
import com.google.firebase.appcheck.appCheck
import com.google.firebase.appcheck.debug.DebugAppCheckProviderFactory
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory
import com.google.firebase.auth.auth
import com.google.firebase.firestore.firestore
import com.google.firebase.firestore.firestoreSettings
import com.google.firebase.firestore.persistentCacheSettings
import com.google.firebase.initialize
import com.google.firebase.remoteconfig.remoteConfig
import com.google.firebase.remoteconfig.remoteConfigSettings
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await

class RedpenApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Firebase.initialize(this)
        app.redpen.teacher.ai.Privacy.init(this)
        // Sideloaded test builds use the App Check debug provider with a pre-registered token
        // (R.string.firebase_app_check_debug_token, injected from CI). Store builds use Play Integrity.
        Firebase.appCheck.installAppCheckProviderFactory(
            if (BuildConfig.DEBUG) DebugAppCheckProviderFactory.getInstance() else PlayIntegrityAppCheckProviderFactory.getInstance(),
        )
        Firebase.firestore.firestoreSettings = firestoreSettings { setLocalCacheSettings(persistentCacheSettings { }) }
        Firebase.remoteConfig.setConfigSettingsAsync(remoteConfigSettings { minimumFetchIntervalInSeconds = 3600 })
        Firebase.remoteConfig.setDefaultsAsync(REMOTE_DEFAULTS)
        Connectivity.start(this)
    }
}

/** Signs in anonymously (first run needs internet) and refreshes Remote Config best-effort. */
suspend fun bootstrap() {
    if (Firebase.auth.currentUser == null) Firebase.auth.signInAnonymously().await()
    runCatching { Firebase.remoteConfig.fetchAndActivate().await() }
}

object Connectivity {
    private val _online = MutableStateFlow(true)
    val online: StateFlow<Boolean> = _online

    fun start(ctx: Context) {
        val cm = ctx.getSystemService(ConnectivityManager::class.java)
        _online.value = cm.getNetworkCapabilities(cm.activeNetwork)?.let {
            it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && it.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } == true
        cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { _online.value = cm.getNetworkCapabilities(network)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                _online.value = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            }
            override fun onLost(network: Network) { _online.value = false }
        })
    }
}

/**
 * Gemini Nano (AICore) status. The SDK does NOT auto-download, so the app offers the download.
 * Status and download go through the reading model's own on-device extension, for each Nano option, because a phone
 * can support one Nano model (e.g. PREVIEW, Gemini Nano 4) while reporting the default one as unavailable.
 */
@OptIn(PublicPreviewAPI::class)
object DeviceModel {
    sealed interface State {
        data object Checking : State
        data object Ready : State
        data object Unavailable : State
        data object Downloadable : State
        data class Downloading(val bytes: Long) : State
        data class Failed(val message: String) : State
    }

    private val _state = MutableStateFlow<State>(State.Checking)
    val state: StateFlow<State> = _state

    /**
     * Re-checks Gemini Nano. Called at start-up, after a download finishes, and whenever the connection changes,
     * so "offline: mark on this device" is always current in the same session (same as web refreshDeviceCapability).
     */
    /** Every option's status from the last check, e.g. "preview=AVAILABLE, stable=UNAVAILABLE" (shown in logs and tests). */
    @Volatile var lastStatuses: String = ""
        private set

    suspend fun refresh() {
        val fresh = try {
            probe()
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            lastStatuses = "error: ${e.message}"
            State.Unavailable
        }
        // Keep the byte count of a download in progress instead of resetting it to 0.
        if (!(fresh is State.Downloading && _state.value is State.Downloading)) _state.value = fresh
    }

    /** Ready beats downloading beats downloadable; the chosen option is used for every on-device read. */
    private suspend fun probe(): State {
        val found = Ai.deviceOptions().map { it to statusOf(it) }
        lastStatuses = found.joinToString { (option, status) -> "${Ai.optionName(option)}=${status.second ?: status.first}" }
        val pick = found.firstOrNull { it.second.first == OnDeviceModelStatus.AVAILABLE }
            ?: found.firstOrNull { it.second.first == OnDeviceModelStatus.DOWNLOADING }
            ?: found.firstOrNull { it.second.first == OnDeviceModelStatus.DOWNLOADABLE }
            ?: return State.Unavailable
        Ai.deviceOption = pick.first
        return when (pick.second.first) {
            OnDeviceModelStatus.AVAILABLE -> State.Ready
            OnDeviceModelStatus.DOWNLOADING -> State.Downloading(0)
            else -> State.Downloadable
        }
    }

    /** Status of one Nano option. AICore can throw (e.g. 606 "feature not found") instead of answering UNAVAILABLE. */
    private suspend fun statusOf(option: OnDeviceModelOption): Pair<OnDeviceModelStatus, String?> = try {
        (Ai.onDevice(option)?.checkStatus() ?: OnDeviceModelStatus.UNAVAILABLE) to null
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        OnDeviceModelStatus.UNAVAILABLE to "error(${e::class.simpleName}: ${e.message?.take(80)})"
    }

    suspend fun download() {
        collectDownload()
        if (_state.value == State.Ready) refresh() // the shared capability must use the new model at once
    }

    private suspend fun collectDownload() {
        val option = Ai.deviceOption ?: Ai.deviceOptions().first()
        val extension = Ai.onDevice(option) ?: run { _state.value = State.Unavailable; return }
        extension.download().collect { s ->
            _state.value = when (s) {
                is DownloadStatus.DownloadStarted -> State.Downloading(0)
                is DownloadStatus.DownloadInProgress -> State.Downloading(s.totalBytesDownloaded)
                is DownloadStatus.DownloadCompleted -> State.Ready
                is DownloadStatus.DownloadFailed -> State.Failed("Download failed — check storage and Wi-Fi, then try again")
                else -> _state.value
            }
        }
    }
}
