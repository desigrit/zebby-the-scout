package com.desigrit.zebby.network

import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import com.desigrit.zebby.data.readBounded
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import org.json.JSONArray
import org.json.JSONObject
import org.jsoup.Jsoup
import org.jsoup.parser.Parser
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.URLDecoder
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

data class ResumeBlock(val id:Int,val text:String,val style:String,val editable:Boolean) {
    fun json()=JSONObject().put("id",id).put("text",text).put("style",style).put("editable",editable)
}

object TailoredResume {
    private val heading=Regex("(?i)^(?:(?:professional|work|relevant|selected|additional|technical|core)\\s+)?(?:summary|profile|experience|employment|education|skills|expertise|competencies|projects|certifications?|qualifications|achievements|accomplishments|awards|publications|volunteering|interests|languages)(?:\\s+(?:history|experience|summary))?\\s*:?$")
    private val contact=Regex("(?i)@|https?://|www\\.|linkedin\\.com|github\\.com|(?:\\+?\\d[\\d ().-]{7,}\\d)")
    private val date=Regex("\\b(?:19|20)\\d{2}\\b")
    private val bullet=Regex("^[•●▪◦‣*\\-]\\s+")
    private fun clean(text:String)=text.replace(Regex("\\s+")," ").trim()

    fun blocks(context:Context,name:String,bytes:ByteArray):List<ResumeBlock> {
        val lines=when(name.substringAfterLast('.').lowercase()) {
            "docx" -> ZipInputStream(bytes.inputStream()).use { zip ->
                var entry=zip.nextEntry;var xml:String?=null;var expanded=0;var entries=0
                while(entry!=null) {
                    require(++entries<=2000) {"This Word file is too complex to read."}
                    val data=zip.readBounded(8*1024*1024-expanded+1);expanded+=data.size
                    require(expanded<=8*1024*1024) {"This Word file is too large to tailor."}
                    if(entry.name=="word/document.xml") {xml=String(data,Charsets.UTF_8);break}
                    zip.closeEntry();entry=zip.nextEntry
                }
                val doc=Jsoup.parse(requireNotNull(xml) {"This Word file has no readable document."},"",Parser.xmlParser())
                doc.getElementsByTag("w:p").map { p ->
                    val text=p.getElementsByTag("w:t").joinToString("") {it.text()}
                    if(p.getElementsByTag("w:numPr").isNotEmpty()) "• $text" else text
                }
            }
            "pdf" -> {
                PDFBoxResourceLoader.init(context)
                PDDocument.load(bytes).use { document ->
                    require(!document.isEncrypted && document.numberOfPages<=30) {"Choose a text-based PDF with 30 pages or fewer, without a password."}
                    data class Line(var text:String,val x:Float,val y:Float,var bottom:Float,val size:Float)
                    val output=mutableListOf<String>()
                    for(page in 1..document.numberOfPages) {
                        val fragments=mutableListOf<Line>()
                        val reader=object:PDFTextStripper() {
                            override fun writeString(text:String,positions:MutableList<TextPosition>) {
                                val first=positions.firstOrNull() ?: return
                                if(text.isNotBlank()) fragments.add(Line(clean(text),first.xDirAdj,first.yDirAdj,first.yDirAdj,first.fontSizeInPt))
                            }
                        }.apply {sortByPosition=true;startPage=page;endPage=page}
                        reader.getText(document)
                        val rows=mutableListOf<Line>()
                        for(line in fragments.sortedWith(compareBy<Line> { (it.y/3).toInt() }.thenBy {it.x})) {
                            val previous=rows.lastOrNull()
                            if(previous!=null && kotlin.math.abs(previous.y-line.y)<=3) previous.text+=" ${line.text}" else rows.add(line)
                        }
                        val paragraphs=mutableListOf<Line>()
                        for(line in rows) {
                            val previous=paragraphs.lastOrNull()
                            fun metadata(t:String)=heading.matches(t) || date.containsMatchIn(t) || contact.containsMatchIn(t)
                            if(previous!=null && kotlin.math.abs(previous.size-line.size)<1 && line.y>previous.bottom && line.y-previous.bottom<line.size*1.65
                                && line.x>=previous.x-2 && line.x<=previous.x+22 && !bullet.containsMatchIn(line.text)
                                && !metadata(line.text) && !metadata(previous.text) && !Regex("[.!?:;]$").containsMatchIn(previous.text)) {
                                previous.text+=" ${line.text}";previous.bottom=line.y
                            } else paragraphs.add(line.copy())
                        }
                        output.addAll(paragraphs.map {it.text})
                    }
                    output
                }
            }
            else -> ResumeReader.read(context,name,bytes).lines()
        }.map(::clean).filter(String::isNotBlank)
        require(lines.size in 1..800 && lines.sumOf {it.length} in 30..60000) {"Choose a readable resume with less than 60,000 characters."}
        return lines.mapIndexed {id,text ->
            val style=when {id==0 -> "name";bullet.containsMatchIn(text) -> "bullet";contact.containsMatchIn(text) -> "contact";heading.matches(text) -> "heading";else -> "paragraph"}
            ResumeBlock(id,text.replace(bullet,""),style,style in listOf("paragraph","bullet") && text.length>=55 && !date.containsMatchIn(text) && !contact.containsMatchIn(text))
        }
    }

    fun apply(blocks:List<ResumeBlock>,result:JSONObject):List<ResumeBlock> {
        require(result.keys().asSequence().toSet()==setOf("edits")) {"The model returned an invalid resume edit. Try again."}
        val edits=result.getJSONArray("edits");require(edits.length()<=300)
        val source=blocks.associateBy {it.id};val replacements=mutableMapOf<Int,String>()
        fun numbers(text:String)=Regex("\\b\\d[\\d,.]*(?:%|\\+)?").findAll(text).map {it.value}.toSet()
        for(i in 0 until edits.length()) {
            val edit=edits.getJSONObject(i);val raw=edit.get("id") as? Number ?: error("Invalid resume edit.")
            require(raw.toDouble()%1==0.0 && edit.keys().asSequence().toSet()==setOf("id","text")) {"Invalid resume edit."}
            val id=raw.toInt();val block=source[id]
            require(block?.editable==true && !replacements.containsKey(id)) {"The model changed protected resume details. Try again."}
            val text=edit.getString("text").trim()
            require(text.isNotEmpty() && text.length<=8000 && text.length<=block!!.text.length*1.6+80 && numbers(text)==numbers(block.text)
                && !Regex("(?i)https?://|www\\.|[\\w.+-]+@[\\w.-]+\\.\\w+|[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]").containsMatchIn(text)) {"The model returned an invalid resume edit. Try again."}
            replacements[id]=text
        }
        return blocks.map {it.copy(text=(replacements[it.id] ?: it.text).replace('\u2014','-'))}
    }

    fun name(original:String,url:String,planId:String):String {
        val job=runCatching {
            val uri=URI(url);val query=uri.rawQuery.orEmpty().split('&').map {it.split('=',limit=2)}
            query.firstOrNull {it.size==2 && it[0] in listOf("gh_jid","jobId","job_id","requisitionId") }?.get(1)?.let {URLDecoder.decode(it,"UTF-8")}
                ?: uri.path.split('/').lastOrNull {it.matches(Regex("(?i)(?:\\d{4,}|[a-z]*\\d{4,}[a-z\\d-]*|[\\da-f]{8}-[\\da-f-]{27})"))}
        }.getOrNull() ?: planId.take(8)
        fun safe(s:String)=s.replace(Regex("[<>:\"/\\\\|?*\\x00-\\x1f]")," ").replace('\u2014','-').trim().trimEnd('.')
        return "${safe(original.substringBeforeLast('.',original)).take(100).ifBlank {"Resume"}} - ${safe(job).take(60)} - tailored"
    }

    fun word(blocks:List<ResumeBlock>):ByteArray {
        fun xml(s:String)=s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;")
        val output=ByteArrayOutputStream()
        ZipOutputStream(output).use {zip ->
            fun part(name:String,text:String) {zip.putNextEntry(ZipEntry(name));zip.write(text.toByteArray(Charsets.UTF_8));zip.closeEntry()}
            part("[Content_Types].xml","""<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>""")
            part("_rels/.rels","""<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>""")
            val paragraphs=blocks.joinToString("") {b ->
                val size=when(b.style) {"name" -> 42;"heading" -> 22;"contact" -> 19;else -> 21}
                val strong=b.style in listOf("name","heading")
                """<w:p><w:pPr><w:spacing w:before="${if(b.style=="heading") 260 else 0}" w:after="100" w:line="312"/>${if(strong) "<w:keepNext/>" else ""}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="$size"/>${if(strong) "<w:b/>" else ""}</w:rPr><w:t xml:space="preserve">${if(b.style=="bullet") "•  " else ""}${xml(b.text)}</w:t></w:r></w:p>"""
            }
            part("word/document.xml","""<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>$paragraphs<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="864" w:bottom="864" w:left="936" w:right="936"/></w:sectPr></w:body></w:document>""")
        }
        return output.toByteArray()
    }

    fun pdf(blocks:List<ResumeBlock>):ByteArray {
        val document=PdfDocument();val output=ByteArrayOutputStream();var pageNumber=1
        var page=document.startPage(PdfDocument.PageInfo.Builder(612,792,pageNumber).create());var y=43f
        fun nextPage() {document.finishPage(page);page=document.startPage(PdfDocument.PageInfo.Builder(612,792,++pageNumber).create());y=43f}
        try {
            for(block in blocks) {
                val paint=TextPaint(Paint.ANTI_ALIAS_FLAG).apply {color=Color.rgb(37,37,37);textSize=when(block.style) {"name" -> 21f;"heading" -> 11f;"contact" -> 9.5f;else -> 10.5f};typeface=Typeface.create("sans-serif",if(block.style in listOf("name","heading")) Typeface.BOLD else Typeface.NORMAL)}
                if(block.style=="heading") y+=13
                val text=if(block.style=="bullet") "•  ${block.text}" else block.text
                val layout=StaticLayout.Builder.obtain(text,0,text.length,paint,518).setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false).setLineSpacing(0f,1.3f).build()
                if(y+layout.height+(if(block.style=="heading") 35 else 0)>749 && layout.height<650) nextPage()
                for(line in 0 until layout.lineCount) {
                    val lineHeight=paint.fontSpacing*1.3f
                    if(y+lineHeight>749) nextPage()
                    val visible=text.substring(layout.getLineStart(line),layout.getLineEnd(line)).trimEnd()
                    page.canvas.drawText(visible,47f,y-paint.fontMetrics.ascent,paint);y+=lineHeight
                }
                y+=5
            }
            document.finishPage(page);document.writeTo(output)
        } finally {document.close()}
        return output.toByteArray()
    }
}
