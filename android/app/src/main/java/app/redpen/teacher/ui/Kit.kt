package app.redpen.teacher.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

// Shared building blocks so every screen matches the website: red-pen primary, ink outline secondary.

@Composable
fun PenButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    Button(onClick = onClick, enabled = enabled, modifier = modifier, shape = RoundedCornerShape(50),
        colors = ButtonDefaults.buttonColors(containerColor = RP.Pen, contentColor = Color.White),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp)) { Text(text, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun GhostButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = modifier, shape = RoundedCornerShape(50),
        border = BorderStroke(1.5.dp, if (enabled) RP.Ink else RP.Border), colors = ButtonDefaults.outlinedButtonColors(contentColor = RP.Ink),
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 12.dp)) { Text(text, fontWeight = FontWeight.SemiBold) }
}

@Composable
fun Field(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, placeholder: String? = null,
          singleLine: Boolean = true, minLines: Int = 1, enabled: Boolean = true, maxLength: Int = 2000) {
    OutlinedTextField(value, { onChange(it.take(maxLength)) }, label = { Text(label) }, placeholder = placeholder?.let { { Text(it, color = RP.InkSoft) } },
        singleLine = singleLine, minLines = minLines, enabled = enabled, modifier = modifier.fillMaxWidth(),
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = Color.White, unfocusedContainerColor = Color.White, focusedBorderColor = RP.Ink))
}

/** Hand-written eyebrow + serif title, as on every web page. */
@Composable
fun PageTitle(eyebrow: String, title: String, intro: String? = null) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(top = 18.dp)) {
        Text(eyebrow, fontFamily = RP.Hand, fontSize = 22.sp, color = RP.Pen)
        Text(title, fontFamily = RP.Display, fontWeight = FontWeight.Bold, fontSize = 32.sp, lineHeight = 36.sp, color = RP.Ink)
        intro?.let { Text(it, color = RP.InkSoft, fontSize = 15.sp, lineHeight = 22.sp, modifier = Modifier.padding(top = 6.dp)) }
    }
}

@Composable
fun Paper(modifier: Modifier = Modifier, borderColor: Color = RP.Border, content: @Composable () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, borderColor),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp), shape = RoundedCornerShape(14.dp),
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
    }
}

@Composable
fun ErrorText(message: String?) {
    message?.let { Text(it, color = RP.Pen, fontSize = 14.sp, modifier = Modifier.padding(horizontal = 16.dp)) }
}

@Composable
fun Busy(text: String) {
    Text(text, fontFamily = RP.Hand, fontSize = 26.sp, color = RP.InkSoft, modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))
}

// ---- photos ----

/** Decodes a photo at a sensible size and applies EXIF rotation. */
fun loadPhoto(ctx: Context, uri: Uri, maxSide: Int = 2600): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    ctx.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxSide) sample *= 2
    val bmp = ctx.contentResolver.openInputStream(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
        ?: error("That file is not a photo REDPEN can open.")
    val rotation = runCatching { ctx.contentResolver.openInputStream(uri).use { ExifInterface(it!!).rotationDegrees } }.getOrDefault(0)
    return if (rotation == 0) bmp else Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
}

class PhotoInput(val takePhoto: () -> Unit, val choosePhoto: () -> Unit)

/** Camera OR gallery: teachers often already have the photos on their phone. */
@Composable
fun rememberPhotoInput(onPhoto: (Bitmap) -> Unit, onError: (String) -> Unit): PhotoInput {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val latestOnPhoto by rememberUpdatedState(onPhoto)
    val latestOnError by rememberUpdatedState(onError)
    val file = remember { File(ctx.cacheDir, "capture-${System.nanoTime()}.jpg") }
    val uri = remember { FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file) }
    fun decode(u: Uri) = scope.launch {
        runCatching { withContext(Dispatchers.Default) { loadPhoto(ctx, u) } }.onSuccess { latestOnPhoto(it) }.onFailure { latestOnError(it.message ?: "Could not open the photo") }
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok -> if (ok) decode(uri) }
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { picked -> picked?.let(::decode) }
    return remember(uri) {
        PhotoInput(
            takePhoto = { runCatching { camera.launch(uri) }.onFailure { latestOnError("No camera app found — choose a photo instead.") } },
            choosePhoto = { gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        )
    }
}

@Composable
fun PhotoButtons(input: PhotoInput, takeLabel: String, enabled: Boolean = true) {
    androidx.compose.foundation.layout.Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
        PenButton(takeLabel, input.takePhoto, Modifier.weight(1.3f), enabled)
        GhostButton("Choose photo", input.choosePhoto, Modifier.weight(1f), enabled)
    }
}

// ---- share / print ----

fun shareFile(ctx: Context, file: File, mime: String, title: String) {
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file)
    val send = Intent(Intent.ACTION_SEND).apply { type = mime; putExtra(Intent.EXTRA_STREAM, uri); putExtra(Intent.EXTRA_SUBJECT, title); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
    try { ctx.startActivity(Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (_: ActivityNotFoundException) { }
}

fun openFile(ctx: Context, file: File, mime: String) {
    val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.files", file)
    val view = Intent(Intent.ACTION_VIEW).apply { setDataAndType(uri, mime); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK) }
    try { ctx.startActivity(view) } catch (_: ActivityNotFoundException) { shareFile(ctx, file, mime, file.name) }
}

fun shareText(ctx: Context, text: String, title: String) {
    val send = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, text); putExtra(Intent.EXTRA_SUBJECT, title) }
    ctx.startActivity(Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

/** Sends a ready PDF to Android's print service (printers, or "Save as PDF"). */
fun printPdf(ctx: Context, pdf: File, jobName: String) {
    val pm = ctx.getSystemService(PrintManager::class.java) ?: return
    pm.print(jobName, object : PrintDocumentAdapter() {
        override fun onLayout(old: PrintAttributes?, new: PrintAttributes?, cancel: CancellationSignal?, cb: LayoutResultCallback, extras: Bundle?) {
            if (cancel?.isCanceled == true) { cb.onLayoutCancelled(); return }
            cb.onLayoutFinished(PrintDocumentInfo.Builder(pdf.name).setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(), true)
        }
        override fun onWrite(pages: Array<out PageRange>?, dest: ParcelFileDescriptor, cancel: CancellationSignal?, cb: WriteResultCallback) {
            runCatching { pdf.inputStream().use { input -> FileOutputStream(dest.fileDescriptor).use { input.copyTo(it) } } }
                .onSuccess { cb.onWriteFinished(arrayOf(PageRange.ALL_PAGES)) }.onFailure { cb.onWriteFailed(it.message) }
        }
    }, PrintAttributes.Builder().setMediaSize(PrintAttributes.MediaSize.ISO_A4).build())
}

/** Prints an image (marked copy) by wrapping it in a one-page PDF. */
fun printBitmap(ctx: Context, bmp: Bitmap, jobName: String) {
    val doc = android.graphics.pdf.PdfDocument()
    val w = 595; val h = (595f * bmp.height / bmp.width).toInt().coerceAtLeast(1)
    val page = doc.startPage(android.graphics.pdf.PdfDocument.PageInfo.Builder(w, h, 1).create())
    page.canvas.drawBitmap(bmp, null, android.graphics.Rect(0, 0, w, h), android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG))
    doc.finishPage(page)
    val out = File(File(ctx.cacheDir, "share").apply { mkdirs() }, "print-${System.nanoTime()}.pdf")
    out.outputStream().use { doc.writeTo(it) }
    doc.close()
    printPdf(ctx, out, jobName)
}
