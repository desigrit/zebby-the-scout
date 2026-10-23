package com.desigrit.zebby

import android.graphics.Bitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.desigrit.zebby.data.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.time.LocalDate

@RunWith(AndroidJUnit4::class)
class SmokeTest {
    @get:Rule val rule=createAndroidComposeRule<MainActivity>()
    private fun app()=InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as ZebbyApplication
    private fun capture(name:String) {
        rule.waitForIdle()
        InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        android.os.SystemClock.sleep(600) // Allow the emulator compositor to present the settled frame.
        val dir=File(app().filesDir,"screenshots").apply {mkdirs()}
        InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot().compress(Bitmap.CompressFormat.PNG,100,File(dir,"$name.png").outputStream())
    }
    private fun seed() {
        val store=app().store;store.newWorkspace()
        val resume=store.addResume("Alex Morgan - Product.txt","text/plain","Product leader with eight years of experience in product discovery, strategy and experiments. Led cross-functional teams, launched an onboarding program and improved activation by 18%.".toByteArray())
        val description="""About the role

Help people turn a first visit into a lasting habit. You will lead discovery and experimentation for our growing product.

What you will do
• Shape product strategy through customer research.
• Partner with design, engineering and data.
• Define success measures and run thoughtful experiments.

What you bring
• Experience leading cross-functional teams.
• A clear approach to prioritization and communication.
• Evidence of shipping products that improve customer outcomes."""
        for(i in 0..35) {
            val company=listOf("Fieldwork","Orbit","Juniper","Mosaic","Northstar Labs")[i%5]
            store.save(Job.fresh(false).with("company",company).with("title",listOf("Senior Product Manager","Product Manager, AI","Group Product Manager")[i%3])
                .with("team","Growth").with("locations",if(i%2==0) "Seattle, WA; Remote" else "New York, NY")
                .with("applied_date",LocalDate.now().minusDays((i*i%30).toLong()).toString()).with("status",JobStatus.entries[i%5].label)
                .with("match_strength",(78+i%18).toString()).with("match_notes","Your resume shows strong discovery and experimentation experience. More direct evidence of enterprise billing would strengthen the fit.")
                .with("job_description",description).with("resume_id",resume.id).with("listing_url","https://example.com/jobs/$i").with("notes",if(i==0) "Ask about the team's first six months and how they measure activation." else ""),analysis=true)
        }
        val plan=Job.fresh(true).with("title","Senior Product Manager").with("company","Fieldwork").with("team","Growth").with("locations","Seattle, WA; Remote")
            .with("listing_url","https://example.com/jobs/plan").with("description",description).with("resume_id",resume.id)
            .with("current_overview","Product leader who brings people together to build useful products. I turn customer insight into clear priorities and measurable outcomes.")
        store.save(AnalysisResult(86,"Strong product discovery and cross-functional leadership. Add evidence of scaled experimentation to support the role's growth focus.",
            listOf("Product strategy","Customer discovery","Experimentation","Growth","Product analytics","Roadmap prioritization").mapIndexed {i,t->Recommendation(t,96-i*3)},
            listOf("Turn customer insight into product strategy","Lead experiments and measure outcomes","Partner with design, engineering and data","Prioritize customer value","Communicate decisions clearly").mapIndexed {i,t->Recommendation(t,96-i*4)},
            "Product leader who brings people together to build useful products. I turn customer insight into focused experiments, clear priorities and measurable growth.",
            "A light revision emphasizes experiments and growth while keeping your direct, collaborative voice.").apply(plan),analysis=true)
        app().preferences.provider="ollama"
        app().preferences.put("server","http://192.168.1.20:11434")
        app().preferences.put("server-models","[\"qwen3:8b\"]")
        app().preferences.put("server-thinking","[\"off\",\"on\"]")
        app().preferences.setModel("qwen3:8b");app().preferences.setThinking("on")
        app().preferences.provider="openai"
        rule.activityRule.scenario.recreate()
        rule.waitUntil(10000) {rule.onAllNodesWithText("Fieldwork").fetchSemanticsNodes().isNotEmpty()}
    }
    @Test fun screensAndRecordFlow() {
        seed();capture("phone-plan-list")
        rule.onNodeWithText("Senior Product Manager").performClick();capture("phone-plan-results")
        rule.onNodeWithText("Job & resume").performClick();capture("phone-plan-inputs")
        rule.onNodeWithContentDescription("Back").performClick()
        rule.onNodeWithText("Applications").performClick();capture("phone-applications")
        rule.onAllNodesWithText("Senior Product Manager").onFirst().performClick();capture("phone-application-detail")
        rule.onNodeWithContentDescription("Why this score").assertDoesNotExist()
        rule.onNodeWithText("Why this score").assertExists()
        rule.onNodeWithContentDescription("Close application").performClick()
        rule.onNodeWithText("Settings").performClick();capture("phone-settings")
        rule.onNodeWithText("OpenAI API key").performClick();rule.onNodeWithText("Local server").performClick();capture("phone-settings-server")
        rule.onNodeWithText("Local server").performClick();rule.onNodeWithText("Zebby credits").performClick()
        rule.onNodeWithText("Restore credits").performScrollTo().performClick()
        rule.onNodeWithText("Code").performTextInput("invalid-synthetic-code")
        rule.onNodeWithText("Connect",useUnmergedTree=true).performClick()
        rule.onNodeWithText("Check the code and try again.").assertIsDisplayed()
        rule.onNodeWithText("invalid-synthetic-code").assertExists()
        capture("phone-restore-error")
        rule.onNodeWithText("Cancel").performClick()
        rule.onNodeWithText("Buy Zebby credits").performScrollTo().performClick();capture("phone-credits")
        rule.onAllNodes(isSelectable() and isSelected()).assertAny(hasText("$5") or hasAnyDescendant(hasText("$5")))
    }
    @Test fun analysisContinuesAcrossNavigationAndSavesItsResult() {
        seed()
        val server=java.net.ServerSocket(0)
        val received=java.util.concurrent.CountDownLatch(1);val release=java.util.concurrent.CountDownLatch(1)
        val thread=Thread {
            server.accept().use {socket ->
                socket.soTimeout=15000
                val input=socket.getInputStream().buffered();val header=StringBuilder()
                while(!header.endsWith("\r\n\r\n")) {val b=input.read();if(b<0) error("Incomplete request");header.append(b.toChar())}
                val length=header.lines().firstOrNull {it.startsWith("Content-Length:",true)}?.substringAfter(':')?.trim()?.toInt() ?: 0
                val body=ByteArray(length);var read=0;while(read<length) {val n=input.read(body,read,length-read);if(n<0) break;read+=n}
                val output=socket.getOutputStream()
                output.write("HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nConnection: close\r\n\r\n".toByteArray())
                output.write("{\"message\":{\"thinking\":\"Test only\"},\"done\":false}\n".toByteArray());output.flush();received.countDown()
                release.await(20,java.util.concurrent.TimeUnit.SECONDS)
                val chunk=org.json.JSONObject().put("done",true).put("message",org.json.JSONObject().put("content",org.json.JSONObject().put("score",73).put("explanation","Synthetic result: discovery evidence is strong; add billing examples.").toString()))
                output.write((chunk.toString()+"\n").toByteArray());output.flush()
            }
        }.apply {isDaemon=true;start()}
        try {
            app().preferences.provider="ollama";app().preferences.put("server","http://127.0.0.1:${server.localPort}");app().preferences.setModel("fixture-model")
            rule.onNodeWithText("Applications").performClick()
            rule.onAllNodesWithText("Senior Product Manager").onFirst().performClick()
            rule.onNodeWithContentDescription("Analyze match").performClick()
            rule.waitUntil(15000) {received.count==0L}
            rule.onNodeWithText("Settings").performClick()
            rule.onNodeWithText("Analysis").assertExists()
            org.junit.Assert.assertFalse(app().store.all(false).any {it.score==73})
            release.countDown()
            rule.waitUntil(15000) {app().store.all(false).any {it.score==73}}
        } finally {release.countDown();server.close();thread.join(2000)}
    }
    @Test fun optionalApplicationCanBeSaved() {
        app().store.newWorkspace();rule.activityRule.scenario.recreate()
        rule.onNodeWithText("Applications").performClick()
        rule.waitUntil(10000) {rule.onAllNodesWithText("Add an application").fetchSemanticsNodes().isNotEmpty()}
        rule.onNodeWithText("Add an application").performClick()
        rule.onNodeWithText("Save",useUnmergedTree=true).performClick()
        rule.waitUntil(5000) {app().store.all(false).isNotEmpty()}
        org.junit.Assert.assertEquals("",app().store.all(false).single()["resume_id"])
    }
}
