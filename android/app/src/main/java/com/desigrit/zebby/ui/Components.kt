@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class,androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.desigrit.zebby.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.work.WorkInfo
import com.desigrit.zebby.data.*
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable fun ActionIcon(icon:ImageVector,label:String,enabled:Boolean=true,onClick:()->Unit) {
    IconButton(onClick=onClick,enabled=enabled,modifier=Modifier.sizeIn(minWidth=48.dp,minHeight=48.dp)) { Icon(icon,label,Modifier.size(22.dp)) }
}
@Composable fun SmallLabel(text:String,modifier:Modifier=Modifier) { Text(text,modifier,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant) }
@Composable fun Section(title:String,trailing:@Composable ()->Unit = {},content:@Composable ColumnScope.()->Unit) {
    Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) { Text(title,Modifier.weight(1f),style=MaterialTheme.typography.titleMedium);trailing() }
        content()
    }
}
@Composable fun EmptyState(icon:ImageVector,title:String,description:String,action:String,onAction:()->Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal=32.dp,vertical=48.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(16.dp)) {
        Icon(icon,null,Modifier.size(40.dp),tint=MaterialTheme.colorScheme.primary)
        Text(title,style=MaterialTheme.typography.headlineSmall)
        Text(description,style=MaterialTheme.typography.bodyMedium,color=MaterialTheme.colorScheme.onSurfaceVariant)
        FilledTonalButton(onClick=onAction) { Text(action) }
    }
}
@Composable fun ErrorBanner(text:String,onDismiss:()->Unit) {
    Surface(color=MaterialTheme.colorScheme.errorContainer,shape=MaterialTheme.shapes.medium) {
        Row(Modifier.fillMaxWidth().padding(start=16.dp,top=8.dp,bottom=8.dp,end=4.dp),verticalAlignment=Alignment.CenterVertically) {
            Text(text,Modifier.weight(1f),color=MaterialTheme.colorScheme.onErrorContainer,style=MaterialTheme.typography.bodyMedium)
            ActionIcon(Icons.Outlined.Close,"Dismiss error",onClick=onDismiss)
        }
    }
}
@Composable fun Disclosure(label:String,content:@Composable ()->Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column { Row(Modifier.fillMaxWidth().clickable { expanded=!expanded }.heightIn(min=48.dp),verticalAlignment=Alignment.CenterVertically) {
        Icon(if(expanded) Icons.Outlined.ExpandLess else Icons.Outlined.ExpandMore,null,Modifier.size(20.dp))
        Spacer(Modifier.width(8.dp));Text(label,style=MaterialTheme.typography.labelLarge)
    };if(expanded) content() }
}
@Composable fun Selector(label:String,value:String,options:List<Pair<String,String>>,enabled:Boolean=true,onSelect:(String)->Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column(verticalArrangement=Arrangement.spacedBy(4.dp)) {
        SmallLabel(label)
        ExposedDropdownMenuBox(expanded=expanded,onExpandedChange={ if(enabled) expanded=it }) {
            OutlinedTextField(value=value,onValueChange={},readOnly=true,enabled=enabled,singleLine=true,
                modifier=Modifier.fillMaxWidth().menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable),trailingIcon={ ExposedDropdownMenuDefaults.TrailingIcon(expanded) })
            ExposedDropdownMenu(expanded=expanded,onDismissRequest={ expanded=false }) {
                options.forEach { (key,title) -> DropdownMenuItem(text={ Text(title) },onClick={ expanded=false;onSelect(key) }) }
            }
        }
    }
}
@Composable fun LocationEditor(value:String,recents:List<String>,enabled:Boolean,onChange:(String)->Unit) {
    var adding by remember { mutableStateOf(false) };var text by remember { mutableStateOf("") }
    val items=locations(value)
    Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        SmallLabel("Locations")
        FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(4.dp)) {
            items.forEach { location -> InputChip(selected=false,enabled=enabled,onClick={},label={ Text(location) },trailingIcon={
                ActionIcon(Icons.Outlined.Close,"Remove $location",enabled) { onChange(items.filterNot { it==location }.joinToString("; ")) }
            }) }
            AssistChip(enabled=enabled,onClick={ adding=true },label={ Text("Add location") },leadingIcon={ Icon(Icons.Outlined.Add,null,Modifier.size(18.dp)) },modifier=Modifier.heightIn(min=48.dp))
        }
    }
    if(adding) {
        fun add(location:String) { if(location.isNotBlank()) { onChange((items+location.trim()).distinctBy(String::lowercase).joinToString("; "));text="" } }
        AlertDialog(onDismissRequest={ adding=false },title={ Text("Add locations") },text={ Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(value=text,onValueChange={text=it},label={ Text("City or region") },singleLine=true,keyboardOptions=KeyboardOptions(imeAction=ImeAction.Done),keyboardActions=KeyboardActions(onDone={ add(text) }))
            val filtered=recents.filter { it !in items && it.contains(text,true) }.take(5)
            if(filtered.isNotEmpty()) { SmallLabel("Recents");filtered.forEach { place -> TextButton(onClick={add(place)},Modifier.fillMaxWidth()) { Text(place,Modifier.fillMaxWidth()) } } }
        } },confirmButton={ TextButton(onClick={add(text)},enabled=text.isNotBlank()) {Text("Add")} },dismissButton={TextButton(onClick={adding=false}) {Text("Done")}})
    }
}
@Composable fun Match(score:Int?,onRefresh:(()->Unit)?=null) {
    Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(10.dp)) {
        if(score!=null) {
            Text("$score%",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
            LinearProgressIndicator(progress={score/100f},modifier=Modifier.width(44.dp).height(4.dp),color=if(score>=75) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.primary,trackColor=MaterialTheme.colorScheme.outlineVariant,drawStopIndicator={})
        } else { Surface(color=MaterialTheme.colorScheme.primaryContainer,shape=MaterialTheme.shapes.small) { Text("Not analyzed",Modifier.padding(horizontal=8.dp,vertical=4.dp),style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.onPrimaryContainer) } }
        if(onRefresh!=null) ActionIcon(Icons.Outlined.Refresh,"Analyze match",onClick=onRefresh)
    }
}
fun shortDate(date:String):String=runCatching { LocalDate.parse(date).format(DateTimeFormatter.ofPattern("MMM d")) }.getOrDefault(date)
@Composable fun statusColor(status:JobStatus):Color = when(status) {
    JobStatus.Applied -> MaterialTheme.colorScheme.onSurfaceVariant
    JobStatus.HeardBack -> if(MaterialTheme.colorScheme.surface.luminance()<0.5f) Color(0xFFF0D7A7) else Color(0xFF855D1E)
    JobStatus.Interview -> MaterialTheme.colorScheme.tertiary
    JobStatus.Rejected -> MaterialTheme.colorScheme.error
    JobStatus.Offer -> if(MaterialTheme.colorScheme.surface.luminance()<0.5f) Color(0xFFA7CEFF) else Color(0xFF2868AA)
}
@Composable fun RunStatus(run:WorkInfo,onCancel:()->Unit) {
    var elapsed by remember { mutableLongStateOf(0) }
    val started=run.progress.getLong("started",System.currentTimeMillis())
    LaunchedEffect(started) { while(true) { elapsed=((System.currentTimeMillis()-started)/1000).coerceAtLeast(0);delay(1000) } }
    Row(Modifier.fillMaxWidth().heightIn(min=48.dp),verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        CircularProgressIndicator(Modifier.size(16.dp),strokeWidth=2.dp)
        SmallLabel("${elapsed/60}:${(elapsed%60).toString().padStart(2,'0')} ·")
        AnimatedContent(targetState=run.progress.getString("stage") ?: "Queued",modifier=Modifier.weight(1f),transitionSpec={ (slideInVertically { -it }+fadeIn()) togetherWith (slideOutVertically { it }+fadeOut()) },label="Analysis stage") { SmallLabel(it) }
        ActionIcon(Icons.Outlined.Close,"Cancel analysis",onClick=onCancel)
    }
}
