package com.desigrit.zebby.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import java.io.File
import java.io.InputStream

class Store(private val context: Context) {
    private val preferences = context.getSharedPreferences("workspace", Context.MODE_PRIVATE)
    private val folder = File(context.filesDir, "workspaces").apply { mkdirs() }
    var file: File = File(folder, preferences.getString("file", "Applications.sqlite")!!); private set
    private var startupError = ""
    private var connection:SQLiteDatabase? = try { open(file) } catch(e:Exception) { startupError=e.message ?: "The database could not be opened.";null }
    private val db:SQLiteDatabase get() = connection ?: error(startupError)
    val name: String get() = preferences.getString("name", file.name)!!

    private fun open(path: File): SQLiteDatabase {
        val exists = path.exists()
        val db = SQLiteDatabase.openDatabase(path.path, null, SQLiteDatabase.CREATE_IF_NECESSARY, preserveCorruptFile)
        try {
            db.rawQuery("PRAGMA journal_mode=DELETE",null).use { it.moveToFirst() }
            db.setForeignKeyConstraintsEnabled(true)
            if (!exists) { createSchema(db); db.version = 10 }
            verify(db)
            return db
        } catch (e: Exception) { db.close(); throw e }
    }
    @Synchronized fun all(plan: Boolean): List<Job> = db.rawQuery("SELECT * FROM ${table(plan)} ORDER BY ${if (plan) "updated_at" else "applied_date"} DESC, created_at DESC", null).use { c -> buildList { while (c.moveToNext()) add(row(c, plan)) } }
    @Synchronized fun get(plan: Boolean, id: String): Job? = db.rawQuery("SELECT * FROM ${table(plan)} WHERE id=?", arrayOf(id)).use { if (it.moveToFirst()) row(it, plan) else null }
    @Synchronized fun save(job: Job, expectedSource: String? = null, analysis: Boolean = false): Job {
        db.beginTransaction()
        try {
            val previous = get(job.plan, job.id)
            if (expectedSource != null) require(previous?.source() == expectedSource) { "This job changed during analysis. The newer version was kept." }
            var next = job.with("updated_at", now())
            if (!analysis && previous != null && previous.source() != job.source()) {
                next = next.with("match_strength", "").with("match_notes", "").with("match_analyzed_at", "")
                val jobChanged = listOf("listing_url", "company", "title", "team", "locations", job.descriptionKey).any { previous[it] != job[it] }
                if (jobChanged && job.plan) next = next.with("keyword_importance_json", "[]").with("theme_importance_json", "[]")
            }
            val known = columns(db, table(job.plan))
            val values = ContentValues().apply { next.fields.filterKeys { it in known }.forEach { (k, v) ->
                if ((k == "match_strength" || k == "resume_id") && v.isBlank()) putNull(k) else put(k, v)
            } }
            if (previous != null) db.update(table(job.plan), values, "id=?", arrayOf(job.id))
            else {
                for (column in listOf("company", "title", "listing_url")) if (!values.containsKey(column)) values.put(column, "")
                if (!values.containsKey("created_at")) values.put("created_at", now())
                db.insertOrThrow(table(job.plan), null, values)
            }
            if (job.plan) db.execSQL("INSERT OR REPLACE INTO workspace_preferences(key,value) VALUES('last_current_overview', ?)", arrayOf(job["current_overview"]))
            db.setTransactionSuccessful(); return next
        } finally { db.endTransaction() }
    }
    @Synchronized fun delete(job: Job) { db.delete(table(job.plan), "id=?", arrayOf(job.id)) }
    @Synchronized fun duplicate(url: String, excluding: String = ""): Job? = if (url.isBlank()) null else all(false).firstOrNull { it.id != excluding && canonicalUrl(it["listing_url"]) == canonicalUrl(url) }
    @Synchronized fun moveToApplied(plan: Job): Job {
        require(plan.plan)
        val duplicate = duplicate(plan["listing_url"])
        require(duplicate == null) { "This listing is already in Applications." }
        db.beginTransaction()
        try {
            val saved = save(plan)
            val common = listOf("company", "title", "team", "locations", "listing_url", "resume_id", "match_strength", "match_notes", "match_analyzed_at", "snapshot_text", "snapshot_captured_at", "snapshot_source")
            val application = Job.fresh(false).copy(fields = Job.fresh(false).fields + common.associateWith { saved[it] })
                .with("job_description", saved.description)
            val next = save(application, analysis = true)
            db.setTransactionSuccessful(); return next
        } finally { db.endTransaction() }
    }
    @Synchronized fun lastSummary(): String = db.rawQuery("SELECT value FROM workspace_preferences WHERE key='last_current_overview'", null).use { if (it.moveToFirst()) it.getString(0) else "" }
    @Synchronized fun recents(): List<String> = (all(true) + all(false)).sortedByDescending { it["updated_at"] }.flatMap { locations(it["locations"]) }.distinctBy(String::lowercase).take(40)
    @Synchronized fun resumes(): List<Resume> = db.rawQuery("SELECT id,filename,size,content_type FROM resumes ORDER BY created_at DESC", null).use { c -> buildList { while(c.moveToNext()) add(Resume(c.getString(0),c.getString(1),c.getLong(2),c.getString(3))) } }
    @Synchronized fun resumeBytes(id: String): ByteArray {
        val size=db.rawQuery("SELECT length(file_data) FROM resumes WHERE id=?",arrayOf(id)).use {require(it.moveToFirst()) {"Choose a resume."};it.getInt(0)}
        require(size in 1..10*1024*1024) {"Choose a resume up to 10 MB."}
        val bytes=java.io.ByteArrayOutputStream(size)
        // CursorWindow cannot hold a large resume BLOB in one row on many devices.
        var offset=1
        while(offset<=size) {
            val chunk=db.rawQuery("SELECT substr(file_data,?,524288) FROM resumes WHERE id=?",arrayOf(offset.toString(),id)).use {require(it.moveToFirst());it.getBlob(0)}
            require(chunk.isNotEmpty());bytes.write(chunk);offset+=chunk.size
        }
        return bytes.toByteArray()
    }
    @Synchronized fun addResume(name: String, mime: String, bytes: ByteArray): Resume {
        require(bytes.isNotEmpty() && bytes.size <= 10 * 1024 * 1024) { "Choose a resume up to 10 MB." }
        val resume = Resume(id(), name, bytes.size.toLong(), mime)
        db.insertOrThrow("resumes", null, ContentValues().apply { put("id",resume.id);put("filename",name);put("content_type",mime);put("size",bytes.size);put("file_data",bytes);put("created_at",now()) })
        return resume
    }
    @Synchronized fun exportTo(output:java.io.OutputStream) {require(!db.inTransaction());file.inputStream().use {it.copyTo(output,65536)};output.flush()}
    @Synchronized fun fingerprint():String {require(!db.inTransaction());return file.inputStream().use {it.sha256Bounded()}}
    @Synchronized fun exportBytes(): ByteArray { require(!db.inTransaction()); return file.readBytes() }
    @Synchronized fun <T> exclusive(block: () -> T): T = block()
    @Synchronized fun newWorkspace() { val next = File(folder, "Applications-${System.currentTimeMillis()}.sqlite"); val connection = open(next); switch(next, connection, "Applications.sqlite") }
    /** Only reads the selected URI. No delete, rename, overwrite, or write permission is requested. */
    @Synchronized fun importDatabase(uri: Uri, displayName: String) {
        val next = File(folder, "Imported-${System.currentTimeMillis()}.sqlite")
        try {
            context.contentResolver.openInputStream(uri).use { input -> requireNotNull(input) { "Could not read this file." }; next.outputStream().use { output ->
                val buffer = ByteArray(65536); var total = 0L
                while (true) { val n = input.read(buffer); if(n < 0) break; total += n; require(total <= 512L * 1024 * 1024) { "This database is larger than 512 MB." }; output.write(buffer,0,n) }
            } }
            // Validate the private copy read-only before opening it for writes.
            SQLiteDatabase.openDatabase(next.path, null, SQLiteDatabase.OPEN_READONLY, preserveCorruptFile).use { verify(it) }
            val connection = open(next); switch(next, connection, displayName)
        } catch (e: Exception) { next.delete(); throw e }
    }
    private fun switch(next: File, connection: SQLiteDatabase, name: String) {
        require(preferences.edit().putString("file", next.name).putString("name", name).commit()) { "Could not save the database selection." }
        this.connection?.close(); this.connection = connection; file = next;startupError=""
    }
    @Synchronized fun workspaces(): List<File> = folder.listFiles()?.filter { it.extension == "sqlite" }?.sortedByDescending { it.lastModified() }.orEmpty()
    @Synchronized fun selectWorkspace(name: String) { val next = workspaces().firstOrNull { it.name == name } ?: error("Database not found."); val connection = open(next); switch(next,connection,next.name) }
    companion object {
        // Android's default handler deletes corrupt databases. Retain the file for recovery instead.
        private val preserveCorruptFile=android.database.DatabaseErrorHandler {throw android.database.sqlite.SQLiteException("This database could not be read. Its file has been retained for recovery.")}
        fun table(plan: Boolean) = if(plan) "plans" else "applications"
        private fun row(c: Cursor, plan: Boolean) = Job(plan, c.columnNames.associateWith { name -> val i=c.getColumnIndexOrThrow(name); if(c.isNull(i)) "" else c.getString(i) })
        fun columns(db: SQLiteDatabase, table: String): Set<String> = db.rawQuery("PRAGMA table_info($table)", null).use { c -> buildSet { while(c.moveToNext()) add(c.getString(1)) } }
        fun verify(db: SQLiteDatabase) {
            require(db.version == 10) { "Open this database in the latest desktop Zebby first. Android supports database version 10." }
            db.rawQuery("PRAGMA quick_check",null).use { require(it.moveToFirst() && it.getString(0) == "ok") { "The database did not pass its integrity check. Your original file was not changed." } }
            for(table in listOf("applications","plans","resumes","workspace_preferences")) require(columns(db,table).isNotEmpty()) { "This is not a Zebby database." }
            require(columns(db,"applications").containsAll(listOf("id","company","title","job_description","notes","match_strength","resume_id","status","applied_date","updated_at"))) { "The Applications schema is incomplete." }
            require(columns(db,"plans").containsAll(listOf("id","description","overview_rationale","keyword_importance_json","theme_importance_json","match_notes","current_overview","resume_id"))) { "The Plan schema is incomplete." }
        }
        fun createSchema(db: SQLiteDatabase) {
            db.execSQL("CREATE TABLE resumes (id TEXT PRIMARY KEY, filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, file_data BLOB NOT NULL, created_at TEXT NOT NULL)")
            db.execSQL("""CREATE TABLE applications (id TEXT PRIMARY KEY, company TEXT NOT NULL, title TEXT NOT NULL,
                team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '', listing_url TEXT NOT NULL DEFAULT '', job_description TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '', snapshot_text TEXT NOT NULL DEFAULT '', snapshot_captured_at TEXT NOT NULL DEFAULT '', snapshot_source TEXT NOT NULL DEFAULT '',
                applied_date TEXT NOT NULL DEFAULT '', match_strength INTEGER CHECK(match_strength BETWEEN 0 AND 100), match_notes TEXT NOT NULL DEFAULT '', match_analyzed_at TEXT NOT NULL DEFAULT '',
                resume_id TEXT REFERENCES resumes(id), status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
            db.execSQL("""CREATE TABLE plans (id TEXT PRIMARY KEY, listing_url TEXT NOT NULL, company TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '',
                team TEXT NOT NULL DEFAULT '', locations TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', snapshot_text TEXT NOT NULL DEFAULT '', snapshot_captured_at TEXT NOT NULL DEFAULT '', snapshot_source TEXT NOT NULL DEFAULT '',
                current_overview TEXT NOT NULL DEFAULT '', resume_id TEXT REFERENCES resumes(id), keywords_json TEXT NOT NULL DEFAULT '[]', themes_json TEXT NOT NULL DEFAULT '[]',
                keyword_importance_json TEXT NOT NULL DEFAULT '[]', theme_importance_json TEXT NOT NULL DEFAULT '[]', overview TEXT NOT NULL DEFAULT '', overview_rationale TEXT NOT NULL DEFAULT '',
                match_strength INTEGER CHECK(match_strength BETWEEN 0 AND 100), match_notes TEXT NOT NULL DEFAULT '', match_analyzed_at TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
            db.execSQL("CREATE INDEX applications_date_idx ON applications(applied_date DESC,created_at DESC)")
            db.execSQL("CREATE INDEX plans_updated_idx ON plans(updated_at DESC)")
            db.execSQL("CREATE TABLE workspace_preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
        }
    }
}
