@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class,androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.desigrit.zebby.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.desigrit.zebby.R
import com.desigrit.zebby.ZebbyViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.math.roundToInt

fun credits(value:Long):String=java.text.NumberFormat.getNumberInstance().apply {maximumFractionDigits=2}.format(value/1_000_000.0)
private fun available(wallet:JSONObject)=(wallet.optLong("balance")-wallet.optLong("reserved")).coerceAtLeast(0)
private fun fraction(wallet:JSONObject)=(available(wallet).toDouble()/wallet.optLong("purchased").coerceAtLeast(1)).toFloat().coerceIn(0f,1f)
@Composable fun CreditCompact(vm:ZebbyViewModel,onBuy:()->Unit) {
    val wallet=runCatching {vm.app.credits.cachedWallet()}.getOrNull() ?: return
    Column(Modifier.width(72.dp).heightIn(min=48.dp).clickable(onClick=onBuy).padding(horizontal=12.dp,vertical=8.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(6.dp)) {
        Text("${(fraction(wallet)*100).roundToInt()}%",style=MaterialTheme.typography.labelSmall)
        LinearProgressIndicator(progress={fraction(wallet)},modifier=Modifier.fillMaxWidth().height(3.dp),color=MaterialTheme.colorScheme.onSurfaceVariant,trackColor=MaterialTheme.colorScheme.outlineVariant,drawStopIndicator={})
    }
}
@Composable fun CreditSummary(vm:ZebbyViewModel,onBuy:()->Unit,showBuy:Boolean) {
    val wallet=runCatching {vm.app.credits.cachedWallet()}.getOrNull()
    var connection by remember {mutableStateOf("")};var code by remember {mutableStateOf("")};var learn by remember {mutableStateOf(false)}
    val connectionScope=rememberCoroutineScope()
    var connectionWorking by remember {mutableStateOf(false)};var connectionError by remember {mutableStateOf("")}
    var recoveryConfirm by remember {mutableStateOf(false)}
    var recovery by remember {mutableStateOf("")};var pairing by remember {mutableStateOf<JSONObject?>(null)};var manage by remember {mutableStateOf<JSONObject?>(null)}
    val export=rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/plain")) {uri -> if(uri!=null && recovery.isNotBlank()) vm.action {
        vm.app.contentResolver.openOutputStream(uri,"w").use {requireNotNull(it);it.write("Zebby credits recovery code\n\n$recovery\n\nKeep this private. Anyone with this code can connect to your credits.\n".toByteArray())};vm.app.credits.recoverySaved()
    } }
    if(wallet!=null && wallet.optLong("purchased")>0) {
        Surface(color=MaterialTheme.colorScheme.surfaceContainer,shape=MaterialTheme.shapes.medium) {
            Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween,verticalAlignment=Alignment.CenterVertically) {Text("${credits(available(wallet))} credits",style=MaterialTheme.typography.titleMedium);ActionIcon(Icons.Outlined.Refresh,"Refresh balance") {vm.refreshCredits()}}
                Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {SmallLabel("${credits(wallet.optLong("used"))} used of ${credits(wallet.optLong("purchased"))}");SmallLabel("${(fraction(wallet)*100).roundToInt()}% left")}
                LinearProgressIndicator(progress={fraction(wallet)},modifier=Modifier.fillMaxWidth().height(4.dp),color=MaterialTheme.colorScheme.onSurfaceVariant,trackColor=MaterialTheme.colorScheme.outlineVariant,drawStopIndicator={})
            }
        }
    } else SmallLabel("No credits yet. Buy a pack or connect your existing credits.")
    if(showBuy) Button(onClick=onBuy,modifier=Modifier.heightIn(min=48.dp)) {Text("Buy Zebby credits")}
    FlowRow(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
        TextButton(onClick={connection="restore";code="";connectionError=""}) {Text("Restore credits")}
        TextButton(onClick={connection="connect";code="";connectionError=""}) {Text("Connect this device")}
        TextButton(onClick={learn=true}) {Text("Learn more")}
    }
    if(wallet!=null && wallet.optLong("purchased")>0) {
        TextButton(onClick={recoveryConfirm=true}) {Icon(Icons.Outlined.Key,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text("Save recovery code")}
        TextButton(onClick={vm.action {val value=vm.app.credits.pairing();withContext(Dispatchers.Main) {pairing=value}}}) {Text("Connect another device")}
        TextButton(onClick={vm.action {val value=vm.app.credits.access();withContext(Dispatchers.Main) {manage=value}}}) {Text("Connected devices")}
    }
    if(connection.isNotBlank()) AlertDialog(onDismissRequest={if(!connectionWorking) connection=""},title={Text(if(connection=="restore") "Restore credits" else "Connect this device")},text={Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
        Text(if(connection=="restore") "Paste your saved recovery code." else "Enter the pairing code shown on your other device.",style=MaterialTheme.typography.bodyMedium)
        OutlinedTextField(value=code,onValueChange={code=it;connectionError=""},enabled=!connectionWorking,label={Text("Code")},isError=connectionError.isNotBlank(),modifier=Modifier.fillMaxWidth())
        if(connectionError.isNotBlank()) Text(connectionError,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodyMedium)
        if(wallet!=null && wallet.optLong("purchased")>0) SmallLabel("This switches the device to those credits. Save your current recovery code first.")
    }},confirmButton={TextButton(enabled=code.isNotBlank() && !connectionWorking,onClick={
        val method=connection;val enteredCode=code;connectionWorking=true;connectionError=""
        connectionScope.launch {
            try {
                withContext(Dispatchers.IO) {vm.ensureIdle();vm.app.credits.connect(method,enteredCode);vm.app.credits.refresh()}
                connection="";code="";vm.reload()
            } catch(e:CancellationException) {throw e} catch(e:Exception) {vm.app.log("credits.connect.failed",e);connectionError=e.message ?: "Could not connect. Try again."} finally {connectionWorking=false}
        }
    }){if(connectionWorking) {CircularProgressIndicator(Modifier.size(16.dp),strokeWidth=2.dp);Spacer(Modifier.width(8.dp))};Text(if(connectionWorking) "Connecting" else "Connect")}},dismissButton={TextButton(enabled=!connectionWorking,onClick={connection=""}){Text("Cancel")}})
    if(recoveryConfirm) AlertDialog(onDismissRequest={recoveryConfirm=false},title={Text("Save a recovery code?")},text={Text("A new code can replace a code saved on another device. Keep the new file somewhere private and replace any older copy.")},confirmButton={TextButton(onClick={recoveryConfirm=false;vm.action {val value=vm.app.credits.recoveryCode();withContext(Dispatchers.Main) {recovery=value;export.launch("Zebby-recovery-code.txt")}}}){Text("Save code")}},dismissButton={TextButton(onClick={recoveryConfirm=false}){Text("Cancel")}})
    if(learn) AlertDialog(onDismissRequest={learn=false},title={Text("Your credits, on your devices")},text={Column(verticalArrangement=Arrangement.spacedBy(16.dp)) {Text("Restore credits uses your saved recovery code after reinstalling Zebby or losing access to a device.");Text("Connect this device uses a short-lived pairing code from another connected device. Both share the same credit balance.")}},confirmButton={TextButton(onClick={learn=false}){Text("Done")}})
    if(pairing!=null) AlertDialog(onDismissRequest={pairing=null},title={Text("Connect another device")},text={Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {Text(pairing!!.getString("code"),style=MaterialTheme.typography.headlineMedium);Text("In Settings on your other device, choose Connect this device. This code expires after 10 minutes.")}},confirmButton={TextButton(onClick={pairing=null}){Text("Done")}})
    if(manage!=null) AlertDialog(onDismissRequest={manage=null},title={Text("Connected devices")},text={Column {val devices=manage!!.getJSONArray("devices");for(i in 0 until devices.length()) {val device=devices.getJSONObject(i);Text(device.getString("name")+if(device.optBoolean("current")) " · This device" else "",Modifier.padding(vertical=12.dp))}}},confirmButton={TextButton(onClick={manage=null}){Text("Done")}})
}
@Composable fun CreditsSheet(vm:ZebbyViewModel,onDismiss:()->Unit) {
    val uriHandler=LocalUriHandler.current
    var selection by remember {mutableStateOf("starter")};var working by remember {mutableStateOf(false)};var error by remember {mutableStateOf("")};var checkout by remember {mutableStateOf(false)};var paid by remember {mutableStateOf(false)}
    val scope=rememberCoroutineScope();val packs=vm.app.contracts.json.getJSONArray("packs")
    LaunchedEffect(Unit) {runCatching {vm.app.credits.warm()}}
    fun checkPayment() {scope.launch {working=true;try {val result=withContext(Dispatchers.IO) {vm.app.credits.checkoutStatus().also {vm.app.credits.refresh()}};paid=result=="paid";if(!paid) error="Payment is still pending. Finish in your browser, then check again.";vm.reload()} catch(e:CancellationException) {throw e} catch(e:Exception) {error=e.message ?: "Could not check payment. Try again."} finally {working=false}}}
    ModalBottomSheet(onDismissRequest={if(!working) onDismiss()},sheetState=rememberModalBottomSheetState(skipPartiallyExpanded=true),containerColor=MaterialTheme.colorScheme.surface) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal=24.dp).padding(bottom=32.dp),verticalArrangement=Arrangement.spacedBy(20.dp)) {
            Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {Image(painterResource(R.drawable.zebby),null,Modifier.size(36.dp));Text(if(paid) "Your credits are ready" else "A little fuel for your next move",Modifier.weight(1f),style=MaterialTheme.typography.headlineSmall)}
            if(paid) {
                val wallet=vm.app.credits.cachedWallet();Text("${credits(wallet?.let(::available) ?: 0)} credits available",style=MaterialTheme.typography.titleLarge)
                Text("Keep your credits if you reinstall or want to use Zebby's credits on another device. Save a recovery code in Settings.",style=MaterialTheme.typography.bodyMedium)
                Button(onClick=onDismiss,modifier=Modifier.fillMaxWidth()) {Text("Done")}
            } else {
                SmallLabel("Online analysis without an API key or signup. Choose your model after purchasing credits.")
                Column(Modifier.selectableGroup(),verticalArrangement=Arrangement.spacedBy(12.dp)) {
                for(i in 0 until packs.length()) {
                    val pack=packs.getJSONObject(i);val active=selection==pack.getString("id")
                    Surface(modifier=Modifier.selectable(selected=active,enabled=!working,role=Role.RadioButton,onClick={selection=pack.getString("id")}),shape=MaterialTheme.shapes.medium,color=if(active) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerLowest,
                        border=BorderStroke(if(active) 2.dp else 1.dp,if(active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
                        Row(Modifier.fillMaxWidth().padding(16.dp),horizontalArrangement=Arrangement.spacedBy(16.dp),verticalAlignment=Alignment.CenterVertically) {
                            Column(Modifier.widthIn(min=64.dp)) {Text("$${pack.getInt("dollars")}",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.SemiBold);if(pack.getString("id")=="starter") SmallLabel("Start here")}
                            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(6.dp)) {
                                Text("${java.text.NumberFormat.getIntegerInstance().format(pack.getInt("credits"))} credits",style=MaterialTheme.typography.titleSmall)
                                SmallLabel("About ${pack.getInt("analyses")} analyses with Sol High\nor ${pack.getInt("lunaAnalyses")} with Luna High")
                            }
                        }
                    }
                }
                }
                Disclosure("About these estimates") {SmallLabel(vm.app.contracts.json.getString("estimateDescription"))}
                SmallLabel("Prices in USD. Your payment opens securely in your browser.")
                if(error.isNotBlank()) ErrorBanner(error) {error=""}
                if(checkout) OutlinedButton(onClick=::checkPayment,modifier=Modifier.fillMaxWidth()) {Text("Check payment")}
                Button(enabled=!working,onClick={working=true;error="";scope.launch {try {val url=withContext(Dispatchers.IO) {vm.app.credits.checkout(selection)};uriHandler.openUri(url);checkout=true;vm.reload()} catch(e:CancellationException) {throw e} catch(e:Exception) {error=e.message ?: "Checkout could not open. Try again."} finally {working=false}}},modifier=Modifier.fillMaxWidth().heightIn(min=52.dp)) {
                    if(working) {CircularProgressIndicator(Modifier.size(18.dp),strokeWidth=2.dp,color=MaterialTheme.colorScheme.onPrimary);Spacer(Modifier.width(12.dp))}
                    Text(if(working) "Opening checkout" else "Continue");Spacer(Modifier.width(8.dp));Icon(Icons.Outlined.OpenInNew,null,Modifier.size(18.dp))
                }
            }
        }
    }
}
