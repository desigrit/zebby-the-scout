@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class,androidx.compose.material3.ExperimentalMaterial3Api::class)
package com.desigrit.zebby.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.desigrit.zebby.BuildConfig
import com.desigrit.zebby.UiState
import com.desigrit.zebby.ZebbyViewModel
import com.desigrit.zebby.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray

fun thinkingLabel(value:String)=when(value) {"xhigh"->"Extra high";"max"->"Maximum";"default"->"Model default";else->value.removePrefix("level:").replaceFirstChar(Char::uppercase)}

@Composable fun SettingsScreen(vm:ZebbyViewModel,state:UiState,onBuy:()->Unit) {
    val settings=vm.app.preferences;val uriHandler=LocalUriHandler.current
    var server by remember {mutableStateOf(settings["server"])}
    var modelNames by remember {mutableStateOf(jsonArray(settings["server-models"]))}
    var levels by remember {mutableStateOf(jsonArray(settings["server-thinking"]))}
    var serverMessage by remember {mutableStateOf("")}
    var newDatabase by remember {mutableStateOf(false)}
    var cloudFiles by remember {mutableStateOf<List<CloudDocument>?>(null)};var tree by remember {mutableStateOf<Uri?>(null)}
    var workspaceList by remember {mutableStateOf<List<String>?>(null)}
    var importUri by remember {mutableStateOf<Uri?>(null)}
    val import=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {if(it!=null) importUri=it}
    val export=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) {if(it!=null) vm.exportDatabase(it)}
    val logs=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) {if(it!=null) vm.exportLogs(it)}
    val folder=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { picked -> if(picked!=null) {
        vm.action {vm.ensureIdle();vm.app.contentResolver.takePersistableUriPermission(picked,Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            val files=vm.app.cloud.files(picked).filter {it.name.endsWith(".sqlite",true) || it.name.endsWith(".db",true)}
            require(files.isNotEmpty()) {"No SQLite databases were found in this folder."}
            withContext(Dispatchers.Main) {tree=picked;cloudFiles=files}
        }
    } }
    val provider=settings.provider;val model=settings.model();val selectedModel=vm.app.contracts.models.firstOrNull {it.id==model}
    val options=vm.app.contracts.models.filter {if(provider=="credits") it.paid else it.provider==provider}
    val thinking=if(provider=="ollama") levels else selectedModel?.levels.orEmpty()
    fun testServer() {vm.action {
        settings.put("server",com.desigrit.zebby.network.AnalysisEngine.normalizeServer(server))
        val available=vm.app.engine.serverModels(server);settings.put("server-models",JSONArray(available).toString())
        if(settings.model() !in available && available.isNotEmpty()) settings.setModel(available.first())
        val capabilities=if(settings.model().isBlank()) emptyList() else vm.app.engine.serverThinking(server,settings.model())
        settings.put("server-thinking",JSONArray(capabilities).toString())
        withContext(Dispatchers.Main) {modelNames=available;levels=capabilities;serverMessage=if(available.isEmpty()) "Connected. No models are installed on this server." else "Connected · ${available.size} models"}
    } }
    LaunchedEffect(server) {if(server!=settings["server"]) {delay(800);runCatching {com.desigrit.zebby.network.AnalysisEngine.normalizeServer(server)}.onSuccess {settings.put("server",it);settings.put("server-thinking","[]");levels=emptyList();serverMessage=""}}}
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=24.dp).padding(bottom=32.dp),verticalArrangement=Arrangement.spacedBy(28.dp)) {
        Section("Analysis") {
            Selector("Analyze with",mapOf("credits" to "Zebby credits","openai" to "OpenAI API key","anthropic" to "Anthropic API key","ollama" to "Local server")[provider].orEmpty(),
                listOf("credits" to "Zebby credits","openai" to "OpenAI API key","anthropic" to "Anthropic API key","ollama" to "Local server")) {value -> vm.action {settings.provider=value}}
            if(provider=="ollama") {
                Field("Server URL",server,keyboard=androidx.compose.ui.text.input.KeyboardType.Uri) {server=it}
                TextButton(onClick=::testServer,enabled=server.isNotBlank() && !state.busy) {Icon(Icons.Outlined.Cable,null,Modifier.size(20.dp));Spacer(Modifier.width(8.dp));Text("Test connection")}
                if(serverMessage.isNotBlank()) SmallLabel(serverMessage)
                if(modelNames.isEmpty()) SmallLabel("Use your computer's network address. The server and phone must be able to reach each other.")
                else Selector("Model",model,modelNames.map {it to it}) {value -> vm.action {settings.setModel(value);val capabilities=vm.app.engine.serverThinking(server,value);settings.put("server-thinking",JSONArray(capabilities).toString());withContext(Dispatchers.Main) {levels=capabilities}}}
            } else {
                Selector("Model",selectedModel?.name ?: model,options.map {it.id to it.name}) {value->vm.action {settings.setModel(value)}}
            }
            if(thinking.size>1) ThinkingControl(thinking,settings.thinking(selectedModel)) {value -> vm.action {settings.setThinking(value)}}
            if(provider in listOf("openai","anthropic")) {
                KeyControl(provider,vm)
                SmallLabel("Billed to your API account.")
            }
        }
        HorizontalDivider()
        Section("Credits") {CreditSummary(vm,onBuy,showBuy=provider=="credits")}
        HorizontalDivider()
        Section("Database") {
            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {Icon(Icons.Outlined.Storage,null);Column(Modifier.weight(1f)) {Text(runCatching {vm.app.store.name}.getOrDefault("Database unavailable"),style=MaterialTheme.typography.bodyLarge);SmallLabel("A private working copy on this device")}}
            FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                TextButton(enabled=!vm.anyActive(),onClick={import.launch(arrayOf("*/*"))}) {Icon(Icons.Outlined.FileOpen,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text("Import")}
                TextButton(enabled=!vm.anyActive(),onClick={export.launch("Zebby-${java.time.LocalDate.now()}.sqlite")}) {Icon(Icons.Outlined.IosShare,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text("Export copy")}
                TextButton(enabled=!vm.anyActive(),onClick={newDatabase=true}) {Text("Create new")}
            }
            TextButton(enabled=!vm.anyActive(),onClick={workspaceList=vm.app.store.workspaces().map {it.name}}) {Text("Saved on this device")}
            if(vm.app.cloud.connected) {
                SmallLabel("Last synced ${vm.app.cloud.lastSync.take(16).replace('T',' ')}")
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(enabled=!vm.anyActive() && !state.busy,onClick={vm.action(true) {vm.ensureIdle();vm.app.cloud.push()}}) {Text("Save to cloud")}
                    TextButton(enabled=!vm.anyActive() && !state.busy,onClick={vm.action {vm.ensureIdle();vm.app.cloud.pull()}}) {Text("Load from cloud")}
                }
                SmallLabel("Close Zebby on your other device before syncing. Previous cloud versions are kept as recovery copies.")
            } else {
                OutlinedButton(enabled=!vm.anyActive(),onClick={folder.launch(null)}) {Icon(Icons.Outlined.CloudSync,null,Modifier.size(20.dp));Spacer(Modifier.width(8.dp));Text("Connect cloud folder")}
                SmallLabel("Choose your OneDrive folder in the system picker. If it is unavailable, use Import and Export copy.")
            }
        }
        HorizontalDivider()
        Section("Appearance") {Selector("Theme",mapOf("" to "System","system" to "System","light" to "Light","dark" to "Dark")[settings["appearance"]].orEmpty(),listOf("system" to "System","light" to "Light","dark" to "Dark")) {vm.action {settings.put("appearance",it)}}}
        HorizontalDivider()
        Section("Help") {
            TextButton(onClick={logs.launch("Zebby-logs.txt")}) {Icon(Icons.Outlined.BugReport,null,Modifier.size(20.dp));Spacer(Modifier.width(8.dp));Text("Export error logs")}
            TextButton(onClick={uriHandler.openUri("https://github.com/desigrit/zebby-the-scout/issues")}) {Icon(Icons.Outlined.OpenInNew,null,Modifier.size(20.dp));Spacer(Modifier.width(8.dp));Text("Report an issue")}
            SmallLabel("Zebby for Android ${BuildConfig.VERSION_NAME}")
        }
    }
    if(newDatabase) AlertDialog(onDismissRequest={newDatabase=false},title={Text("Create a blank database?")},text={Text("Your current database stays on this device and in its cloud folder.")},confirmButton={TextButton(onClick={newDatabase=false;vm.action {vm.ensureIdle();vm.app.store.newWorkspace()}}){Text("Create")}},dismissButton={TextButton(onClick={newDatabase=false}){Text("Cancel")}})
    if(importUri!=null) AlertDialog(onDismissRequest={importUri=null},title={Text("Import this database?")},text={Text("Zebby will use a private copy. The original file and your current database will be kept.")},confirmButton={TextButton(onClick={val picked=importUri!!;importUri=null;vm.importDatabase(picked)}){Text("Import")}},dismissButton={TextButton(onClick={importUri=null}){Text("Cancel")}})
    if(cloudFiles!=null) AlertDialog(onDismissRequest={cloudFiles=null},title={Text("Choose a database")},text={Column(Modifier.verticalScroll(rememberScrollState())) {cloudFiles!!.forEach {document->TextButton(onClick={val folderUri=tree!!;cloudFiles=null;vm.action {vm.ensureIdle();vm.app.cloud.connect(folderUri,document)}}){Text(document.name)}}}},confirmButton={},dismissButton={TextButton(onClick={cloudFiles=null}){Text("Cancel")}})
    if(workspaceList!=null) AlertDialog(onDismissRequest={workspaceList=null},title={Text("Saved databases")},text={Column(Modifier.verticalScroll(rememberScrollState())) {workspaceList!!.forEach {name->TextButton(onClick={workspaceList=null;vm.action {vm.ensureIdle();vm.app.store.selectWorkspace(name)}}){Text(name)}}}},confirmButton={},dismissButton={TextButton(onClick={workspaceList=null}){Text("Cancel")}})
}
@Composable private fun ThinkingControl(levels:List<String>,selected:String,onChange:(String)->Unit) {
    if(levels.toSet()==setOf("off","on")) {
        Row(Modifier.fillMaxWidth().heightIn(min=56.dp).toggleable(value=selected=="on",role=Role.Switch,onValueChange={onChange(if(it) "on" else "off")}),verticalAlignment=Alignment.CenterVertically) {
            Text("Thinking",Modifier.weight(1f),style=MaterialTheme.typography.bodyLarge)
            Switch(checked=selected=="on",onCheckedChange=null)
        }
    } else Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
        SmallLabel("Thinking")
        FlowRow(Modifier.selectableGroup(),horizontalArrangement=Arrangement.spacedBy(8.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
            levels.forEach {level ->
                val active=selected==level
                Surface(shape=MaterialTheme.shapes.small,color=if(active) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainer) {
                    Box(Modifier.selectable(selected=active,role=Role.RadioButton,onClick={onChange(level)}).heightIn(min=48.dp).padding(horizontal=16.dp,vertical=12.dp),contentAlignment=Alignment.Center) {
                        Text(thinkingLabel(level),style=MaterialTheme.typography.labelLarge,color=if(active) MaterialTheme.colorScheme.onPrimaryContainer else MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}
@Composable private fun KeyControl(provider:String,vm:ZebbyViewModel) {
    var key by remember(provider) {mutableStateOf(runCatching {vm.app.vault.get(provider)}.getOrDefault(""))}
    var editing by remember(provider) {mutableStateOf(key.isBlank())};var typed by remember(provider) {mutableStateOf("")};var remove by remember {mutableStateOf(false)}
    if(editing) {
        OutlinedTextField(value=typed,onValueChange={typed=it},label={Text("API key")},placeholder={Text("Paste your key")},visualTransformation=PasswordVisualTransformation(),singleLine=true,modifier=Modifier.fillMaxWidth())
        Row {TextButton(enabled=typed.trim().length>=20,onClick={val next=typed.trim();vm.action {vm.app.vault.put(provider,next);withContext(Dispatchers.Main) {key=next;typed="";editing=false}}}) {Text("Done")};if(key.isNotBlank()) TextButton(onClick={typed="";editing=false}) {Text("Cancel")}}
    } else Row(Modifier.fillMaxWidth(),verticalAlignment=Alignment.CenterVertically) {
        Text("•••• •••• ${key.takeLast(4)}",Modifier.weight(1f),style=MaterialTheme.typography.bodyMedium)
        TextButton(onClick={editing=true}) {Text("Change")};TextButton(onClick={remove=true}) {Text("Remove")}
    }
    if(remove) AlertDialog(onDismissRequest={remove=false},title={Text("Remove this key?")},text={Text("The key will only be removed from this device.")},confirmButton={TextButton(onClick={remove=false;vm.action {vm.app.vault.put(provider,"");withContext(Dispatchers.Main) {key="";editing=true}}}){Text("Remove")}},dismissButton={TextButton(onClick={remove=false}){Text("Cancel")}})
}
