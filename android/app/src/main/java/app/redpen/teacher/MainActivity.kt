package app.redpen.teacher

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.redpen.teacher.ui.AssignmentScreen
import app.redpen.teacher.ui.HomeScreen
import app.redpen.teacher.ui.RP
import app.redpen.teacher.ui.RedpenTheme
import app.redpen.teacher.ui.StatusStrip

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            RedpenTheme {
                Surface(color = RP.Paper, modifier = Modifier.fillMaxSize()) {
                    var boot by remember { mutableStateOf<String?>("Getting your desk ready…") }
                    LaunchedEffect(Unit) {
                        boot = runCatching { bootstrap(); DeviceModel.refresh(); null }
                            .getOrElse { "REDPEN needs internet once to set up: ${it.message}" }
                    }
                    Column(Modifier.safeDrawingPadding()) {
                        Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Image(painterResource(R.drawable.ic_launcher_foreground), null, Modifier.size(40.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("RED", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = RP.Ink)
                            Text("PEN", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = RP.Pen)
                        }
                        StatusStrip()
                        val message = boot
                        if (message != null) {
                            Text(message, fontFamily = RP.Hand, fontSize = 26.sp, color = RP.InkSoft, modifier = Modifier.padding(24.dp))
                        } else {
                            val nav = rememberNavController()
                            NavHost(nav, startDestination = "home") {
                                composable("home") { HomeScreen(onOpen = { nav.navigate("a/$it") }) }
                                composable("a/{id}") { entry -> AssignmentScreen(entry.arguments?.getString("id") ?: "") }
                            }
                        }
                    }
                }
            }
        }
    }
}
