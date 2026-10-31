package com.desigrit.zebby

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.desigrit.zebby.network.ResumeBlock
import com.desigrit.zebby.network.TailoredResume
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class TailoredResumeDeviceTest {
    @Test fun nativePdfRetainsAllParagraphsAcrossPages() {
        val blocks=listOf(ResumeBlock(0,"Alex Morgan","name",false),ResumeBlock(1,"alex@example.com | Seattle, WA","contact",false),ResumeBlock(2,"Experience","heading",false))+
            (3..45).map {ResumeBlock(it,"Project $it: Led customer research and partnered with engineering to improve activation by 18%.","bullet",true)}
        val pdf=TailoredResume.pdf(blocks)
        assertEquals("%PDF-",String(pdf.take(5).toByteArray()))
        val parsed=TailoredResume.blocks(ApplicationProvider.getApplicationContext(),"Resume.pdf",pdf).joinToString("\n") {it.text}
        for(block in blocks) assertTrue(block.text,parsed.contains(block.text))
    }
}
