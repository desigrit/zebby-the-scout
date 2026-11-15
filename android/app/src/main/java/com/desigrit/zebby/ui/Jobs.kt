@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class,androidx.compose.material3.ExperimentalMaterial3Api::class)
package com.desigrit.zebby.ui

import android.content.Intent
import androidx.core.content.FileProvider
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.desigrit.zebby.UiState
import com.desigrit.zebby.ZebbyViewModel
import com.desigrit.zebby.data.*
import java.io.File
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable fun PlansScreen(state:UiState,vm:ZebbyViewModel,onSelect:(Job)->Unit,onNew:()->Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    val rows=state.plans.filter { "${it.title} ${it.company}".contains(query,true) }
    if(state.plans.isEmpty()) { EmptyState(Icons.Outlined.ManageSearch,"Make your next move","Save a job, shape your resume, and keep the details together.","Create a plan",onNew);return }
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(start=20.dp,end=20.dp,bottom=100.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
        item { SearchField(query,{query=it},"Search plans") }
        item { Spacer(Modifier.height(8.dp)) }
        items(rows,key={it.id}) { job ->
            Surface(onClick={onSelect(job)},shape=MaterialTheme.shapes.medium,color=MaterialTheme.colorScheme.surfaceContainerLowest) {
                Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                        Text(job.title,Modifier.weight(1f),style=MaterialTheme.typography.titleMedium,maxLines=2,overflow=TextOverflow.Ellipsis)
                        Icon(Icons.Outlined.ChevronRight,null,tint=MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(job.company.ifBlank { "Company not added" },style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
                    Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                        SmallLabel("Edited ${shortDate(job["updated_at"].take(10))}")
                        if(vm.active(job)!=null) CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp) else Match(job.score)
                    }
                }
            }
        }
        if(rows.isEmpty()) item { EmptyState(Icons.Outlined.SearchOff,"No plans found","Try a different role or company.","Clear search") { query="" } }
    }
}
@Composable private fun SearchField(query:String,onChange:(String)->Unit,label:String) {
    OutlinedTextField(value=query,onValueChange=onChange,placeholder={ Text(label) },leadingIcon={Icon(Icons.Outlined.Search,null)},trailingIcon={ if(query.isNotBlank()) ActionIcon(Icons.Outlined.Close,"Clear search") {onChange("")} },singleLine=true,modifier=Modifier.fillMaxWidth(),shape=MaterialTheme.shapes.medium)
}
@Composable private fun Filter(label:String,items:List<Pair<String,String>>,selected:String,onChange:(String)->Unit) {
    var show by remember { mutableStateOf(false) }
    Box { FilterChip(selected=selected.isNotBlank(),onClick={show=true},label={Text(label,maxLines=1,overflow=TextOverflow.Ellipsis)},trailingIcon={Icon(Icons.Outlined.ExpandMore,null,Modifier.size(18.dp))},modifier=Modifier.heightIn(min=48.dp))
        DropdownMenu(expanded=show,onDismissRequest={show=false},modifier=Modifier.heightIn(max=400.dp)) { items.forEach { (key,name) -> DropdownMenuItem(text={Text(name)},onClick={show=false;onChange(key)}) } }
    }
}
@Composable fun ApplicationsScreen(state:UiState,vm:ZebbyViewModel,selected:String,wide:Boolean,onSelect:(String)->Unit,onEdit:(Job)->Unit,onNew:()->Unit,onClose:()->Unit) {
    var query by rememberSaveable { mutableStateOf("") };var company by rememberSaveable {mutableStateOf("")};var status by rememberSaveable {mutableStateOf("")}
    val selectedJob=state.applications.firstOrNull { it.id==selected }
    if(!wide && selectedJob!=null) { JobDetail(selectedJob,vm,onEdit,onClose);return }
    if(state.applications.isEmpty()) { EmptyState(Icons.Outlined.WorkOutline,"Every application, in one place","Keep the role, resume, notes and next steps close.","Add an application",onNew);return }
    val filtered=state.applications.filter { "${it.title} ${it.company} ${it["team"]}".contains(query,true) && (company.isBlank() || it.company==company) && (status.isBlank() || it["status"]==status) }
    Row(Modifier.fillMaxSize()) {
        LazyColumn(Modifier.weight(1f),contentPadding=PaddingValues(start=20.dp,end=20.dp,bottom=100.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            item { ActivityChart(state.applications) }
            item { Spacer(Modifier.height(8.dp));SearchField(query,{query=it},"Search roles or companies") }
            item { FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                Filter(if(company.isBlank()) "All companies" else company,listOf("" to "All companies (${state.applications.size})")+state.applications.groupingBy { it.company }.eachCount().entries.sortedBy { it.key }.map { it.key to "${it.key.ifBlank { "No company" }} (${it.value})" },company,{company=it})
                Filter(if(status.isBlank()) "All statuses" else status,listOf("" to "All statuses (${state.applications.size})")+JobStatus.entries.map { it.label to "${it.label} (${state.applications.count { j -> j.status==it }})" },status,{status=it})
            } }
            items(filtered,key={it.id}) { job ->
                Surface(onClick={onSelect(job.id)},color=if(selected==job.id) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerLowest,shape=MaterialTheme.shapes.medium) {
                    if(wide && selectedJob==null) Row(Modifier.fillMaxWidth().padding(20.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(24.dp)) {
                        Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(6.dp)) {
                            Text(job.title,style=MaterialTheme.typography.titleMedium,maxLines=2,overflow=TextOverflow.Ellipsis)
                            SmallLabel(listOf(job.company,if(locations(job["locations"]).size>1) "Multiple locations" else job["locations"]).filter {it.isNotBlank()}.joinToString(" · "))
                        }
                        SmallLabel(shortDate(job["applied_date"]).ifBlank {"No date"})
                        if(vm.active(job)!=null) CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp) else Match(job.score)
                        Text(job.status.label,Modifier.widthIn(min=120.dp),style=MaterialTheme.typography.labelMedium,color=statusColor(job.status))
                        Icon(Icons.Outlined.ChevronRight,null,tint=MaterialTheme.colorScheme.onSurfaceVariant)
                    } else Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)) {
                        Text(job.title,style=MaterialTheme.typography.titleMedium,maxLines=2,overflow=TextOverflow.Ellipsis)
                        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.spacedBy(12.dp)) {
                            Text(job.company.ifBlank { "Company not added" },Modifier.weight(1f),style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant,maxLines=1,overflow=TextOverflow.Ellipsis)
                            SmallLabel(if(locations(job["locations"]).size>1) "Multiple locations" else job["locations"])
                        }
                        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.SpaceBetween) {
                            SmallLabel(shortDate(job["applied_date"]).ifBlank { "No date" })
                            if(vm.active(job)!=null) CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp) else Match(job.score)
                        }
                        Text(job.status.label,style=MaterialTheme.typography.labelMedium,color=statusColor(job.status))
                    }
                }
            }
            if(filtered.isEmpty()) item { EmptyState(Icons.Outlined.SearchOff,"No matching applications","Try another company, status or search.","Clear filters") {query="";company="";status=""} }
        }
        if(wide && selectedJob!=null) { VerticalDivider();Box(Modifier.weight(1f)) { JobDetail(selectedJob,vm,onEdit,onClose) } }
    }
}
@Composable fun ActivityChart(jobs:List<Job>) {
    val today=LocalDate.now();val dates=(29 downTo 0).map { today.minusDays(it.toLong()) };val counts=dates.map { day -> JobStatus.entries.map { status -> jobs.count { it["applied_date"]==day.toString() && it.status==status } } }
    val max=counts.maxOfOrNull {it.sum()}?.coerceAtLeast(1) ?: 1;val total=counts.sumOf {it.sum()};var details by remember { mutableStateOf(false) }
    val colors=JobStatus.entries.map { statusColor(it) }
    Surface(color=MaterialTheme.colorScheme.surfaceContainerLowest,shape=MaterialTheme.shapes.large) {
        Column(Modifier.padding(20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                Text("Your momentum",style=MaterialTheme.typography.titleMedium);SmallLabel("30 days")
            }
            Canvas(Modifier.fillMaxWidth().height(88.dp).clickable { details=true }.semantics { contentDescription="$total applications in the last 30 days. Tap for daily counts." }) {
                val width=size.width/30;counts.forEachIndexed { day,values -> var bottom=size.height
                    if(values.sum()==0) drawRoundRect(colors[0].copy(alpha=.12f),Offset(day*width+1,bottom-2),Size((width-3).coerceAtLeast(1f),2f),cornerRadius=androidx.compose.ui.geometry.CornerRadius(2f))
                    values.forEachIndexed { status,count -> if(count>0) { val h=size.height*count/max;drawRect(colors[status],Offset(day*width+1,bottom-h),Size((width-3).coerceAtLeast(1f),h));bottom-=h } }
                }
            }
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) { SmallLabel(shortDate(dates.first().toString()));SmallLabel("Today") }
            HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant)
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
                Stat(jobs.size.toString(),"Total")
                Stat(jobs.count { it.status in listOf(JobStatus.HeardBack,JobStatus.Interview,JobStatus.Offer) }.toString(),"In conversation")
                Stat(jobs.count { it.status==JobStatus.Interview }.toString(),"Interviews")
            }
        }
    }
    if(details) ModalBottomSheet(onDismissRequest={details=false}) { LazyColumn(Modifier.fillMaxWidth(),contentPadding=PaddingValues(24.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        item { Text("Application activity",style=MaterialTheme.typography.headlineSmall) }
        items(dates.indices.reversed().toList()) { i -> Column { Text(shortDate(dates[i].toString()),style=MaterialTheme.typography.titleSmall);SmallLabel(counts[i].mapIndexedNotNull { s,n -> if(n>0) "${JobStatus.entries[s].label}: $n" else null }.joinToString(" · ").ifBlank { "No applications" }) } }
    } }
}
@Composable private fun Stat(value:String,label:String) { Column(verticalArrangement=Arrangement.spacedBy(4.dp)) {Text(value,style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.SemiBold);SmallLabel(label)} }

@Composable fun JobDetail(job:Job,vm:ZebbyViewModel,onEdit:(Job)->Unit,onClose:()->Unit) {
    val state by vm.state.collectAsStateWithLifecycle()
    var deleting by remember { mutableStateOf(false) };var notes by remember { mutableStateOf<String?>(null) };var celebrate by remember {mutableStateOf(false)}
    val uri=LocalUriHandler.current;val context=LocalContext.current;val run=vm.active(job)
    Box {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
            Row(verticalAlignment=Alignment.Top) {
                Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(8.dp)) { Text(job.title,style=MaterialTheme.typography.headlineSmall);Text(job.company,style=MaterialTheme.typography.bodyLarge,color=MaterialTheme.colorScheme.onSurfaceVariant) }
                ActionIcon(Icons.Outlined.Edit,"Edit application",run==null) {onEdit(job)};ActionIcon(Icons.Outlined.Close,"Close application",onClick=onClose)
            }
            Selector("Status",job.status.label,JobStatus.entries.map { it.label to it.label },enabled=run==null) { value -> vm.save(job.with("status",value)) { if(value==JobStatus.Offer.label && job.status!=JobStatus.Offer) celebrate=true } }
            Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {
                Column { SmallLabel("Applied");Text(shortDate(job["applied_date"]).ifBlank { "Not dated" },style=MaterialTheme.typography.bodyLarge) }
                Match(job.score,if(run==null) ({vm.analyze(job)}) else null)
            }
            if(run!=null) RunStatus(run) {vm.cancel(job)}
            val failure=vm.latest(job)?.takeIf { it.state==androidx.work.WorkInfo.State.FAILED }?.outputData?.getString("error")
            var dismissedFailure by remember(job.id) {mutableStateOf("")}
            if(failure!=null && failure!=dismissedFailure) {
                ErrorBanner(failure) {dismissedFailure=failure}
                TextButton(onClick={dismissedFailure="";vm.analyze(job)},enabled=run==null) {Icon(Icons.Outlined.Refresh,null);Spacer(Modifier.width(8.dp));Text("Try again")}
            }
            if(job["match_notes"].isNotBlank()) Disclosure("Why this score") {Text(job["match_notes"],style=MaterialTheme.typography.bodyMedium)}
            HorizontalDivider()
            if(job["team"].isNotBlank()) Section("Team") {Text(job["team"],style=MaterialTheme.typography.bodyMedium)}
            if(job["locations"].isNotBlank()) Section("Locations") {FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {locations(job["locations"]).forEach {AssistChip(onClick={},label={Text(it)})}}}
            if(job["listing_url"].startsWith("https://")) TextButton(onClick={uri.openUri(job["listing_url"])}) {Icon(Icons.Outlined.OpenInNew,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text("View listing")}
            val resume=state.resumes.firstOrNull {it.id==job["resume_id"]}
            if(resume!=null) Section("Resume") {OutlinedButton(onClick={vm.action {
                val folder=File(context.cacheDir,"exports").apply {mkdirs()};val file=File(folder,resume.name.replace(Regex("[^a-zA-Z0-9._ -]"),"_"));file.writeBytes(vm.app.store.resumeBytes(resume.id))
                val content=FileProvider.getUriForFile(context,context.packageName+".files",file)
                withContext(Dispatchers.Main) {context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(content,resume.mime.ifBlank {"application/octet-stream"}).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))}
            }}) {Icon(Icons.Outlined.Description,null);Spacer(Modifier.width(8.dp));Text(resume.name,maxLines=2,overflow=TextOverflow.Ellipsis)}}
            Section("Notes",trailing={ActionIcon(Icons.Outlined.EditNote,"Edit notes",run==null) {notes=job["notes"]}}) {Text(job["notes"].ifBlank {"Add people, questions or next steps."},style=MaterialTheme.typography.bodyMedium,color=if(job["notes"].isBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface)}
            if(job.description.isNotBlank()) Section("Job description") {Text(job.description,style=MaterialTheme.typography.bodyMedium)}
            TextButton(enabled=run==null,onClick={deleting=true},colors=ButtonDefaults.textButtonColors(contentColor=MaterialTheme.colorScheme.error)) {Icon(Icons.Outlined.DeleteOutline,null);Spacer(Modifier.width(8.dp));Text("Delete application")}
        }
        if(celebrate) OfferCelebration {celebrate=false}
    }
    if(deleting) AlertDialog(onDismissRequest={deleting=false},title={Text("Delete this application?")},text={Text("${job.title} at ${job.company} will be removed from this database.")},confirmButton={TextButton(onClick={deleting=false;vm.delete(job,onClose)}){Text("Delete")}},dismissButton={TextButton(onClick={deleting=false}){Text("Cancel")}})
    if(notes!=null) AlertDialog(onDismissRequest={notes=null},title={Text("Notes")},text={OutlinedTextField(value=notes!!,onValueChange={notes=it},modifier=Modifier.fillMaxWidth().heightIn(min=160.dp,max=360.dp))},confirmButton={TextButton(onClick={vm.save(job.with("notes",notes!!));notes=null}){Text("Save")}},dismissButton={TextButton(onClick={notes=null}){Text("Cancel")}})
}
@Composable private fun OfferCelebration(onFinish:()->Unit) {
    val progress=remember {Animatable(0f)};val colors=listOf(MaterialTheme.colorScheme.primary,MaterialTheme.colorScheme.onSurface,MaterialTheme.colorScheme.surfaceContainerLowest,Color(0xFF3E85BD))
    LaunchedEffect(Unit) {if(android.animation.ValueAnimator.areAnimatorsEnabled()) progress.animateTo(1f,androidx.compose.animation.core.tween(3000)) else kotlinx.coroutines.delay(3000);onFinish()}
    Box(Modifier.fillMaxSize()) {
        if(android.animation.ValueAnimator.areAnimatorsEnabled()) Canvas(Modifier.fillMaxSize()) {repeat(48) {i -> val x=((i*73)%101)/100f*size.width;val y=((progress.value*1.3f+i%7*.08f)%1.3f-.2f)*size.height
            drawRect(colors[i%4],Offset(x,y),Size(5.dp.toPx(),(8+i%4).dp.toPx()))
            if(i%4==1) drawLine(colors[2],Offset(x,y+3.dp.toPx()),Offset(x+5.dp.toPx(),y+6.dp.toPx()),2.dp.toPx())
        } }
        Surface(Modifier.align(Alignment.TopCenter).padding(20.dp),shape=MaterialTheme.shapes.medium,color=MaterialTheme.colorScheme.primaryContainer) {Text("An offer. A very good next move!",Modifier.padding(16.dp),style=MaterialTheme.typography.titleSmall)}
    }
}
