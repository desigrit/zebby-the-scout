@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class,androidx.compose.material3.ExperimentalMaterial3Api::class)
package com.desigrit.zebby.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.work.WorkInfo
import com.desigrit.zebby.UiState
import com.desigrit.zebby.ZebbyViewModel
import com.desigrit.zebby.data.*
import org.json.JSONArray

@Composable fun JobEditor(vm:ZebbyViewModel,initial:Job,state:UiState,wide:Boolean,onDirty:(Boolean)->Unit,onSaved:(Job)->Unit,onApplied:(Job)->Unit,onClose:()->Unit) {
    var serialized by rememberSaveable(initial.id) {mutableStateOf(initial.toJson())}
    var baseline by rememberSaveable(initial.id) {mutableStateOf(initial.toJson())}
    val draft=Job.fromJson(serialized);val dirty=serialized!=baseline
    val stored=(if(draft.plan) state.plans else state.applications).firstOrNull {it.id==draft.id}
    LaunchedEffect(stored?.get("updated_at"),initial) { if(!dirty && stored!=null) {serialized=stored.toJson();baseline=serialized} }
    LaunchedEffect(dirty) {onDirty(dirty)}
    val run=vm.active(draft);val canAnalyze=run==null && !state.busy;val pending=vm.paidPending(draft);val enabled=canAnalyze && !pending
    var results by rememberSaveable(initial.id) {mutableStateOf(initial.plan && initial.score!=null)}
    var wasRunning by remember(initial.id) {mutableStateOf(false)}
    LaunchedEffect(run?.id,stored?.score) { if(run!=null) wasRunning=true else if(wasRunning && stored?.score!=null) {results=true;wasRunning=false} }
    val finished=vm.latest(draft);var dismissedError by remember {mutableStateOf("")}
    var delete by remember {mutableStateOf(false)};var replaceDescription by remember {mutableStateOf(false)}
    var duplicate by remember {mutableStateOf<Job?>(null)}
    fun change(key:String,value:String) {
        var next=draft.with(key,value)
        if(next.source()!=draft.source()) {
            next=next.with("match_strength","").with("match_notes","").with("match_analyzed_at","")
            if(key !in listOf("current_overview","resume_id")) next=next.with("keyword_importance_json","[]").with("theme_importance_json","[]")
        }
        serialized=next.toJson()
    }
    fun saved(job:Job) {serialized=job.toJson();baseline=serialized;onSaved(job)}
    val resumePicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if(uri!=null) vm.importResume(uri) { change("resume_id",it.id) } }
    val notifications=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    fun analyze() {if(Build.VERSION.SDK_INT>=33) notifications.launch(Manifest.permission.POST_NOTIFICATIONS);dismissedError="";vm.analyze(draft,::saved)}
    fun fill() {vm.fill(draft) {filled -> serialized=if(filled.source()!=draft.source()) filled.with("match_strength","").with("match_notes","").with("match_analyzed_at","").with("keyword_importance_json","[]").with("theme_importance_json","[]").toJson() else filled.toJson()}}
    val clipboard=LocalClipboardManager.current
    Column(Modifier.fillMaxSize()) {
        if(draft.plan) SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal=24.dp).padding(bottom=20.dp)) {
            listOf("Job & resume","Analysis").forEachIndexed {index,label -> SegmentedButton(selected=results==(index==1),onClick={results=index==1},shape=SegmentedButtonDefaults.itemShape(index,2)) {Text(label)} }
        }
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal=24.dp).padding(bottom=24.dp),verticalArrangement=Arrangement.spacedBy(24.dp)) {
            if(pending && run==null) SmallLabel("A paid analysis is pending. Refresh to recover it before editing this job.")
            if(stored!=null) Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.Top) {
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {Text(draft.title,style=MaterialTheme.typography.headlineSmall);if(draft.company.isNotBlank()) Text(draft.company,style=MaterialTheme.typography.bodyLarge,color=MaterialTheme.colorScheme.onSurfaceVariant)}
                ActionIcon(Icons.Outlined.DeleteOutline,if(draft.plan) "Delete plan" else "Delete application",enabled) {delete=true}
            }
            if(!draft.plan || !results) {
            Section("Job posting") {
                Field("Job listing link",draft["listing_url"],enabled,keyboard=KeyboardType.Uri) {change("listing_url",it)}
                TextButton(enabled=enabled && draft["listing_url"].isNotBlank(),onClick={if(draft.description.isNotBlank()) replaceDescription=true else fill()}) {Icon(Icons.Outlined.AutoAwesome,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text("Fill from link")}
                if(wide) Row(horizontalArrangement=Arrangement.spacedBy(16.dp)) {
                    Box(Modifier.weight(1f)) {Field("Company",draft.company,enabled) {change("company",it)}}
                    Box(Modifier.weight(1f)) {Field("Job title",draft["title"],enabled) {change("title",it)}}
                } else {Field("Company",draft.company,enabled) {change("company",it)};Field("Job title",draft["title"],enabled) {change("title",it)}}
                Field("Team",draft["team"],enabled) {change("team",it)}
                LocationEditor(draft["locations"],state.recents,enabled) {change("locations",it)}
                Field("Job description",draft.description,enabled,multiline=true) {change(draft.descriptionKey,it)}
            }
            if(!draft.plan) Section("Application") {
                var dateOpen by remember {mutableStateOf(false)}
                OutlinedButton(onClick={dateOpen=true},enabled=enabled) {Icon(Icons.Outlined.CalendarToday,null,Modifier.size(18.dp));Spacer(Modifier.width(12.dp));Text(draft["applied_date"].ifBlank {"Date applied"})}
                if(dateOpen) ApplicationDateDialog(draft["applied_date"],onDismiss={dateOpen=false}) {change("applied_date",it);dateOpen=false}
                Selector("Status",draft.status.label,JobStatus.entries.map {it.label to it.label},enabled) {change("status",it)}
                Field("Match %",draft["match_strength"],enabled,keyboard=KeyboardType.Number) {value -> if(value.isEmpty() || value.toIntOrNull() in 0..100) change("match_strength",value)}
                Field("Notes",draft["notes"],enabled,multiline=true) {change("notes",it)}
            }
            HorizontalDivider()
            Section("Your resume") {
                val resume=state.resumes.firstOrNull {it.id==draft["resume_id"]}
                Selector("Resume",resume?.name ?: "Choose a resume",listOf("" to "No resume")+state.resumes.map {it.id to it.name},enabled) {change("resume_id",it)}
                TextButton(enabled=enabled,onClick={resumePicker.launch(arrayOf("application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document","text/plain"))}) {Icon(Icons.Outlined.UploadFile,null);Spacer(Modifier.width(8.dp));Text("Upload resume")}
                if(draft.plan) Field("Current summary",draft["current_overview"],enabled,multiline=true) {change("current_overview",it)}
                Button(onClick=::analyze,enabled=canAnalyze,modifier=Modifier.heightIn(min=48.dp)) {Icon(Icons.Outlined.AutoAwesome,null,Modifier.size(20.dp));Spacer(Modifier.width(8.dp));Text(if(draft.score!=null) "Refresh analysis" else "Analyze")}
                if(run!=null) RunStatus(run) {vm.cancel(draft)} else if(draft.description.length<100 || draft["resume_id"].isBlank() || draft.plan && draft["listing_url"].isBlank()) {
                    SmallLabel(if(draft.plan) "Add a job link, job description (100+ characters), and a resume to analyze." else "Add a job description and resume to analyze.")
                } else SmallLabel(vm.app.preferences.model())
                if(finished?.state==WorkInfo.State.FAILED && dismissedError!=finished.id.toString()) {
                    ErrorBanner(finished.outputData.getString("error") ?: "Analysis could not finish.") {dismissedError=finished.id.toString()}
                    TextButton(onClick=::analyze,enabled=canAnalyze) {Icon(Icons.Outlined.Refresh,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text("Try again")}
                }
            }
            HorizontalDivider()
            }
            if(!draft.plan || results) {
            if(draft.plan) {
                Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
                    Text("Resume direction",style=MaterialTheme.typography.titleMedium)
                    if(run==null) ActionIcon(Icons.Outlined.Refresh,"Refresh analysis",canAnalyze) {analyze()}
                }
                if(run!=null) RunStatus(run) {vm.cancel(draft)}
                if(finished?.state==WorkInfo.State.FAILED && dismissedError!=finished.id.toString()) {
                    ErrorBanner(finished.outputData.getString("error") ?: "Analysis could not finish.") {dismissedError=finished.id.toString()}
                    TextButton(onClick=::analyze,enabled=canAnalyze) {Text("Try again")}
                }
            }
            Section(if(draft.plan) "Match" else "Resume direction") {
                Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(16.dp)) {SmallLabel("Resume match");Match(draft.score)}
                if(draft["match_notes"].isNotBlank()) Disclosure("Why this score") {Text(draft["match_notes"],style=MaterialTheme.typography.bodyMedium)}
            }
            if(draft.plan) {
                @Composable fun recommendations(key:String,title:String) {Recommendations(title,draft.recommendations(key),enabled) { rows ->
                    serialized=draft.with("${key}_json",JSONArray(rows.map {it.text}).toString()).with("${if(key=="keywords") "keyword" else "theme"}_importance_json",JSONArray(rows.map {it.importance ?: org.json.JSONObject.NULL}).toString()).toJson()
                }}
                if(wide) Row(horizontalArrangement=Arrangement.spacedBy(24.dp)) {Box(Modifier.weight(1f)){recommendations("keywords","Core ATS keywords")};Box(Modifier.weight(1f)){recommendations("themes","Core resume themes")}}
                else {recommendations("keywords","Core ATS keywords");recommendations("themes","Core resume themes")}
                Section("Suggested edits - Resume summary",trailing={if(draft["overview"].isNotBlank()) ActionIcon(Icons.Outlined.ContentCopy,"Copy suggested summary") {clipboard.setText(AnnotatedString(draft["overview"]))}}) {
                    Field("Suggested summary",draft["overview"],enabled,multiline=true) {change("overview",it)}
                    if(draft["overview_rationale"].isNotBlank()) Text(draft["overview_rationale"],style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            }
        }
        Surface(color=MaterialTheme.colorScheme.surfaceContainerLowest) {
            Row(Modifier.fillMaxWidth().padding(horizontal=20.dp,vertical=12.dp),horizontalArrangement=Arrangement.spacedBy(12.dp),verticalAlignment=Alignment.CenterVertically) {
                OutlinedButton(onClick={val existing=if(draft.plan) null else vm.app.store.duplicate(draft["listing_url"],draft.id);if(existing!=null) duplicate=existing else vm.save(draft,::saved)},enabled=enabled,modifier=Modifier.weight(1f).heightIn(min=48.dp)) {Text("Save")}
                if(draft.plan) Button(onClick={vm.move(draft,onApplied)},enabled=enabled,modifier=Modifier.weight(1f).heightIn(min=48.dp)) {Text("Move to Applied");Spacer(Modifier.width(8.dp));Icon(Icons.AutoMirrored.Outlined.ArrowForward,null,Modifier.size(18.dp))}
            }
        }
    }
    if(delete) AlertDialog(onDismissRequest={delete=false},title={Text(if(draft.plan) "Delete this plan?" else "Delete this application?")},text={Text("The saved record will be removed from this database.")},confirmButton={TextButton(onClick={delete=false;vm.delete(draft,onClose)}){Text("Delete")}},dismissButton={TextButton(onClick={delete=false}){Text("Cancel")}})
    if(replaceDescription) AlertDialog(onDismissRequest={replaceDescription=false},title={Text("Fill this job from its link?")},text={Text("Extracted details will replace the current job fields. Your resume and notes will stay.")},confirmButton={TextButton(onClick={replaceDescription=false;fill()}){Text("Fill from link")}},dismissButton={TextButton(onClick={replaceDescription=false}){Text("Cancel")}})
    if(duplicate!=null) AlertDialog(onDismissRequest={duplicate=null},title={Text("Already in Applications")},text={Text("${duplicate!!.title} at ${duplicate!!.company} uses this listing link.")},confirmButton={TextButton(onClick={duplicate=null;vm.save(draft,::saved)}){Text("Save another")}},dismissButton={TextButton(onClick={duplicate=null}){Text("Cancel")}})
}
@Composable fun Field(label:String,value:String,enabled:Boolean=true,multiline:Boolean=false,keyboard:KeyboardType=KeyboardType.Text,onChange:(String)->Unit) {
    OutlinedTextField(value=value,onValueChange=onChange,enabled=enabled,label={Text(label)},modifier=Modifier.fillMaxWidth(),singleLine=!multiline,minLines=if(multiline) 3 else 1,maxLines=if(multiline) 8 else 1,keyboardOptions=KeyboardOptions(keyboardType=keyboard))
}
@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ApplicationDateDialog(value:String,onDismiss:()->Unit,onChoose:(String)->Unit) {
    val millis=runCatching {java.time.LocalDate.parse(value).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli()}.getOrNull()
    val date=rememberDatePickerState(initialSelectedDateMillis=millis)
    DatePickerDialog(onDismissRequest=onDismiss,confirmButton={TextButton(onClick={onChoose(date.selectedDateMillis?.let {java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()}.orEmpty())}){Text("Done")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}}) {DatePicker(date)}
}
@Composable private fun Recommendations(title:String,items:List<Recommendation>,enabled:Boolean,onChange:(List<Recommendation>)->Unit) {
    val clipboard=LocalClipboardManager.current;var edit by remember {mutableIntStateOf(-2)};var text by remember {mutableStateOf("")}
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        Text(title,style=MaterialTheme.typography.titleMedium)
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {SmallLabel("${items.size} ${if(title.contains("ATS")) "keywords" else "themes"}");SmallLabel("Importance")}
        if(items.isEmpty()) SmallLabel("Your analysis will appear here.")
        items.forEachIndexed {index,item ->
            HorizontalDivider()
            Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                Text(item.text,Modifier.weight(1f).clickable(enabled=enabled) {edit=index;text=item.text}.padding(vertical=12.dp),style=MaterialTheme.typography.bodyMedium)
                Text(item.importance?.let {"$it%"} ?: "Unrated",style=MaterialTheme.typography.labelMedium,color=MaterialTheme.colorScheme.primary)
                ActionIcon(Icons.Outlined.ContentCopy,"Copy ${item.text}") {clipboard.setText(AnnotatedString(item.text))}
                ActionIcon(Icons.Outlined.Close,"Remove ${item.text}",enabled) {onChange(items.filterIndexed {i,_ -> i!=index})}
            }
        }
        TextButton(onClick={edit=-1;text=""},enabled=enabled) {Icon(Icons.Outlined.Add,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text(if(title.contains("ATS")) "Add keyword" else "Add theme")}
    }
    if(edit>=-1) AlertDialog(onDismissRequest={edit=-2},title={Text(if(edit==-1) "Add item" else "Edit item")},text={OutlinedTextField(value=text,onValueChange={text=it},modifier=Modifier.fillMaxWidth())},confirmButton={TextButton(enabled=text.isNotBlank(),onClick={onChange(if(edit==-1) items+Recommendation(text.trim(),null) else items.mapIndexed {i,item -> if(i==edit) Recommendation(text.trim(),if(item.text==text.trim()) item.importance else null) else item});edit=-2}){Text("Done")}},dismissButton={TextButton(onClick={edit=-2}){Text("Cancel")}})
}
