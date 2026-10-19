package com.desigrit.zebby

import androidx.test.core.app.ApplicationProvider
import com.desigrit.zebby.data.*
import com.desigrit.zebby.network.*
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.launch
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.IOException

class MemorySecrets:Secrets {
    val values=mutableMapOf<String,String>()
    override fun get(name:String)=values[name].orEmpty()
    override fun put(name:String,value:String) {values[name]=value}
}
fun fakeHttp(handler:(Request)->Pair<Int,String>)=Http(OkHttpClient.Builder().addInterceptor {chain -> val result=handler(chain.request());Response.Builder().request(chain.request()).protocol(Protocol.HTTP_1_1).code(result.first).message("Test").body(result.second.toResponseBody("application/json".toMediaType())).build()}.build())
private val wallet="""{"balance":500000000,"reserved":0,"purchased":500000000,"used":0,"recent":[],"updatedAt":"2026-10-18T00:00:00Z"}"""

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class AnalysisTest {
    @Test fun malformedModelOutputDoesNotBecomeAnInflatedScore() {
        assertThrows(Exception::class.java) {AnalysisResult.parse(JSONObject("""{"score":150,"explanation":"Good"}"""),false)}
        assertThrows(Exception::class.java) {AnalysisResult.parse(JSONObject("""{"score":90.5,"explanation":"Good"}"""),false)}
        assertThrows(Exception::class.java) {AnalysisResult.parse(JSONObject("""{"score":80,"explanation":""}"""),false)}
        assertEquals(62,AnalysisResult.parse(JSONObject("""{"score":62,"explanation":"Strong discovery evidence; limited billing experience."}"""),false).score)
    }
    @Test fun openAiUsesSharedStrictSchemaAndRequestedThinking()=runBlocking {
        val vault=MemorySecrets().apply {put("openai","test-key-not-real")};var captured:Request?=null
        val http=fakeHttp {request -> captured=request;200 to """{"status":"completed","output":[{"content":[{"type":"output_text","text":"{\"score\":62,\"explanation\":\"Evidence and gaps.\"}"}]}]}""" }
        val contracts=Contracts(ApplicationProvider.getApplicationContext())
        val result=AnalysisEngine(http,contracts,vault).analyze("openai","gpt-6.1-sol","medium","",JSONObject().put("resumeText","fixture"),false) {}
        val buffer=okio.Buffer();captured!!.body!!.writeTo(buffer);val body=JSONObject(buffer.readUtf8())
        assertEquals("medium",body.getJSONObject("reasoning").getString("effort"));assertFalse(body.getBoolean("store"));assertEquals(16000,body.getInt("max_output_tokens"));assertTrue(body.getJSONObject("text").getJSONObject("format").getBoolean("strict"));assertEquals(62,result.score)
    }
    @Test fun paidLostReplyRecoversReceiptWithoutSecondPost()=runBlocking {
        val secrets=MemorySecrets().apply {put("device","zby_device_"+"a".repeat(64));put("wallet-id","wallet")};var posts=0
        val http=fakeHttp {r -> when(r.url.encodedPath) {
            "/health"->200 to """{"ok":true,"mode":"test"}"""
            "/v1/wallet"->200 to wallet
            "/v1/quotes"->200 to """{"id":"quote","model":"gpt-6.1-sol","thinkingLevel":"high","maximum":1000000,"expiresAt":"later"}"""
            "/v1/analysis"->{posts++;assertTrue(secrets.get("analysis:record").isNotBlank());throw IOException("Lost reply")}
            else->200 to """{"quoteId":"quote","model":"gpt-6.1-sol","status":"completed","result":{"score":73,"explanation":"Grounded result"},"wallet":$wallet}"""
        }}
        val client=Credits(http,secrets,"https://test.example");val input=JSONObject().put("resumeText","fixture")
        runCatching {client.analyze("record",input,false,"gpt-6.1-sol","high") {}}
        val recovered=client.analyze("record",input,false,"gpt-6.1-sol","high") {}
        assertEquals(73,recovered.getInt("score"));assertEquals(1,posts);assertTrue(secrets.get("analysis:record").isNotBlank())
        client.acknowledge("record");assertEquals("",secrets.get("analysis:record"))
    }
    @Test fun guestCredentialIsPersistedBeforeRegistration()=runBlocking {
        val secrets=MemorySecrets()
        val http=fakeHttp {request -> when(request.url.encodedPath) {
            "/health"->200 to """{"ok":true}"""
            "/v1/wallet/session"->401 to "{}"
            "/v1/wallet/guest"->{val token=JSONObject(secrets.get("candidate")).getString("token");assertTrue(token.matches(Regex("zby_device_[a-f0-9]{64}")));200 to """{"walletId":"wallet","deviceId":"device"}"""}
            "/v1/checkout"->200 to """{"id":"cs_test_abc","url":"https://checkout.stripe.com/test","mode":"test"}"""
            else->error("Unexpected request")
        }}
        val credits=Credits(http,secrets,"https://test.example");credits.checkout("starter");assertTrue(credits.connected());assertEquals("",secrets.get("candidate"))
    }
    @Test fun listingFormattingRetainsBulletsAndDecodesEntities() {
        val text=ListingReader.htmlText("<h2>Responsibilities</h2><ul><li>Build &amp; learn</li><li>Partner with design</li></ul>")
        assertTrue(text.contains("• Build & learn"));assertTrue(text.contains("• Partner with design"));assertFalse(text.contains("<li>"))
    }
    @Test fun cancellingAStalledBodyClosesTheSocketPromptly()=runBlocking {
        val server=okhttp3.mockwebserver.MockWebServer()
        server.enqueue(okhttp3.mockwebserver.MockResponse().setBody("{} ").setBodyDelay(2,java.util.concurrent.TimeUnit.SECONDS))
        server.start()
        try {
            val ready=kotlinx.coroutines.CompletableDeferred<Unit>()
            val job=kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.Dispatchers.IO).launch {
                val http=Http();http.consume(http.response(server.url("/").toString())) {response ->ready.complete(Unit);Http.bounded(response,1024)}
            }
            ready.await();kotlinx.coroutines.withTimeout(1000) {job.cancel();job.join()}
            assertTrue(job.isCancelled)
        } finally {server.shutdown()}
    }
    @Test fun httpNeverSendsKeysOverPlaintext()=runBlocking {
        val http=fakeHttp {error("Must not send")}
        assertTrue(runCatching {http.json("http://example.com",headers=mapOf("Authorization" to "Bearer fake"))}.isFailure)
    }
}
