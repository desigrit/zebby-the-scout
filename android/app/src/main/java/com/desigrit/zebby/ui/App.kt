@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
package com.desigrit.zebby.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.desigrit.zebby.R
import com.desigrit.zebby.ZebbyViewModel
import com.desigrit.zebby.data.Job
import kotlinx.coroutines.launch

@Composable fun ZebbyRoot(vm:ZebbyViewModel,sharedText:String?=null) {
    val state by vm.state.collectAsStateWithLifecycle()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var selected by rememberSaveable { mutableStateOf("") }
    var editor by rememberSaveable { mutableStateOf<String?>(null) }
    var dirty by remember { mutableStateOf(false) }
    var leave by remember { mutableStateOf<(() -> Unit)?>(null) }
    var buy by remember { mutableStateOf(false) }
    val snackbar=remember { SnackbarHostState() }
    val scope=rememberCoroutineScope()
    fun navigate(action:()->Unit) { if(dirty) leave=action else action() }
    fun close() { editor=null;selected="";dirty=false }
    fun create() { val summary=runCatching { vm.app.store.lastSummary() }.getOrDefault("");editor=Job.fresh(tab==0,summary).toJson();selected="" }
    LaunchedEffect(sharedText) { if(!sharedText.isNullOrBlank()) { tab=0;editor=Job.fresh(true).with("listing_url",Regex("https?://\\S+").find(sharedText)?.value.orEmpty()).let { if(it["listing_url"].isBlank()) it.with("description",sharedText) else it }.toJson() } }
    LaunchedEffect(Unit) { vm.notices.collect { snackbar.showSnackbar(it,duration=SnackbarDuration.Short) } }
    BackHandler(enabled=editor!=null || selected.isNotBlank()) { navigate(::close) }
    ZebbyTheme(vm.app.preferences["appearance"]) {
        Surface(Modifier.fillMaxSize()) {
            BoxWithConstraints {
                val expanded=maxWidth>=840.dp
                val tabs=listOf("Plan","Applications","Settings")
                val icons=listOf(Icons.Outlined.ManageSearch,Icons.Outlined.WorkOutline,Icons.Outlined.Tune)
                Row {
                    if(expanded) NavigationRail(containerColor=MaterialTheme.colorScheme.surfaceContainerLow,header={
                        Image(painterResource(R.drawable.zebby),"Zebby",Modifier.padding(vertical=16.dp).size(40.dp))
                    }) { tabs.forEachIndexed { i,title -> NavigationRailItem(selected=tab==i,onClick={navigate {tab=i;close()}},icon={Icon(icons[i],title)},label={Text(title)},alwaysShowLabel=true) } }
                    Scaffold(modifier=Modifier.weight(1f),containerColor=MaterialTheme.colorScheme.background,
                        topBar={ TopAppBar(title={ Text(if(editor!=null) { if(Job.fromJson(editor!!).plan) "Plan" else "Application" } else tabs[tab]) },
                            navigationIcon={ if(editor!=null || selected.isNotBlank()) ActionIcon(Icons.AutoMirrored.Outlined.ArrowBack,"Back") { navigate(::close) }
                                else if(!expanded) Image(painterResource(R.drawable.zebby),"Zebby",Modifier.padding(start=20.dp,end=12.dp).size(36.dp)) },
                            actions={ if(runCatching { vm.app.credits.cachedWallet()?.optLong("purchased",0) ?: 0 }.getOrDefault(0)>0) CreditCompact(vm) { buy=true };if(state.busy) CircularProgressIndicator(Modifier.padding(16.dp).size(20.dp),strokeWidth=2.dp) },
                            colors=TopAppBarDefaults.topAppBarColors(containerColor=MaterialTheme.colorScheme.background)) },
                        bottomBar={ if(!expanded) NavigationBar(containerColor=MaterialTheme.colorScheme.surfaceContainerLow,tonalElevation=0.dp) {
                            tabs.forEachIndexed { i,title -> NavigationBarItem(selected=tab==i,onClick={navigate {tab=i;close()}},icon={Icon(icons[i],null)},label={Text(title)}) }
                        } },
                        snackbarHost={ SnackbarHost(snackbar) },
                        floatingActionButton={ if(tab<2 && editor==null && selected.isBlank()) ExtendedFloatingActionButton(onClick={create()},icon={Icon(Icons.Outlined.Add,null)},text={Text(if(tab==0) "New plan" else "Add application")},containerColor=MaterialTheme.colorScheme.primary,contentColor=MaterialTheme.colorScheme.onPrimary) }
                    ) { insets ->
                        Column(Modifier.padding(insets).consumeWindowInsets(insets).imePadding().fillMaxSize()) {
                            if(state.error.isNotBlank()) Box(Modifier.padding(horizontal=20.dp,vertical=8.dp)) { ErrorBanner(state.error,vm::clearError) }
                            val editing=editor?.let(Job::fromJson)
                            Box(Modifier.fillMaxSize(),contentAlignment=Alignment.TopCenter) {
                            val contentWidth=if(tab==2 && editing==null) 840.dp else if(tab==0 && editing==null) 840.dp else 1240.dp
                            Box(Modifier.widthIn(max=contentWidth).fillMaxSize()) {
                            when {
                                state.loading -> Box(Modifier.fillMaxSize(),contentAlignment=Alignment.Center) { CircularProgressIndicator() }
                                editing!=null -> JobEditor(vm,editing,state,wide=expanded,onDirty={dirty=it},onSaved={editor=it.toJson();dirty=false},onApplied={tab=1;editor=null;selected=it.id;dirty=false},onClose={close()})
                                tab==0 -> PlansScreen(state,vm,onSelect={editor=it.toJson()},onNew={create()})
                                tab==1 -> ApplicationsScreen(state,vm,selected,expanded,onSelect={selected=it},onEdit={editor=it.toJson()},onNew={create()},onClose={selected=""})
                                else -> SettingsScreen(vm,state,onBuy={buy=true})
                            }
                            }
                            }
                        }
                    }
                }
            }
        }
        if(leave!=null) AlertDialog(onDismissRequest={leave=null},title={Text("Discard your changes?")},text={Text("Your saved version will be kept.")},confirmButton={TextButton(onClick={val action=leave;leave=null;dirty=false;action?.invoke()}){Text("Discard")}},dismissButton={TextButton(onClick={leave=null}){Text("Keep editing")}})
        if(buy) CreditsSheet(vm,onDismiss={buy=false})
    }
}
