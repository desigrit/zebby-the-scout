package com.desigrit.zebby

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.desigrit.zebby.data.Job
import com.desigrit.zebby.data.Store
import com.desigrit.zebby.network.ResumeBlock
import com.desigrit.zebby.network.TailoredResume
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TailoredResumeTest {
    private val context:Context get()=ApplicationProvider.getApplicationContext()
    private val blocks=listOf(ResumeBlock(0,"Alex Morgan","name",false),ResumeBlock(1,"alex@example.com | Seattle, WA","contact",false),
        ResumeBlock(2,"Experience","heading",false),ResumeBlock(3,"Product Manager | Example | 2022 - Present","paragraph",false),
        ResumeBlock(4,"Led customer research and partnered with engineering to improve activation by 18%.","bullet",true))
    private fun edit(id:Int,text:String)=JSONObject().put("edits",JSONArray().put(JSONObject().put("id",id).put("text",text)))
    @Test fun validatedEditsKeepProtectedDetailsAndNumbers() {
        val result=TailoredResume.apply(blocks,edit(4,"Partnered with engineering on customer research, improving activation by 18%."))
        assertEquals(blocks.take(4),result.take(4))
        assertThrows(Exception::class.java) {TailoredResume.apply(blocks,edit(0,"Changed name"))}
        assertThrows(Exception::class.java) {TailoredResume.apply(blocks,edit(4,"Led customer research and improved activation by 99%."))}
        assertThrows(Exception::class.java) {TailoredResume.apply(blocks,edit(4,"Visit https://example.com to see my work."))}
    }
    @Test fun wordRoundTripKeepsAllSourceParagraphs() {
        val word=TailoredResume.word(blocks)
        assertEquals(blocks.map {it.text},TailoredResume.blocks(context,"Resume.docx",word).map {it.text})
        assertTrue(TailoredResume.blocks(context,"Resume.docx",word).last().editable)
        assertEquals("Alex Resume - 5434361008 - tailored",TailoredResume.name("Alex Resume.pdf","https://job-boards.greenhouse.io/anthropic/jobs/5434361008","uuid"))
        assertFalse(TailoredResume.name("../Bad: Name.docx","https://example.com/?jobId=../../bad","uuid").contains('/'))
    }
    @Test fun pdfKeepsContactDetailsDatesAndAchievements() {
        val pdf=javaClass.getResourceAsStream("/tailored-resume.pdf")!!.readBytes()
        assertTrue(String(pdf.take(5).toByteArray())=="%PDF-")
        val parsed=TailoredResume.blocks(context,"Resume.pdf",pdf).joinToString("\n") {it.text}
        for(text in listOf("Alex Morgan","alex@example.com","18%","2019 - 2022","Example University")) assertTrue(text,parsed.contains(text))
    }
    @Test fun savedPairIsAtomicAndLeavesOriginalResumeAndMatchIntact() {
        val store=Store(context).apply {newWorkspace()};val word=TailoredResume.word(blocks);val pdf=javaClass.getResourceAsStream("/tailored-resume.pdf")!!.readBytes()
        val original=store.addResume("Original.docx","application/vnd.openxmlformats-officedocument.wordprocessingml.document",word)
        val job=store.save(Job.fresh(true).with("title","Product Manager").with("resume_id",original.id).with("match_strength","82"))
        store.saveTailored(job,"Original - 12345 - tailored","source",word,pdf)
        val files=store.tailored(job.id)!!
        assertEquals(3,store.resumes().size)
        assertArrayEquals(word,store.resumeBytes(original.id))
        assertEquals(82,store.get(true,job.id)!!.score)
        assertEquals(original.id,store.get(true,job.id)!!["resume_id"])
        assertEquals("Original - 12345 - tailored.pdf",files.getJSONObject("pdf").getString("filename"))
        assertThrows(Exception::class.java) {store.saveTailored(job,"Stale","old",word,pdf)}
        assertEquals(3,store.resumes().size)
        assertEquals(files.toString(),Store(context).tailored(job.id).toString())
    }
}
