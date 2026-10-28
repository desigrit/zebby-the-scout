package com.desigrit.zebby.network

import com.desigrit.zebby.BuildConfig
import com.desigrit.zebby.data.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom

fun sha256(bytes:ByteArray):String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
private fun randomHex(size:Int):String = ByteArray(size).also { SecureRandom().nextBytes(it) }.joinToString("") { "%02x".format(it) }

class Credits(private val http:Http,private val vault:Secrets,private val origin:String=BuildConfig.CREDITS_URL) {
    private val mutex=Mutex()
    private var lastReady=0L
    fun connected()=vault.get("device").isNotBlank()
    fun cachedWallet():JSONObject?=vault.get("wallet").takeIf(String::isNotBlank)?.let(::JSONObject)
    suspend fun warm() {
        if(System.currentTimeMillis()-lastReady<12*60*1000) return
        withTimeout(120000) {
            while(true) {
                try { val value=http.json("$origin/health",deadlineSeconds=15);if(value.optBoolean("ok")) { lastReady=System.currentTimeMillis();break } }
                catch(e:CancellationException) { throw e } catch(_:Exception) { }
                delay(2000)
            }
        }
    }
    private suspend fun request(path:String,body:JSONObject?=null,token:String=vault.get("device")):JSONObject {
        warm();return http.json(origin+path,body,if(token.isBlank()) emptyMap() else mapOf("Authorization" to "Bearer $token"),if(path=="/v1/analysis") 510 else 30)
    }
    private suspend fun connectUnlocked(kind:String,code:String="") {
        var pending=vault.get("candidate").takeIf(String::isNotBlank)?.let(::JSONObject)
        if(pending!=null) require(pending.getString("kind")==kind && pending.getString("code")==code) { "Finish the pending wallet connection before starting another." }
        if(pending==null) { pending=JSONObject().put("token","zby_device_"+randomHex(32)).put("kind",kind).put("code",code);vault.put("candidate",pending.toString()) }
        val token=pending.getString("token")
        val session=try { request("/v1/wallet/session",token=token) } catch(e:HttpFailure) { if(e.status==401) null else throw e }
        val accepted=session ?: try {request("/v1/wallet/$kind",JSONObject().put("deviceToken",token).put("name","Zebby on Android").also { if(code.isNotBlank()) it.put("code",code) },token="")} catch(e:HttpFailure) {if(e.status in listOf(400,404,410,422)) vault.put("candidate","");throw e}
        require(accepted.optString("walletId").isNotBlank() && accepted.optString("deviceId").isNotBlank()) { "The wallet connection was incomplete." }
        vault.put("device",token);vault.put("wallet-id",accepted.getString("walletId"));vault.put("candidate","");vault.put("wallet","")
    }
    private suspend fun ensureGuestUnlocked() {
        val pending=vault.get("candidate").takeIf(String::isNotBlank)?.let(::JSONObject)
        if(pending!=null) connectUnlocked(pending.getString("kind"),pending.getString("code"))
        else if(!connected()) connectUnlocked("guest")
    }
    suspend fun refresh():JSONObject?=mutex.withLock {
        val pending=vault.get("candidate").takeIf(String::isNotBlank)?.let(::JSONObject)
        if(pending!=null) connectUnlocked(pending.getString("kind"),pending.getString("code"))
        if(!connected()) return@withLock null
        request("/v1/wallet").also { saveWallet(it) }
    }
    private fun saveWallet(value:JSONObject) { require(listOf("balance","used","purchased","reserved").all { value.has(it) && value.opt(it) is Number });vault.put("wallet",value.toString()) }
    suspend fun connect(kind:String,code:String) = mutex.withLock {
        require(kind in listOf("restore","connect"))
        val clean=if(kind=="restore") code.replace(Regex("\\s"),"").uppercase() else code.replace(Regex("[\\s-]"),"").uppercase()
        require(if(kind=="restore") clean.matches(Regex("ZEBBY-(?:[A-F0-9]{8}-){4}[A-F0-9]{8}")) else clean.matches(Regex("[A-HJ-NP-Z2-9]{8}"))) { "Check the code and try again." }
        if((cachedWallet()?.optLong("purchased") ?: 0)>0) require(vault.get("recovery-saved")==vault.get("wallet-id")) { "Save a recovery code for your current credits before connecting another wallet." }
        connectUnlocked(kind,clean)
    }
    suspend fun checkout(pack:String):String=mutex.withLock {
        ensureGuestUnlocked()
        var pending=vault.get("checkout-request").takeIf(String::isNotBlank)?.let(::JSONObject)
        if(pending!=null) require(pending.getString("pack")==pack) { "Complete or cancel the previous checkout before choosing another pack." }
        if(pending==null) { pending=JSONObject().put("pack",pack).put("requestId",id());vault.put("checkout-request",pending.toString()) }
        val result=request("/v1/checkout",pending);val uri=URI(result.getString("url"))
        require(uri.scheme=="https" && uri.host=="checkout.stripe.com" && uri.userInfo==null) { "The payment link could not be verified." }
        vault.put("checkout-id",result.getString("id"));vault.put("checkout-request","");uri.toString()
    }
    suspend fun checkoutStatus():String {
        val id=vault.get("checkout-id");if(id.isBlank()) return ""
        require(id.matches(Regex("cs_[a-zA-Z0-9_]+")))
        val result=request("/v1/checkout/$id");val status=result.getString("status")
        if(status=="paid") { saveWallet(result.getJSONObject("wallet"));vault.put("checkout-id","") }
        if(status=="expired") vault.put("checkout-id","")
        return status
    }
    suspend fun recoveryCode():String=mutex.withLock {
        ensureGuestUnlocked()
        val wallet=vault.get("wallet-id")
        var saved=vault.get("recovery").takeIf(String::isNotBlank)?.let(::JSONObject)
        if(saved?.optString("wallet")!=wallet) { saved=JSONObject().put("wallet",wallet).put("code","ZEBBY-"+randomHex(20).uppercase().chunked(8).joinToString("-"));vault.put("recovery",saved.toString()) }
        request("/v1/wallet/recovery",JSONObject().put("code",saved!!.getString("code")));saved.getString("code")
    }
    fun recoverySaved()=vault.put("recovery-saved",vault.get("wallet-id"))
    suspend fun pairing():JSONObject=mutex.withLock { ensureGuestUnlocked();request("/v1/wallet/pairing",JSONObject()) }
    suspend fun access():JSONObject=request("/v1/wallet/access")
    suspend fun removeDevice(deviceId:String) { require(deviceId.matches(Regex("[a-fA-F0-9-]{36}")));request("/v1/wallet/devices/$deviceId/remove",JSONObject()) }

    /** Durable receipt is acknowledged only after its validated result has reached SQLite. */
    suspend fun analyze(record:String,input:JSONObject,plan:Boolean,model:String,thinking:String,progress:suspend(String)->Unit):JSONObject {
        mutex.withLock { ensureGuestUnlocked() }
        val key="analysis:$record";val hash=sha256(input.toString().toByteArray());val wallet=vault.get("wallet-id")
        var pending=vault.get(key).takeIf(String::isNotBlank)?.let(::JSONObject)
        if(pending!=null) {
            require(pending.getString("wallet")==wallet && pending.getString("hash")==hash) { "A paid result is pending for an earlier version of this job. Restore its source before retrying." }
            progress("Recovering analysis")
            val previous=try { request("/v1/analyses/"+pending.getString("requestId")) } catch(e:HttpFailure) { if(e.status==404) null else throw e }
            if(previous!=null) {
                require(previous.getString("model")==pending.getString("model") && previous.getString("quoteId")==pending.getString("quoteId")) { "The recovered result did not match this job." }
                previous.optJSONObject("wallet")?.let(::saveWallet)
                if(previous.optString("status")=="completed" && previous.optJSONObject("result")!=null) return previous.getJSONObject("result")
                if(previous.optString("status")=="reserved") error("This analysis is still running. Try again shortly to recover it without another charge.")
            }
            vault.put(key,"");pending=null
        }
        progress("Preparing analysis")
        val quote=request("/v1/quotes",JSONObject().put("kind",if(plan) "plan" else "match").put("input",input).put("model",model).put("thinkingLevel",thinking))
        require(quote.getString("model")==model && quote.getString("thinkingLevel")==thinking) { "The quote did not match your selected model." }
        val balance=request("/v1/wallet").also(::saveWallet)
        require(balance.getLong("balance")-balance.getLong("reserved")>=quote.getLong("maximum")) { "You need more credits to begin this analysis. Buy credits in Settings." }
        pending=JSONObject().put("quoteId",quote.getString("id")).put("requestId",id()).put("hash",hash).put("wallet",wallet).put("model",model)
        vault.put(key,pending.toString())
        progress("Waiting for $model")
        val result=request("/v1/analysis",JSONObject().put("quoteId",pending.getString("quoteId")).put("requestId",pending.getString("requestId")).put("input",input))
        result.optJSONObject("wallet")?.let(::saveWallet)
        return result.getJSONObject("result")
    }
    fun pending(record:String)=vault.get("analysis:$record").isNotBlank()
    fun acknowledge(record:String)=vault.put("analysis:$record","")
}
