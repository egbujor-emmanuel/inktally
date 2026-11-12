package app.redpen.teacher.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import app.redpen.teacher.R

// Same tokens as web/src/index.css: paper, navy ink, red pen.
object RP {
    val Paper = Color(0xFFFBF8F1)
    val PaperDeep = Color(0xFFF3EEE2)
    val Ink = Color(0xFF1F2A44)
    val InkSoft = Color(0xFF5A6378)
    val Pen = Color(0xFFD7263D)
    val Device = Color(0xFF1F8A5B)
    val Cloud = Color(0xFF2F6DB5)
    val Flag = Color(0xFFD99A1E)
    val Hand = FontFamily(Font(R.font.caveat, FontWeight.Bold))
    val Display = FontFamily.Serif
}

@Composable
fun RedpenTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = RP.Pen, onPrimary = Color.White, background = RP.Paper, surface = Color.White,
            onBackground = RP.Ink, onSurface = RP.Ink, secondary = RP.Ink,
        ),
        content = content,
    )
}
