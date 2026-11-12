package app.redpen.teacher

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.auth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.tasks.await

/**
 * Same account model as the web app: start as a private guest; "Sign in with Google" LINKS the guest
 * account so existing work is kept, and the same assignments appear on web + Android.
 */
object Account {
    data class State(val uid: String?, val isGuest: Boolean, val label: String)

    private val _state = MutableStateFlow(snapshot())
    val state: StateFlow<State> = _state

    init { Firebase.auth.addAuthStateListener { _state.value = snapshot() } }

    private fun snapshot(): State {
        val u = Firebase.auth.currentUser
        val guest = u == null || u.isAnonymous
        return State(u?.uid, guest, if (guest) "Guest" else (u?.displayName ?: u?.email ?: "Signed in"))
    }

    sealed interface Result {
        data object Linked : Result
        data object Switched : Result
        data object Cancelled : Result
    }

    suspend fun signInWithGoogle(activity: Activity): Result {
        val webClientId = activity.getString(R.string.default_web_client_id)
        val request = GetCredentialRequest.Builder().addCredentialOption(GetSignInWithGoogleOption.Builder(webClientId).build()).build()
        val credential = try {
            CredentialManager.create(activity).getCredential(activity, request).credential
        } catch (e: GetCredentialCancellationException) {
            return Result.Cancelled
        }
        require(credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) { "Unexpected sign-in response" }
        val firebaseCredential = GoogleAuthProvider.getCredential(GoogleIdTokenCredential.createFrom(credential.data).idToken, null)
        val user = Firebase.auth.currentUser
        return if (user?.isAnonymous == true) {
            try { user.linkWithCredential(firebaseCredential).await(); Result.Linked } catch (e: FirebaseAuthUserCollisionException) {
                Firebase.auth.signInWithCredential(firebaseCredential).await(); Result.Switched
            }
        } else {
            Firebase.auth.signInWithCredential(firebaseCredential).await(); Result.Switched
        }
    }

    suspend fun signOutToGuest() {
        Firebase.auth.signOut()
        Firebase.auth.signInAnonymously().await()
    }
}
