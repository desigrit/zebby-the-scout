package com.desigrit.zebby

import android.content.Context
import android.net.Uri
import androidx.test.core.app.ApplicationProvider
import com.desigrit.zebby.data.Job
import com.desigrit.zebby.data.Store
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class StartupTest {
    private val context:Context get()=ApplicationProvider.getApplicationContext()

    @Test fun freshInstallDoesNotCreateDatabase() {
        val store=Store(context)
        assertFalse(store.hasDatabase)
        assertFalse(store.file.exists())
        assertTrue(store.workspaces().isEmpty())
        assertEquals("",store.startupError)
        assertFalse(context.getSharedPreferences("workspace",Context.MODE_PRIVATE).contains("file"))
    }

    @Test fun createEntersWorkspaceAndRemembersIt() {
        val store=Store(context)
        store.newWorkspace()
        val job=store.save(Job.fresh(false).with("title","Preserve this application"))
        val reopened=Store(context)
        assertTrue(reopened.hasDatabase)
        assertEquals(store.file,reopened.file)
        assertEquals(job.id,reopened.all(false).single().id)
    }

    @Test fun upgradeReopensLegacyDefaultWithoutSelection() {
        val original=Store(context).apply {newWorkspace();save(Job.fresh(true).with("title","Existing plan"))}
        val legacy=File(original.file.parentFile,"Applications.sqlite").apply {writeBytes(original.exportBytes())}
        context.getSharedPreferences("workspace",Context.MODE_PRIVATE).edit().clear().commit()
        val reopened=Store(context)
        assertTrue(reopened.hasDatabase)
        assertEquals(legacy,reopened.file)
        assertEquals("Existing plan",reopened.all(true).single()["title"])
    }

    @Test fun missingSelectedDatabaseIsNotRecreatedOrReplaced() {
        val prefs=context.getSharedPreferences("workspace",Context.MODE_PRIVATE)
        prefs.edit().putString("file","Missing.sqlite").commit()
        val store=Store(context)
        assertFalse(store.hasDatabase)
        assertFalse(store.file.exists())
        assertTrue(store.startupError.isNotBlank())
        assertEquals("Missing.sqlite",prefs.getString("file",null))
        assertTrue(store.workspaces().isEmpty())
    }

    @Test fun firstImportKeepsSourceAndOpensPrivateCopy() {
        val sourceStore=Store(context).apply {newWorkspace();save(Job.fresh(false).with("title","Original application"))}
        val source=File(context.cacheDir,"Original.sqlite").apply {writeBytes(sourceStore.exportBytes())}
        val bytes=source.readBytes()
        context.getSharedPreferences("workspace",Context.MODE_PRIVATE).edit().clear().commit()
        val fresh=Store(context)
        assertFalse(fresh.hasDatabase)
        fresh.importDatabase(Uri.fromFile(source),source.name)
        assertTrue(fresh.hasDatabase)
        assertNotEquals(source,fresh.file)
        assertArrayEquals(bytes,source.readBytes())
        assertEquals("Original application",fresh.all(false).single()["title"])
    }

    @Test fun invalidImportLeavesFirstRunUnconfiguredAndOriginalIntact() {
        val store=Store(context)
        val source=File(context.cacheDir,"Invalid.sqlite").apply {writeText("Keep this file.")}
        assertThrows(Exception::class.java) {store.importDatabase(Uri.fromFile(source),source.name)}
        assertFalse(store.hasDatabase)
        assertTrue(store.workspaces().isEmpty())
        assertEquals("Keep this file.",source.readText())
    }
}
