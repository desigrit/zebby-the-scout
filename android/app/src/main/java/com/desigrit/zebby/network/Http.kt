package com.desigrit.zebby.network

import kotlinx.coroutines.*
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class HttpFailure(val status:Int, message:String):IOException(message)
class Http(val client:OkHttpClient = OkHttpClient.Builder().connectTimeout(15,TimeUnit.SECONDS)
    .readTimeout(8,TimeUnit.MINUTES).callTimeout(9,TimeUnit.MINUTES).followRedirects(false).retryOnConnectionFailure(false).build()) {
    private class CancelHandle(var call:Call?=null)
    suspend fun response(url:String, body:JSONObject?=null, headers:Map<String,String> = emptyMap(), deadlineSeconds:Long=510):Response {
        if(headers.keys.any { it.equals("Authorization",true) || it.equals("x-api-key",true) }) require(url.startsWith("https://")) { "API credentials require HTTPS." }
        val handle=CancelHandle()
        val request=Request.Builder().tag(CancelHandle::class.java,handle).url(url).header("User-Agent","ZebbyAndroid/0.1")
        headers.forEach { (k,v) -> request.header(k,v) }
        if(body!=null) request.post(body.toString().toRequestBody("application/json".toMediaType()))
        val call=client.newCall(request.build());handle.call=call; call.timeout().timeout(deadlineSeconds,TimeUnit.SECONDS)
        return suspendCancellableCoroutine { continuation ->
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object:Callback {
                override fun onFailure(call:Call,e:IOException) { if(continuation.isActive) continuation.resumeWithException(IOException("Could not connect, or the request timed out. Check your connection and try again.",e)) }
                override fun onResponse(call:Call,response:Response) { if(continuation.isActive) continuation.resume(response) { _, value, _ -> value.close() } else response.close() }
            })
        }
    }
    /** Close a response immediately on coroutine cancellation, including a stalled stream. */
    suspend fun <T> consume(response:Response,block:suspend (Response)->T):T=coroutineScope {
        val closer=launch(Dispatchers.IO,start=CoroutineStart.UNDISPATCHED) {try {awaitCancellation()} finally {response.request.tag(CancelHandle::class.java)?.call?.cancel();response.close()}}
        try {block(response)} finally {closer.cancel();response.close()}
    }
    suspend fun json(url:String, body:JSONObject?=null, headers:Map<String,String> = emptyMap(), deadlineSeconds:Long=510):JSONObject = consume(response(url,body,headers,deadlineSeconds)) { response ->
        val raw=bounded(response,8*1024*1024)
        if(!response.isSuccessful) throw HttpFailure(response.code, when(response.code) {
            400 -> "The provider rejected this request. Check the model and thinking level."
            401,403 -> "Access was denied. Check your saved key or reconnect your credits."
            402 -> "There are not enough credits for this request."
            404 -> "This model or resource could not be found."
            409 -> "This operation is already in progress. Wait a moment and try again."
            429 -> "The provider's usage limit was reached. Check billing or try again shortly."
            in 500..599 -> "The service is temporarily unavailable. Try again shortly."
            else -> "The request could not be completed (${response.code})."
        })
        try { JSONObject(raw) } catch(_:Exception) { error("The service returned an unreadable response.") }
    }
    companion object {
        fun bounded(response:Response,limit:Int):String { val source=response.body?.source() ?: error("The response was empty.")
            require(!source.request(limit.toLong()+1)) { "The response was too large." }
            return source.readUtf8()
        }
    }
}
