package app.redpen.teacher.ui

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.redpen.teacher.Connectivity
import app.redpen.teacher.ai.Ai
import app.redpen.teacher.data.Repo
import app.redpen.teacher.domain.MarkingScheme
import app.redpen.teacher.domain.Question
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Level suggestions from common school systems; free text because systems differ by country and institution. */
val LEVEL_SUGGESTIONS = listOf("Grade 6", "Year 7", "Primary 5", "JSS 2", "SS 2", "Form 3", "Class 8", "Basic 8", "University Year 1", "Certificate course")

@Composable
fun LevelField(level: String, onChange: (String) -> Unit) {
    Column {
        Field(level, onChange, "Class / level", placeholder = "e.g. Grade 5, Year 7, JSS 2, University Year 1")
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.padding(top = 4.dp)) {
            itemsIndexed(LEVEL_SUGGESTIONS) { _, l -> AssistChip(onClick = { onChange(l) }, label = { Text(l, fontSize = 12.sp) }) }
        }
    }
}

@Composable
fun NewAssignmentScreen(onSaved: (String) -> Unit) {
    val ctx = LocalContext.current
    val scope = rememberCoroutineScope()
    val online by Connectivity.online.collectAsState()
    var title by remember { mutableStateOf("") }
    var className by remember { mutableStateOf("") }
    // Empty by default: REDPEN reads the subject and level from the paper (same as web).
    var subject by remember { mutableStateOf("") }
    var level by remember { mutableStateOf("") }
    var images by remember { mutableStateOf<List<Bitmap>>(emptyList()) }
    var pdf by remember { mutableStateOf<Pair<String, ByteArray>?>(null) }
    var typed by remember { mutableStateOf("") }
    var guideImages by remember { mutableStateOf<List<Bitmap>>(emptyList()) }
    var guidePdf by remember { mutableStateOf<Pair<String, ByteArray>?>(null) }
    var guideTyped by remember { mutableStateOf("") }
    val hasGuide = guideImages.isNotEmpty() || guidePdf != null || guideTyped.isNotBlank()
    var questions by remember { mutableStateOf<List<Question>>(emptyList()) }
    var drafting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val photo = rememberPhotoInput(onPhoto = { images = images + it }, onError = { error = it })
    val gallery = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        scope.launch {
            runCatching { withContext(Dispatchers.Default) { uris.map { loadPhoto(ctx, it, 2000) } } }
                .onSuccess { images = images + it }.onFailure { error = it.message }
        }
    }
    val pdfPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            runCatching { withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } } }
                .onSuccess { bytes -> if (bytes.size > 15_000_000) error = "That PDF is over 15 MB — photograph the pages instead." else pdf = (uri.lastPathSegment ?: "question paper.pdf") to bytes }
                .onFailure { error = it.message }
        }
    }

    val guideGallery = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(10)) { uris ->
        scope.launch {
            runCatching { withContext(Dispatchers.Default) { uris.map { loadPhoto(ctx, it, 2000) } } }
                .onSuccess { guideImages = guideImages + it }.onFailure { error = it.message }
        }
    }
    val guidePdfPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch {
            runCatching { withContext(Dispatchers.IO) { ctx.contentResolver.openInputStream(uri)!!.use { it.readBytes() } } }
                .onSuccess { bytes -> if (bytes.size > 15_000_000) error = "That PDF is over 15 MB — photograph the pages instead." else guidePdf = (uri.lastPathSegment ?: "marking scheme.pdf") to bytes }
                .onFailure { error = it.message }
        }
    }
    val guidePhoto = rememberPhotoInput(onPhoto = { guideImages = guideImages + it }, onError = { error = it })

    fun draft() {
        error = null; drafting = true
        scope.launch {
            runCatching { Ai.draftScheme(images, typed.ifBlank { null }, subject, level, pdf = pdf?.second,
                guide = Ai.Guide(guideImages, guideTyped.ifBlank { null }, guidePdf?.second)) }
                .onSuccess { questions = it.questions; if (subject.isBlank()) subject = it.subject; if (level.isBlank()) level = it.level }
                .onFailure { error = Repo.friendly(it) }
            drafting = false
        }
    }

    fun save() {
        val usable = questions.filter { it.isComplete() }
        if (usable.isEmpty()) { error = "Add at least one question with an answer."; return }
        val (s, l) = app.redpen.teacher.ai.resolveLabels(subject, level)
        val id = Repo.createAssignment(title.ifBlank { listOf(s, l).filter { it.isNotBlank() }.joinToString(" — ") }, className.ifBlank { l }, MarkingScheme(s, l, usable))
        onSaved(id)
    }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { PageTitle("step 1", "New assignment", "Give REDPEN the question paper and it works out the answer key — or give it your own marking scheme and it copies it exactly. Only these go to the cloud, never students’ work, and you check everything before marking.") }
        item {
            Paper {
                Field(title, { title = it }, "Title", placeholder = "Fractions quiz")
                Field(className, { className = it }, "Class / group", placeholder = "e.g. Primary 6A, Biology 101 group B")
                Field(subject, { subject = it }, "Subject", placeholder = "Leave empty: REDPEN reads it from the paper")
                LevelField(level) { level = it }
            }
        }
        item {
            Paper {
                Text("The question paper", fontFamily = RP.Display, fontSize = 22.sp)
                Text("Photos of the paper, a PDF, or type the questions. Only the questions go to the cloud.", color = RP.InkSoft, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    PenButton("Take photo", photo.takePhoto, Modifier.weight(1f))
                    GhostButton("Photos", { gallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, Modifier.weight(1f))
                    GhostButton("PDF", { pdfPicker.launch(arrayOf("application/pdf")) }, Modifier.weight(0.8f))
                }
                if (images.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    itemsIndexed(images) { i, bmp ->
                        Column {
                            Image(bmp.asImageBitmap(), "Question paper page ${i + 1}", Modifier.size(90.dp, 120.dp), contentScale = ContentScale.Crop)
                            TextButton(onClick = { images = images.filterIndexed { j, _ -> j != i } }) { Text("Remove", fontSize = 12.sp) }
                        }
                    }
                }
                pdf?.let { (name, _) ->
                    Row { Text("PDF: $name", fontSize = 14.sp, modifier = Modifier.weight(1f).padding(top = 12.dp)); TextButton(onClick = { pdf = null }) { Text("Remove") } }
                }
                Field(typed, { typed = it }, "…or type / paste the questions", placeholder = "1. 7 × 8 = ?\n2. State two functions of blood. (2 marks)", singleLine = false, minLines = 4, maxLength = 20_000)
            }
        }
        item {
            Paper {
                Text("Already have a marking scheme?", fontFamily = RP.Display, fontSize = 22.sp)
                Text("Optional. Give REDPEN your own marking scheme or answer key and it copies your answers and marks exactly — it never changes them.",
                    color = RP.InkSoft, fontSize = 14.sp)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    PenButton("Take photo", guidePhoto.takePhoto, Modifier.weight(1f))
                    GhostButton("Photos", { guideGallery.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, Modifier.weight(1f))
                    GhostButton("PDF", { guidePdfPicker.launch(arrayOf("application/pdf")) }, Modifier.weight(0.8f))
                }
                if (guideImages.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    itemsIndexed(guideImages) { i, bmp ->
                        Column {
                            Image(bmp.asImageBitmap(), "Marking scheme page ${i + 1}", Modifier.size(90.dp, 120.dp), contentScale = ContentScale.Crop)
                            TextButton(onClick = { guideImages = guideImages.filterIndexed { j, _ -> j != i } }) { Text("Remove", fontSize = 12.sp) }
                        }
                    }
                }
                guidePdf?.let { (name, _) ->
                    Row { Text("PDF: $name", fontSize = 14.sp, modifier = Modifier.weight(1f).padding(top = 12.dp)); TextButton(onClick = { guidePdf = null }) { Text("Remove") } }
                }
                Field(guideTyped, { guideTyped = it }, "…or type / paste your marking scheme",
                    placeholder = "1. 56 (1 mark)\n2. Abuja — accept FCT (1 mark)", singleLine = false, minLines = 3, maxLength = 20_000)
            }
        }
        item {
            PenButton(if (drafting) "Reading…" else if (!online) "Drafting needs internet" else if (hasGuide) "Use my marking scheme" else "Draft marking scheme", ::draft,
                Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                enabled = online && !drafting && (images.isNotEmpty() || pdf != null || typed.isNotBlank() || hasGuide))
        }
        if (online && !drafting && images.isEmpty() && pdf == null && typed.isBlank() && !hasGuide) item {
            Text("Add the question paper or your marking scheme above first.", color = RP.InkSoft, fontSize = 13.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp))
        }
        item { ErrorText(error) }
        if (drafting) item { Busy("Reading the questions and writing the answer key…") }
        if (questions.isNotEmpty()) {
            item { PageTitle("step 2", "Check the marking scheme", "Every mark depends on this key. Fix anything that is wrong — you can edit it later too.") }
            item { SchemeEditor(questions) { questions = it } }
            item { PenButton("Save and print answer sheets", ::save, Modifier.fillMaxWidth().padding(horizontal = 16.dp)) }
        } else if (!drafting) {
            item { TextButton(onClick = { questions = listOf(Question.Short(1, "", 1, listOf(""))) }, modifier = Modifier.padding(horizontal = 8.dp)) { Text("Or write the marking scheme by hand →") } }
        }
        item { Spacer(Modifier.height(40.dp)) }
    }
}
