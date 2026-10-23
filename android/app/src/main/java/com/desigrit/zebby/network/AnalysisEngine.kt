package com.desigrit.zebby.network

import com.desigrit.zebby.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import kotlin.coroutines.coroutineContext

class AnalysisEngine(private val http:Http,private val contracts:Contracts,private val vault:Secrets) {
    suspend fun analyze(provider:String,model:String,thinking:String,server:String,input:JSONObject,plan:Boolean,progress:suspend (String)->Unit):AnalysisResult {
        val kind=if(plan) "plan" else "match";val contract=contracts.json.getJSONObject(kind);val instructions=contract.getString("instructions");val schema=contract.getJSONObject("schema")
        val limit=contracts.json.getJSONObject("outputLimits").getJSONObject(kind).optInt(thinking,6000)
        progress("Waiting for $model")
        val text=when(provider) {
            "openai" -> {
                val key=vault.get("openai");require(key.isNotBlank()) { "Add your OpenAI key in Settings." }
                val response=http.json("https://api.openai.com/v1/responses",JSONObject().put("model",model).put("store",false)
                    .put("reasoning",JSONObject().put("effort",if(thinking=="off") "none" else thinking)).put("max_output_tokens",limit)
                    .put("instructions",instructions).put("input",input.toString())
                    .put("text",JSONObject().put("format",JSONObject().put("type","json_schema").put("name","zebby_$kind").put("strict",true).put("schema",schema))),mapOf("Authorization" to "Bearer $key"))
                require(response.optString("status")=="completed") { "The model did not finish. Try a lower thinking level." }
                response.optJSONArray("output")?.let { a -> (0 until a.length()).flatMap { i -> a.optJSONObject(i)?.optJSONArray("content")?.let { c -> (0 until c.length()).mapNotNull { j -> c.optJSONObject(j)?.takeIf { it.optString("type")=="output_text" }?.optString("text") } }.orEmpty() }.joinToString("") }.orEmpty()
            }
            "anthropic" -> {
                val key=vault.get("anthropic");require(key.isNotBlank()) { "Add your Anthropic key in Settings." }
                val haiku=model.startsWith("claude-haiku")
                fun strip(value:Any?):Any? = when(value) { is JSONObject -> JSONObject().also { out -> value.keys().forEach { k -> if(k !in listOf("minLength","maxLength","minimum","maximum","minItems","maxItems")) out.put(k,strip(value.get(k))) } };is JSONArray -> JSONArray((0 until value.length()).map { strip(value.get(it)) });else -> value }
                val output=JSONObject().put("format",JSONObject().put("type","json_schema").put("schema",strip(schema)))
                if(!haiku) output.put("effort",thinking)
                val thoughts=if(!haiku) JSONObject().put("type","adaptive") else if(thinking=="on") JSONObject().put("type","enabled").put("budget_tokens",4096) else JSONObject().put("type","disabled")
                val response=http.json("https://api.anthropic.com/v1/messages",JSONObject().put("model",model).put("max_tokens",limit).put("system",instructions)
                    .put("messages",JSONArray().put(JSONObject().put("role","user").put("content",input.toString()))).put("thinking",thoughts).put("output_config",output),
                    mapOf("x-api-key" to key,"anthropic-version" to "2023-06-01"))
                require(response.optString("stop_reason")=="end_turn") { "The model did not finish its response. Try a lower thinking level." }
                response.getJSONArray("content").let { a -> (0 until a.length()).mapNotNull { a.optJSONObject(it)?.takeIf { c -> c.optString("type")=="text" }?.optString("text") }.joinToString("") }
            }
            "ollama" -> {
                require(model.isNotBlank()) { "Choose a server model in Settings." }
                val body=JSONObject().put("model",model).put("stream",true).put("format",schema)
                    .put("messages",JSONArray().put(JSONObject().put("role","system").put("content",instructions)).put(JSONObject().put("role","user").put("content",input.toString())))
                    .put("options",JSONObject().put("temperature",if(thinking=="on") 0.6 else 0))
                if(thinking!="default") body.put("think",when(thinking) { "on" -> true;"off" -> false;else -> thinking.removePrefix("level:") })
                http.consume(http.response(normalizeServer(server)+"/api/chat",body,deadlineSeconds=480)) { response ->
                    require(response.isSuccessful) { "Ollama could not analyze this job (${response.code}). Check the model on your server." }
                    val content=StringBuilder();var done=false;val source=response.body!!.source();var previous=""
                    while(!source.exhausted()) {
                        coroutineContext.ensureActive()
                        val line=source.readUtf8LineStrict(1024*1024);val chunk=JSONObject(line)
                        require(!chunk.has("error")) { "Ollama could not complete the analysis. Check the model on your server." }
                        val message=chunk.optJSONObject("message")
                        val stage=if(!message?.optString("thinking").isNullOrBlank()) "Thinking" else if(!message?.optString("content").isNullOrBlank()) "Writing analysis" else "Loading model"
                        if(stage!=previous) { progress(stage);previous=stage }
                        content.append(message?.optString("content").orEmpty());require(content.length<200000) { "The model response was too large." }
                        if(chunk.optBoolean("done")) { done=true;break }
                    }
                    require(done) { "The connection ended before analysis finished. Try again." };content.toString()
                }
            }
            else -> error("Choose an analysis method in Settings.")
        }
        progress("Checking the result")
        return AnalysisResult.parse(JSONObject(text),plan)
    }
    suspend fun serverModels(server:String):List<String> = http.json(normalizeServer(server)+"/api/tags",deadlineSeconds=15).getJSONArray("models").let { a -> (0 until a.length()).map { a.getJSONObject(it) }.sortedByDescending { it.optString("modified_at") }.map { it.getString("name") } }
    suspend fun serverThinking(server:String,model:String):List<String> {
        val result=http.json(normalizeServer(server)+"/api/show",JSONObject().put("model",model),deadlineSeconds=15)
        val values=result.optJSONObject("thinking")?.optJSONArray("values")
        if(values!=null) return (0 until values.length()).map { when(val v=values.get(it)) { true -> "on";false -> "off";else -> "level:$v" } }.takeUnless { it==listOf("off") }.orEmpty()
        return if(jsonArray(result.optJSONArray("capabilities")?.toString().orEmpty()).contains("thinking")) listOf("off","on") else emptyList()
    }
    companion object {
        fun normalizeServer(value:String):String { val uri=URI(value.trim());require(uri.scheme in listOf("http","https") && !uri.host.isNullOrBlank() && uri.userInfo==null && uri.query==null && uri.fragment==null) { "Enter your computer's Ollama URL, such as http://192.168.1.20:11434." }
            return value.trim().trimEnd('/').replace(Regex("/api(?:/(?:chat|tags))?$"),"") }
    }
}
