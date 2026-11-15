package com.desigrit.zebby.network

import com.desigrit.zebby.data.Job
import com.desigrit.zebby.data.locations
import org.json.JSONArray
import org.json.JSONObject
import org.jsoup.Jsoup
import org.jsoup.nodes.Element
import java.net.URI

class ListingReader(private val http:Http) {
    suspend fun fill(job:Job):Job {
        val link=job["listing_url"].trim(); val uri=URI(link)
        require(uri.scheme=="https" && !uri.host.isNullOrBlank() && uri.userInfo==null) { "Enter an HTTPS job listing link." }
        val parts=uri.path.split('/').filter(String::isNotBlank)
        if(uri.host in listOf("job-boards.greenhouse.io","boards.greenhouse.io") && parts.size>=3 && parts[1]=="jobs" && parts[2].all(Char::isDigit)) {
            val board=parts[0];require(board.matches(Regex("[a-zA-Z0-9_-]+")))
            val o=http.json("https://boards-api.greenhouse.io/v1/boards/$board/jobs/${parts[2]}?content=true",deadlineSeconds=30)
            val company=o.optString("company_name").ifBlank { board.replaceFirstChar(Char::uppercase) }
            return apply(job,company,o.optString("title"),o.optJSONArray("departments")?.optJSONObject(0)?.optString("name").orEmpty(),
                o.optJSONObject("location")?.optString("name").orEmpty(),htmlText(o.optString("content")))
        }
        var target=link;var html=""
        for(i in 0..4) {
            val response=http.response(target,deadlineSeconds=30)
            http.consume(response) {
                if(it.code in 300..399) {
                    require(i<4) { "The listing redirected too many times." }
                    val next=URI(target).resolve(it.header("Location") ?: error("The listing redirect was incomplete."))
                    require(next.scheme=="https" && next.userInfo==null) { "The listing redirected to an unsupported address." };target=next.toString()
                } else {
                    require(it.isSuccessful) { if(it.code==403) "This site blocked automated reading. Open the listing and paste its description below." else "This listing could not be read (${it.code}). You can paste the description below." }
                    html=Http.bounded(it,5*1024*1024)
                }
            }
            if(html.isNotEmpty()) break
        }
        val doc=Jsoup.parse(html,target)
        fun posting(value:Any?):JSONObject? = when(value) {
            is JSONObject -> if(value.optString("@type")=="JobPosting" || value.optJSONArray("@type")?.toString()?.contains("JobPosting")==true) value else value.optJSONArray("@graph")?.let { posting(it) }
            is JSONArray -> (0 until value.length()).firstNotNullOfOrNull { posting(value.opt(it)) }
            else -> null
        }
        val structured=doc.select("script[type=application/ld+json]").firstNotNullOfOrNull { runCatching { val t=it.data().trim(); posting(if(t.startsWith("[")) JSONArray(t) else JSONObject(t)) }.getOrNull() }
        if(structured!=null) {
            val place=structured.opt("jobLocation");val places=if(place is JSONArray) (0 until place.length()).mapNotNull { place.optJSONObject(it) } else listOfNotNull(place as? JSONObject)
            val cities=places.map { p -> val a=p.optJSONObject("address") ?: p;listOf("addressLocality","addressRegion","addressCountry").map { a.optString(it) }.filter(String::isNotBlank).joinToString(", ") }.filter(String::isNotBlank).toMutableList()
            if(structured.optString("jobLocationType")=="TELECOMMUTE") cities.add("Remote")
            return apply(job,structured.optJSONObject("hiringOrganization")?.optString("name").orEmpty(),structured.optString("title"),"",cities.joinToString("; "),htmlText(structured.optString("description")))
        }
        doc.select("script,style,nav,footer,header,form").remove()
        val body=doc.selectFirst("[class*=job-description], [id*=job-description], article, main")
            ?: error("The job description was not available to read. Open the listing and paste it below.")
        val text=htmlText(body.html());require(text.length>=100) { "The listing contains too little job text. Paste the description below." }
        return apply(job,doc.selectFirst("meta[property=og:site_name]")?.attr("content").orEmpty(),doc.selectFirst("h1")?.text().orEmpty(),"","",text)
    }
    private fun apply(job:Job,company:String,fullTitle:String,department:String,place:String,description:String):Job {
        require(description.length>=80) { "The site did not provide a full job description. Paste it below." }
        val split=Regex("^((?:(?:Senior|Staff|Principal|Lead|Group|Associate|Technical)\\s+)*Product Manager),\\s+(.+)$",RegexOption.IGNORE_CASE).matchEntire(fullTitle.trim())
        var updated=job
        mapOf("company" to company,"title" to (split?.groupValues?.get(1) ?: fullTitle),"team" to (split?.groupValues?.get(2) ?: department),
            "locations" to locations(place).joinToString("; "),job.descriptionKey to description).forEach { (key,value) -> if(value.isNotBlank()) updated=updated.with(key,value) }
        return updated
    }
    companion object {
        fun htmlText(html:String):String {
            val decoded=if(!html.contains('<') && html.contains("&lt;")) org.jsoup.parser.Parser.unescapeEntities(html,false) else html
            val doc=Jsoup.parseBodyFragment(decoded);doc.select("script,style").remove()
            doc.select("br").forEach { it.before("\n") };doc.select("li").forEach { it.prependText("\n• ");it.appendText("\n") }
            doc.select("p,h1,h2,h3,h4,section,div,ul,ol").forEach { it.prependText("\n");it.appendText("\n") }
            return doc.body().wholeText().replace('\u00a0',' ').replace(Regex("[ \\t]+\\n"),"\n").replace(Regex("\\n{3,}"),"\n\n").trim()
        }
    }
}
