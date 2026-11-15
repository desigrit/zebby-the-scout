package com.desigrit.zebby.data

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import com.desigrit.zebby.network.sha256
import java.io.File
import org.json.JSONObject

data class CloudDocument(val uri:Uri,val name:String,val flags:Int)

/** A provider must support sibling creation and rename. The original is retained as a dated backup. */
class CloudSync(private val context:Context,private val store:Store) {
    private val p=context.getSharedPreferences("cloud",Context.MODE_PRIVATE)
    private val resolver=context.contentResolver
    private fun key(name:String)="${store.file.name}:$name"
    val connected get() = p.getString(key("tree"),null)!=null
    val lastSync get() = p.getString(key("time"),"").orEmpty()
    fun files(tree:Uri):List<CloudDocument> {
        val children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree))
        return resolver.query(children,arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_FLAGS),android.os.Bundle.EMPTY,null)?.use { c -> buildList {
            while(c.moveToNext()) add(CloudDocument(DocumentsContract.buildDocumentUriUsingTree(tree,c.getString(0)),c.getString(1),c.getInt(2)))
        } }.orEmpty()
    }
    fun connect(tree:Uri,document:CloudDocument) {
        require(document.flags and DocumentsContract.Document.FLAG_SUPPORTS_RENAME != 0) { "This cloud provider cannot safely replace a database. Use Import and Export copy instead." }
        val originalHash=hash(document.uri)
        store.importDatabase(document.uri,document.name)
        val hash=store.fingerprint()
        check(p.edit().putString(key("tree"),tree.toString()).putString(key("uri"),document.uri.toString()).putString(key("name"),document.name)
            .putString(key("remote"),originalHash).putString(key("local"),hash).putString(key("time"),now()).commit())
    }
    private fun hash(uri:Uri):String=resolver.openInputStream(uri).use {requireNotNull(it) {"Could not read the cloud database."};it.sha256Bounded()}
    fun hasLocalChanges()=store.fingerprint()!=p.getString(key("local"),"")
    /** Pull creates a new private workspace and retains the preceding local file. */
    fun pull() {
        require(!hasLocalChanges()) { "This phone has unsynced changes. Export a copy before loading the cloud version." }
        recover()
        val tree=Uri.parse(p.getString(key("tree"),null) ?: error("Connect a cloud folder first."))
        val name=p.getString(key("name"),"")!!;val document=files(tree).firstOrNull { it.name==name } ?: error("The cloud database could not be found. Your local copy is unchanged.")
        connect(tree,document)
    }
    fun push()=store.exclusive {
        recover()
        val tree=Uri.parse(p.getString(key("tree"),null) ?: error("Connect a cloud folder first."));val name=p.getString(key("name"),"")!!
        val current=files(tree).firstOrNull { it.name==name } ?: error("The cloud database could not be found. Reconnect the folder.")
        val remote=hash(current.uri);require(remote==p.getString(key("remote"),"")) { "The database changed on another device. Export this phone's copy before loading that version. Nothing was overwritten." }
        val localHash=store.fingerprint();if(localHash==p.getString(key("local"),"")) return@exclusive
        val root=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree))
        val stageName="Zebby-pending-${System.currentTimeMillis()}.sqlite"
        val staged=DocumentsContract.createDocument(resolver,root,"application/octet-stream",stageName)
            ?: error("This provider cannot create a safe staging file. Export a copy instead.")
        resolver.openOutputStream(staged,"w").use { requireNotNull(it) { "Could not write the staging file." };store.exportTo(it) }
        require(hash(staged)==localHash) { "The uploaded copy could not be verified. The original database was not changed." }
        // Recheck after uploading, because another device may have saved meanwhile.
        require(hash(current.uri)==remote) { "The cloud database changed during sync. The original was not overwritten." }
        val backupName="${name.removeSuffix(".sqlite")}-before-Android-${System.currentTimeMillis()}.sqlite"
        val pending=JSONObject().put("original",current.uri.toString()).put("staged",staged.toString()).put("backupName",backupName).put("hash",localHash)
        check(p.edit().putString(key("pending"),pending.toString()).commit())
        val backup=DocumentsContract.renameDocument(resolver,current.uri,backupName) ?: error("The provider could not retain the previous database. Sync stopped.")
        pending.put("backup",backup.toString());check(p.edit().putString(key("pending"),pending.toString()).commit())
        val committed=runCatching { DocumentsContract.renameDocument(resolver,staged,name) }.getOrNull()
        if(committed==null) { runCatching { DocumentsContract.renameDocument(resolver,backup,name) };error("Sync could not finish. The previous database is retained in the cloud folder; reconnect it before continuing.") }
        require(hash(committed)==localHash) { "The new cloud file could not be verified. The previous database is retained as $backupName." }
        finish(committed,localHash)
    }
    private fun finish(uri:Uri,hash:String) { check(p.edit().putString(key("uri"),uri.toString()).putString(key("remote"),hash).putString(key("local"),hash).putString(key("time"),now()).remove(key("pending")).commit()) }
    private fun recover() {
        val raw=p.getString(key("pending"),null) ?: return;val pending=JSONObject(raw)
        val tree=Uri.parse(p.getString(key("tree"),null)!!);val name=p.getString(key("name"),"")!!;val documents=files(tree)
        val current=documents.firstOrNull { it.name==name }
        if(current!=null) {
            val hash=hash(current.uri)
            if(hash==pending.getString("hash")) { finish(current.uri,hash);return }
            require(hash==p.getString(key("remote"),"")) { "A previous sync was interrupted and the cloud file changed. Export your local copy and reconnect the database." }
        } else {
            val backup=documents.firstOrNull { it.name==pending.getString("backupName") } ?: error("An interrupted sync needs recovery. Open the cloud folder and reconnect the retained database.")
            require(DocumentsContract.renameDocument(resolver,backup.uri,name)!=null) { "The previous database is retained as ${backup.name}. Reconnect it in Settings." }
        }
        check(p.edit().remove(key("pending")).commit())
    }
}
