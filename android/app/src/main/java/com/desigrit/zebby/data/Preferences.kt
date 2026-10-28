package com.desigrit.zebby.data

import android.content.Context
import org.json.JSONObject

data class Model(val id:String,val name:String,val provider:String,val paid:Boolean,val levels:List<String>,val default:String)
class Contracts(context:Context) {
    val json=JSONObject(context.assets.open("contracts.json").bufferedReader().use { it.readText() })
    val models:List<Model> = json.getJSONArray("models").let { a -> (0 until a.length()).map { i -> a.getJSONObject(i).let { o ->
        Model(o.getString("id"),o.getString("name"),o.getString("provider"),o.getBoolean("paid"),jsonArray(o.getJSONArray("values").toString()),o.getString("defaultValue")) } } }
}
class Preferences(context:Context) {
    private val p=context.getSharedPreferences("settings",Context.MODE_PRIVATE)
    operator fun get(key:String):String = p.getString(key,"")!!
    fun put(key:String,value:String) { check(p.edit().putString(key,value).commit()) { "Could not save settings." } }
    var provider:String get()=this["provider"].ifBlank { "credits" }; set(v)=put("provider",v)
    fun model()=this["model:$provider"].ifBlank { if(provider=="anthropic") "claude-sonnet-5-5" else if(provider=="ollama") "" else "gpt-6.1-sol" }
    fun setModel(value:String)=put("model:$provider",value)
    fun thinking(model:Model?)=this["thinking:$provider:${model()}:${if(provider=="ollama") this["server"] else ""}"].ifBlank { model?.default ?: "default" }
    fun setThinking(value:String)=put("thinking:$provider:${model()}:${if(provider=="ollama") this["server"] else ""}",value)
}
