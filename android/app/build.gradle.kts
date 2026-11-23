plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.google.services)
}

// App Check debug token for sideloaded test builds. Injected from a CI secret; never committed.
val appCheckDebugToken: String = System.getenv("REDPEN_APPCHECK_DEBUG_TOKEN") ?: ""
// Permanent signing key (PKCS12) supplied by CI so every build can update the previous install
// and Google sign-in (SHA fingerprints registered in Firebase) keeps working.
val keystoreFile: String? = System.getenv("REDPEN_KEYSTORE_FILE")
val keystorePassword: String = System.getenv("REDPEN_KEYSTORE_PASSWORD") ?: ""

android {
    namespace = "app.redpen.teacher"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.redpen.teacher"
        minSdk = 26
        targetSdk = 36
        versionCode = 13
        versionName = "0.8.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (keystoreFile != null) {
            create("redpen") {
                storeFile = file(keystoreFile)
                storePassword = keystorePassword
                keyAlias = "redpen"
                keyPassword = keystorePassword
                storeType = "pkcs12"
            }
        }
    }

    buildTypes {
        debug {
            if (keystoreFile != null) signingConfig = signingConfigs.getByName("redpen")
            resValue("string", "firebase_app_check_debug_token", appCheckDebugToken)
        }
        release {
            isMinifyEnabled = false
            if (keystoreFile != null) signingConfig = signingConfigs.getByName("redpen")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
        resValues = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.lifecycle.runtime.compose)
    implementation(libs.navigation.compose)
    implementation(libs.exifinterface)
    implementation(libs.core.ktx)
    implementation(libs.credentials)
    implementation(libs.credentials.play.services)
    implementation(libs.googleid)

    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.firebase.firestore)
    implementation(libs.firebase.config)
    implementation(libs.firebase.appcheck.playintegrity)
    implementation(libs.firebase.appcheck.debug)
    implementation(libs.firebase.ai)
    implementation(libs.firebase.ai.ondevice)
    implementation(libs.coroutines.play.services)

    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.junit)
}
