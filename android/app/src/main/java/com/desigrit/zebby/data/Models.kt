package com.desigrit.zebby.data

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

fun now(): String = Instant.now().toString()
fun id(): String = UUID.randomUUID().toString()
fun jsonArray(value: String): List<String> = runCatching { JSONArray(value).let { a -> (0 until a.length()).map { a.getString(it) } } }.getOrDefault(emptyList())
fun locations(value: String): List<String> = value.split(';', '|', '\n').map(String::trim).filter(String::isNotEmpty).distinctBy(String::lowercase)
fun canonicalUrl(value: String): String = runCatching {
    val uri = URI(value.trim()); require(uri.scheme in listOf("http", "https") && !uri.host.isNullOrBlank() && uri.userInfo == null)
    val query = uri.rawQuery?.split('&')?.filterNot { it.substringBefore('=').lowercase().let { k -> k.startsWith("utm_") || k in listOf("source", "ref", "gh_src") } }?.sorted()?.joinToString("&")?.ifBlank { null }
    URI("https", null, uri.host.lowercase(), -1, uri.path.trimEnd('/'), query, null).toString()
}.getOrDefault(value.trim().trimEnd('/'))

enum class JobStatus(val label: String) {
    Applied("Applied"), HeardBack("Heard back"), Interview("Interview scheduled"), Rejected("Rejected"), Offer("Offer received");
    companion object { fun of(value: String) = entries.firstOrNull { it.label == value } ?: Applied }
}

/** Uses desktop column names, preserving all unrelated columns when an existing row is edited. */
data class Job(val plan: Boolean, val fields: Map<String, String>) {
    operator fun get(name: String): String = fields[name].orEmpty()
    val id get() = this["id"]
    val title get() = this["title"].ifBlank { "Untitled role" }
    val company get() = this["company"]
    val descriptionKey get() = if (plan) "description" else "job_description"
    val description get() = this[descriptionKey]
    val score get() = this["match_strength"].toIntOrNull()?.takeIf { it in 0..100 }
    val status get() = JobStatus.of(this["status"])
    fun with(key: String, value: String) = copy(fields = fields + (key to value))
    fun source() = listOf("listing_url", "company", "title", "team", "locations", descriptionKey, "current_overview", "resume_id").joinToString("\u0000") { this[it] }
    fun toJson(): String = JSONObject().put("plan", plan).put("fields", JSONObject(fields)).toString()
    companion object {
        fun fresh(plan: Boolean, summary: String = "") = Job(plan, mapOf("id" to id(), "created_at" to now(), "updated_at" to now(),
            "status" to JobStatus.Applied.label, "applied_date" to LocalDate.now().toString(), "current_overview" to summary))
        fun fromJson(value: String): Job { val o = JSONObject(value); val f = o.getJSONObject("fields"); return Job(o.getBoolean("plan"), f.keys().asSequence().associateWith { f.getString(it) }) }
    }
}
data class Resume(val id: String, val name: String, val size: Long, val mime: String)
data class Recommendation(val text: String, val importance: Int?)
fun Job.recommendations(key: String): List<Recommendation> {
    val texts = jsonArray(this["${key}_json"])
    val ratings = runCatching { JSONArray(this["${if (key == "keywords") "keyword" else "theme"}_importance_json"]) }.getOrNull()
    return texts.mapIndexed { index, text -> Recommendation(text, ratings?.optInt(index, -1)?.takeIf { it in 0..100 }) }
}

data class AnalysisResult(val score: Int, val explanation: String, val keywords: List<Recommendation> = emptyList(),
    val themes: List<Recommendation> = emptyList(), val overview: String = "", val rationale: String = "") {
    fun apply(job: Job): Job {
        var updated = job.with("match_strength", score.toString()).with("match_notes", explanation).with("match_analyzed_at", now())
        if (job.plan) {
            updated = updated.with("keywords_json", JSONArray(keywords.map { it.text }).toString())
                .with("keyword_importance_json", JSONArray(keywords.map { it.importance }).toString())
                .with("themes_json", JSONArray(themes.map { it.text }).toString())
                .with("theme_importance_json", JSONArray(themes.map { it.importance }).toString())
                .with("overview", overview).with("overview_rationale", rationale)
        }
        return updated
    }
    companion object {
        fun parse(value: JSONObject, plan: Boolean): AnalysisResult {
            val number = value.get("score") as? Number ?: error("The model returned an invalid match score.")
            require(number.toDouble() % 1.0 == 0.0 && number.toInt() in 0..100) { "The model returned an invalid match score." }
            fun text(key: String, max: Int = 16000): String = value.getString(key).replace('—', '-').also { require(it.isNotBlank() && it.length <= max) { "The model returned an incomplete analysis." } }
            fun items(key: String, count: IntRange, max: Int): List<Recommendation> {
                val a = value.getJSONArray(key); require(a.length() in count) { "The model returned an incomplete $key list. Try again." }
                return (0 until a.length()).map { i ->
                    val row = a.getJSONObject(i); val t = row.getString("text"); val n = row.get("importance") as? Number ?: error("Invalid importance.")
                    require(t.isNotBlank() && t.length <= max && n.toDouble() % 1.0 == 0.0 && n.toInt() in 0..100) { "The model returned an invalid recommendation." }
                    Recommendation(t.replace('—', '-'), n.toInt())
                }
            }
            return AnalysisResult(number.toInt(), text("explanation", 8000), if (plan) items("keywords", 6..20, 200) else emptyList(),
                if (plan) items("themes", 5..6, 1000) else emptyList(), if (plan) text("overview") else "", if (plan) text("overviewRationale", 8000) else "")
        }
    }
}
