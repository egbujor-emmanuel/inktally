package app.redpen.teacher

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.redpen.teacher.data.Repo
import app.redpen.teacher.ui.AccountChip
import app.redpen.teacher.ui.AssignmentScreen
import app.redpen.teacher.ui.GhostButton
import app.redpen.teacher.ui.HomeScreen
import app.redpen.teacher.ui.NewAssignmentScreen
import app.redpen.teacher.ui.PenButton
import app.redpen.teacher.ui.QuickMarkScreen
import app.redpen.teacher.ui.RP
import app.redpen.teacher.ui.RedpenTheme
import app.redpen.teacher.ui.SchoolScreen
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
                    val nav = rememberNavController()
                    Column(Modifier.safeDrawingPadding()) {
                        Header(nav, ready = boot == null)
                        val message = boot
                        if (message != null) {
                            Text(message, fontFamily = RP.Hand, fontSize = 26.sp, color = RP.InkSoft, modifier = Modifier.padding(24.dp))
                        } else {
                            WriteErrorBanner()
                            NavHost(nav, startDestination = "home") {
                                composable("home") {
                                    HomeScreen(onOpen = { nav.navigate("a/$it/print") }, onQuick = { nav.navigate("quick") }, onNew = { nav.navigate("new") })
                                }
                                composable("quick") { QuickMarkScreen(onOpenAssignment = { nav.navigate("a/$it/mark") { popUpTo("home") } }) }
                                composable("new") { NewAssignmentScreen(onSaved = { nav.navigate("a/$it/print") { popUpTo("home") } }) }
                                composable("school") { SchoolScreen(onDone = { nav.popBackStack() }) }
                                composable("a/{id}/{tab}") { entry ->
                                    AssignmentScreen(entry.arguments?.getString("id") ?: "", entry.arguments?.getString("tab") ?: "print",
                                        onDeleted = { nav.popBackStack("home", inclusive = false) })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Same header as the website: logo, Quick mark + New assignment, status, School details and account. */
@androidx.compose.runtime.Composable
private fun Header(nav: NavHostController, ready: Boolean) {
    Column(Modifier.fillMaxWidth().background(RP.Paper)) {
        Row(Modifier.padding(start = 16.dp, end = 16.dp, top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.clickable(enabled = ready) { nav.popBackStack("home", inclusive = false) }, verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.logo_mark), contentDescription = "REDPEN home", modifier = Modifier.size(36.dp))
                Spacer(Modifier.width(8.dp))
                Text("RED", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = RP.Ink)
                Text("PEN", fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = RP.Pen)
            }
            Spacer(Modifier.weight(1f))
            if (ready) AccountChip()
        }
        if (ready) Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            GhostButton("Quick mark", { nav.navigate("quick") { launchSingleTop = true } }, Modifier.weight(1f))
            PenButton("New assignment", { nav.navigate("new") { launchSingleTop = true } }, Modifier.weight(1f))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { StatusStrip() }
            if (ready) Text("School details", fontSize = 13.sp, fontWeight = FontWeight.Medium, textDecoration = TextDecoration.Underline,
                color = RP.Ink, modifier = Modifier.padding(end = 16.dp).clickable { nav.navigate("school") { launchSingleTop = true } })
        }
        HorizontalDivider(color = RP.Border)
    }
}

@androidx.compose.runtime.Composable
private fun WriteErrorBanner() {
    val error by Repo.writeError.collectAsState()
    error?.let {
        Row(Modifier.fillMaxWidth().padding(12.dp).background(androidx.compose.ui.graphics.Color.White).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("A change could not be saved: $it", color = RP.Pen, fontSize = 13.sp, modifier = Modifier.weight(1f))
            Text("Dismiss", fontSize = 13.sp, textDecoration = TextDecoration.Underline, modifier = Modifier.clickable { Repo.clearWriteError() })
        }
    }
}
