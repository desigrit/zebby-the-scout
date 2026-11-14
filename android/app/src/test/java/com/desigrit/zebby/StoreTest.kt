package com.desigrit.zebby

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.desigrit.zebby.data.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class StoreTest {
    private lateinit var context:Context
    private lateinit var store:Store
    @Before fun setup() {context=ApplicationProvider.getApplicationContext();store=Store(context);store.newWorkspace()}
    @Test fun resumeLargerThanCursorWindowRemainsReadable() {
        val bytes=ByteArray(3*1024*1024) { (it%251).toByte() }
        val resume=store.addResume("large.pdf","application/pdf",bytes)
        assertArrayEquals(bytes,store.resumeBytes(resume.id))
    }
    @Test fun blankApplicationIsValidAndSurvivesReopen() {
        val saved=store.save(Job.fresh(false))
        assertEquals(saved.id,Store(context).all(false).single().id)
    }
    @Test fun movingPlanPreservesScoreExplanationResumeAndOriginalPlan() {
        val resume=store.addResume("resume.txt","text/plain","A synthetic candidate resume with enough readable text.".toByteArray())
        val plan=store.save(Job.fresh(true).with("company","Example").with("title","Product Manager").with("listing_url","https://example.com/jobs/1")
            .with("description","Description").with("resume_id",resume.id).with("match_strength","82").with("match_notes","Evidence and a gap.").with("match_analyzed_at",now()).with("overview","Summary"),analysis=true)
        val application=store.moveToApplied(plan)
        assertEquals(82,application.score);assertEquals("Evidence and a gap.",application["match_notes"]);assertEquals(resume.id,application["resume_id"])
        assertEquals("Description",application.description);assertEquals(1,store.all(true).size);assertEquals("Summary",store.get(true,plan.id)!!["overview"])
    }
    @Test fun duplicateUrlsIgnoreTrackingParameters() {
        store.save(Job.fresh(false).with("listing_url","https://example.com/jobs/123/?utm_source=mail"))
        assertNotNull(store.duplicate("https://example.com/jobs/123"))
        assertNull(store.duplicate("https://example.com/jobs/456"))
    }
    @Test fun sourceChangeClearsScoreButStatusAndNotesDoNot() {
        val job=store.save(Job.fresh(false).with("match_strength","91").with("match_notes","Why"),analysis=true)
        assertEquals(91,store.save(job.with("status","Heard back").with("notes","Notes")).score)
        assertNull(store.save(job.with("title","Different role")).score)
    }
    @Test fun staleResultCannotReplaceNewerSources() {
        val plan=store.save(Job.fresh(true).with("description","Original"))
        store.save(plan.with("description","Edited"))
        assertThrows(IllegalArgumentException::class.java) {store.save(plan.with("match_strength","100"),plan.source(),true)}
        assertEquals("Edited",store.get(true,plan.id)!!.description)
    }
    @Test fun importAndEditsNeverWriteToOriginalFileAndKeepResumeBytes() {
        val bytes=ByteArray(1024){(it%200).toByte()};val resume=store.addResume("resume.pdf","application/pdf",bytes)
        store.save(Job.fresh(false).with("resume_id",resume.id).with("notes","Do not lose these notes"))
        val original=File(context.cacheDir,"original.sqlite").apply {writeBytes(store.exportBytes())};val before=original.readBytes()
        store.importDatabase(Uri.fromFile(original),original.name)
        store.save(store.all(false).single().with("title","Changed on phone"))
        assertArrayEquals(before,original.readBytes());assertArrayEquals(bytes,store.resumeBytes(resume.id));assertTrue(original.exists())
        assertEquals("Do not lose these notes",store.all(false).single()["notes"])
    }
    @Test fun badImportPreservesBothFilesAndCurrentWorkspace() {
        val existing=store.save(Job.fresh(false).with("title","Keep me"));val current=store.file
        val invalid=File(context.cacheDir,"invalid.sqlite").apply {writeText("not sqlite")}
        assertThrows(Exception::class.java) {store.importDatabase(Uri.fromFile(invalid),"invalid.sqlite")}
        assertEquals("not sqlite",invalid.readText());assertEquals(current,store.file);assertNotNull(store.get(false,existing.id))
    }
    @Test fun creatingDatabaseRetainsPreviousPrivateWorkspace() {
        val previous=store.file;store.save(Job.fresh(true));store.newWorkspace()
        assertTrue(previous.exists());assertTrue(store.all(true).isEmpty());store.selectWorkspace(previous.name);assertEquals(1,store.all(true).size)
    }
}
