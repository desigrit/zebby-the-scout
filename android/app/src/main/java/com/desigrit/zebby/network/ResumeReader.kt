package com.desigrit.zebby.network

import com.desigrit.zebby.data.readBounded
import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.jsoup.Jsoup
import org.jsoup.parser.Parser
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

object ResumeReader {
    fun read(context:Context,name:String,bytes:ByteArray):String {
        require(bytes.size <= 10*1024*1024) { "Choose a resume up to 10 MB." }
        val text = when(name.substringAfterLast('.').lowercase()) {
            "pdf" -> { PDFBoxResourceLoader.init(context); PDDocument.load(bytes).use { document -> require(!document.isEncrypted) { "Choose a PDF without password protection." }; PDFTextStripper().getText(document) } }
            "docx" -> ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
                var extracted:String?=null; var entry=zip.nextEntry; var entries=0;var expanded=0
                while(entry!=null) {
                    require(++entries <= 2000) { "This Word file is too complex to read." }
                    if(entry.name=="word/document.xml") {
                        val buffer=zip.readBounded(8*1024*1024+1);require(buffer.size<=8*1024*1024) { "This Word file is too large to read." }
                        val doc=Jsoup.parse(String(buffer,Charsets.UTF_8),"",Parser.xmlParser())
                        extracted=doc.getElementsByTag("w:p").joinToString("\n") { it.getElementsByTag("w:t").joinToString("") { t -> t.text() } };break
                    }
                    val skipped=zip.readBounded(16*1024*1024-expanded+1);expanded+=skipped.size
                    require(expanded<=16*1024*1024) {"This Word file expands beyond the supported size."}
                    zip.closeEntry();entry=zip.nextEntry
                }
                extracted ?: error("This Word document did not contain readable text.")
            }
            "txt" -> String(bytes,Charsets.UTF_8)
            else -> error("Choose a PDF, DOCX or text resume.")
        }.trim()
        require(text.length>=30) { "This resume has too little readable text. Use a text-based PDF, DOCX or text file." }
        require(text.length<=120000) { "This resume is too long to analyze. Choose a shorter version." }
        return text
    }
}
