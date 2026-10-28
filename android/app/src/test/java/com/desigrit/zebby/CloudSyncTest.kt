package com.desigrit.zebby

import android.content.Context
import android.content.pm.ProviderInfo
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsProvider
import androidx.test.core.app.ApplicationProvider
import com.desigrit.zebby.data.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowContentResolver
import java.io.File

/** SAF test provider: stable document IDs with a simulated cloud file namespace. */
class CloudFixture:DocumentsProvider() {
    data class Entry(val file:File,var name:String)
    val entries=mutableMapOf<String,Entry>()
    var deletes=0
    var failStageRename=false
    override fun onCreate()=true
    override fun queryRoots(projection:Array<out String>?):Cursor=MatrixCursor(arrayOf("root_id","document_id","title","flags")).apply {addRow(arrayOf("root","root","Cloud test",DocumentsContract.Root.FLAG_SUPPORTS_CREATE))}
    private fun cursor()=MatrixCursor(arrayOf("document_id","_display_name","flags","mime_type"))
    private fun flags()=DocumentsContract.Document.FLAG_SUPPORTS_RENAME or DocumentsContract.Document.FLAG_SUPPORTS_WRITE or DocumentsContract.Document.FLAG_DIR_SUPPORTS_CREATE
    override fun queryDocument(id:String,projection:Array<out String>?):Cursor=cursor().apply {val entry=entries[id];addRow(arrayOf(id,entry?.name ?: "root",flags(),if(id=="root") DocumentsContract.Document.MIME_TYPE_DIR else "application/octet-stream"))}
    override fun queryChildDocuments(parent:String,projection:Array<out String>?,sort:String?):Cursor=cursor().apply {entries.forEach { (id,e)->addRow(arrayOf(id,e.name,flags(),"application/octet-stream"))}}
    override fun openDocument(id:String,mode:String,signal:CancellationSignal?):ParcelFileDescriptor=ParcelFileDescriptor.open(entries.getValue(id).file,ParcelFileDescriptor.parseMode(mode))
    override fun createDocument(parent:String,mime:String,name:String):String {val id=id();entries[id]=Entry(File(context!!.cacheDir,id).apply {createNewFile()},name);return id}
    override fun renameDocument(id:String,name:String):String {
        if(failStageRename && entries.getValue(id).name.startsWith("Zebby-pending") && name=="Applications.sqlite") throw java.io.FileNotFoundException("Simulated cloud rename failure")
        require(entries.values.none {it.name==name}) {"Name exists"};entries.getValue(id).name=name;return id
    }
    override fun deleteDocument(id:String) {deletes++;error("The app must never delete a cloud database")}
    override fun isChildDocument(parent:String,document:String)=parent=="root" && document in entries
}
@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35])
class CloudSyncTest {
    private lateinit var context:Context;private lateinit var store:Store;private lateinit var cloud:CloudSync;private lateinit var provider:CloudFixture
    private val tree=DocumentsContract.buildTreeDocumentUri("zebby.cloud.test","root")
    private lateinit var original:CloudFixture.Entry;private lateinit var originalBytes:ByteArray
    @Before fun setup() {
        context=ApplicationProvider.getApplicationContext();store=Store(context);store.newWorkspace();store.save(Job.fresh(false).with("title","Original"));originalBytes=store.exportBytes()
        provider=CloudFixture();provider.attachInfo(context,ProviderInfo().apply {authority="zebby.cloud.test";exported=true;grantUriPermissions=true;readPermission="android.permission.MANAGE_DOCUMENTS";writePermission=readPermission})
        ShadowContentResolver.registerProviderInternal("zebby.cloud.test",provider)
        original=CloudFixture.Entry(File(context.cacheDir,"cloud-original.sqlite").apply {writeBytes(originalBytes)},"Applications.sqlite");provider.entries["original"]=original
        cloud=CloudSync(context,store);cloud.connect(tree,cloud.files(tree).single())
    }
    @Test fun pushRetainsOriginalBytesAndCreatesDesktopReadableReplacement() {
        store.save(store.all(false).single().with("title","Edited on Android"));cloud.push()
        assertEquals(0,provider.deletes);assertArrayEquals(originalBytes,original.file.readBytes());assertTrue(original.name.contains("before-Android"))
        val current=provider.entries.values.single {it.name=="Applications.sqlite"}
        android.database.sqlite.SQLiteDatabase.openDatabase(current.file.path,null,android.database.sqlite.SQLiteDatabase.OPEN_READONLY).use {db ->
            Store.verify(db);db.rawQuery("SELECT title FROM applications",null).use {it.moveToFirst();assertEquals("Edited on Android",it.getString(0))}
        }
        assertFalse(cloud.hasLocalChanges())
    }
    @Test fun changedRemoteStopsBeforeWritingOrRenamingAnything() {
        store.save(store.all(false).single().with("title","Local edit"));original.file.appendText("different remote bytes")
        val remote=original.file.readBytes()
        assertThrows(Exception::class.java) {cloud.push()}
        assertEquals(1,provider.entries.size);assertEquals("Applications.sqlite",original.name);assertArrayEquals(remote,original.file.readBytes());assertEquals(0,provider.deletes)
    }
    @Test fun failedReplacementRestoresOriginalNameAndNeverDeletesIt() {
        store.save(store.all(false).single().with("title","Local edit"));provider.failStageRename=true
        assertThrows(Exception::class.java) {cloud.push()}
        assertTrue(original.file.exists());assertArrayEquals(originalBytes,original.file.readBytes());assertEquals(0,provider.deletes)
        provider.failStageRename=false;cloud.push()
        assertEquals(1,provider.entries.values.count {it.name=="Applications.sqlite"});assertEquals(0,provider.deletes)
    }
    @Test fun pullCannotDiscardUnsyncedLocalEdits() {
        store.save(store.all(false).single().with("notes","Unsynced note"))
        assertThrows(Exception::class.java) {cloud.pull()}
        assertEquals("Unsynced note",store.all(false).single()["notes"]);assertArrayEquals(originalBytes,original.file.readBytes())
    }
}
