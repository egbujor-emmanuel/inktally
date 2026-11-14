package app.redpen.teacher

import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import app.redpen.teacher.ai.REMOTE_DEFAULTS
import com.google.firebase.Firebase
import com.google.firebase.ai.ondevice.DownloadStatus
import com.google.firebase.ai.ondevice.FirebaseAIOnDevice
import com.google.firebase.ai.ondevice.OnDeviceModelStatus
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

/** Gemini Nano (AICore) status. The SDK does NOT auto-download, so the app offers the download. */
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
    suspend fun refresh() {
        val fresh = try {
            when (FirebaseAIOnDevice.checkStatus()) {
                OnDeviceModelStatus.AVAILABLE -> State.Ready
                OnDeviceModelStatus.DOWNLOADABLE -> State.Downloadable
                OnDeviceModelStatus.DOWNLOADING -> State.Downloading(0)
                else -> State.Unavailable
            }
        } catch (e: kotlinx.coroutines.CancellationException) {
            throw e
        } catch (e: Exception) {
            State.Unavailable
        }
        // Keep the byte count of a download in progress instead of resetting it to 0.
        if (!(fresh is State.Downloading && _state.value is State.Downloading)) _state.value = fresh
    }

    suspend fun download() {
        collectDownload()
        if (_state.value == State.Ready) refresh() // the shared capability must use the new model at once
    }

    private suspend fun collectDownload() {
        FirebaseAIOnDevice.download().collect { s ->
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
