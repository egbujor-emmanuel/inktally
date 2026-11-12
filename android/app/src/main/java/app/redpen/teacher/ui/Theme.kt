package app.redpen.teacher.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.redpen.teacher.R

// Same tokens and typefaces as web/src/index.css: paper, navy ink, red pen; Fraunces + Inter Tight + Caveat.
object RP {
    val Paper = Color(0xFFFBF8F1)
    val PaperDeep = Color(0xFFF3EEE2)
    val Rule = Color(0x66A9C1DD)
    val Margin = Color(0x73E07A7A)
    val Border = Color(0xFFE5DECF)
    val Ink = Color(0xFF1F2A44)
    val InkSoft = Color(0xFF5A6378)
    val Pen = Color(0xFFD7263D)
    val Device = Color(0xFF1F8A5B)
    val Cloud = Color(0xFF2F6DB5)
    val Flag = Color(0xFFD99A1E)

    val Display = FontFamily(
        Font(R.font.fraunces, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700), FontVariation.Setting("opsz", 96f))),
        Font(R.font.fraunces, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600), FontVariation.Setting("opsz", 36f))),
    )
    val Body = FontFamily(
        Font(R.font.inter_tight, FontWeight.Normal, variationSettings = FontVariation.Settings(FontVariation.weight(400))),
        Font(R.font.inter_tight, FontWeight.Medium, variationSettings = FontVariation.Settings(FontVariation.weight(500))),
        Font(R.font.inter_tight, FontWeight.SemiBold, variationSettings = FontVariation.Settings(FontVariation.weight(600))),
    )
    val Hand = FontFamily(Font(R.font.caveat, FontWeight.Bold, variationSettings = FontVariation.Settings(FontVariation.weight(700))))
}

private val base = Typography()
private fun TextStyle.body() = copy(fontFamily = RP.Body)

@Composable
fun RedpenTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = RP.Pen, onPrimary = Color.White, background = RP.Paper, surface = Color.White,
            onBackground = RP.Ink, onSurface = RP.Ink, secondary = RP.Ink, outline = RP.Ink,
        ),
        typography = Typography(
            bodyLarge = base.bodyLarge.body(), bodyMedium = base.bodyMedium.body(), bodySmall = base.bodySmall.body(),
            labelLarge = base.labelLarge.copy(fontFamily = RP.Body, fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
            labelMedium = base.labelMedium.body(), titleMedium = base.titleMedium.body(),
        ),
        content = content,
    )
}
