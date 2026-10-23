package com.desigrit.zebby

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.*
import com.desigrit.zebby.data.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

data class UiState(val plans:List<Job> = emptyList(),val applications:List<Job> = emptyList(),val resumes:List<Resume> = emptyList(),val recents:List<String> = emptyList(),
    val loading:Boolean=true,val busy:Boolean=false,val error:String="",val runs:List<WorkInfo> = emptyList(),val version:Int=0)
class ZebbyViewModel(application:Application):AndroidViewModel(application) {
    val app=application as ZebbyApplication
    private val _state=MutableStateFlow(UiState());val state=_state.asStateFlow()
    val notices=MutableSharedFlow<String>(extraBufferCapacity=4)
    private val work=WorkManager.getInstance(app)
    init {
        reload()
        viewModelScope.launch { work.getWorkInfosByTagFlow("analysis").collect { values ->
            _state.update { it.copy(runs=values) };reload()
        } }
    }
    fun action(saved:Boolean=false, block:suspend ()->Unit) {
        viewModelScope.launch {
            _state.update { it.copy(busy=true,error="") }
            try { withContext(Dispatchers.IO) { block() };if(saved) notices.emit("Saved") }
            catch(e:kotlinx.coroutines.CancellationException) {throw e}
            catch(e:Exception) { app.log("ui.operation.failed",e);_state.update { it.copy(error=e.message ?: "This action could not be completed.") } }
            finally { _state.update { it.copy(busy=false) };reload() }
        }
    }
    fun reload() { viewModelScope.launch {
        try { val data=withContext(Dispatchers.IO) { Triple(app.store.all(true),app.store.all(false),app.store.resumes()) };val recents=withContext(Dispatchers.IO) { app.store.recents() }
            _state.update { it.copy(plans=data.first,applications=data.second,resumes=data.third,recents=recents,loading=false,version=it.version+1) }
        } catch(e:Exception) { app.log("database.open.failed",e);_state.update { it.copy(loading=false,error=e.message ?: "Could not open this database.") } }
    } }
    fun clearError() { _state.update { it.copy(error="") } }
    fun active(job:Job):WorkInfo? = state.value.runs.firstOrNull { "record:${job.id}" in it.tags && !it.state.isFinished }
    fun latest(job:Job):WorkInfo? = state.value.runs.filter { "record:${job.id}" in it.tags }.maxByOrNull { info -> info.tags.firstOrNull { it.startsWith("created:") }?.substringAfter(':')?.toLongOrNull() ?: 0L }
    fun paidPending(job:Job)=app.credits.pending("${app.store.file.name}:${if(job.plan) "plan" else "match"}:${job.id}")
    fun anyActive()=state.value.runs.any { !it.state.isFinished }
    fun ensureIdle() { require(!anyActive()) { "Wait for analysis to finish, or cancel it, before switching or syncing databases." } }
    fun save(job:Job,done:(Job)->Unit={})=action(true) {
        require(active(job)==null) { "This job is being analyzed. Cancel analysis to edit it." }
        val previous=app.store.get(job.plan,job.id)
        require(!paidPending(job) || previous?.source()==job.source()) {"Recover the pending paid analysis before changing this job's source."}
        val saved=app.store.save(job);withContext(Dispatchers.Main) { done(saved) }
        if(app.preferences.provider!="credits" && previous==null && !job.plan && saved.score==null && saved.description.length>=80 && saved["resume_id"].isNotBlank()) withContext(Dispatchers.Main) {analyze(saved,done)}
    }
    fun analyze(job:Job,done:(Job)->Unit={})=action {
        require(!paidPending(job) || app.store.get(job.plan,job.id)?.source()==job.source()) {"Recover the pending paid analysis before changing this job's source."}
        val saved=app.store.save(job)
        require(saved.description.length >= (if(job.plan) 100 else 80) && saved["resume_id"].isNotBlank()) { "Add a job description and a resume to analyze." }
        require(!saved.plan || saved["listing_url"].isNotBlank()) { "Add a job link before analyzing." }
        val settings=app.preferences;val model=settings.model();val catalog=app.contracts.models.firstOrNull { it.id==model }
        require(model.isNotBlank()) { "Choose a model in Settings." }
        val request=OneTimeWorkRequestBuilder<AnalysisWorker>().addTag("analysis").addTag("record:${job.id}").addTag("created:${System.currentTimeMillis()}").setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build()
        app.vault.put("run:${request.id}",JSONObject().put("plan",job.plan).put("record",job.id).put("workspace",app.store.file.name).put("source",saved.source())
            .put("provider",settings.provider).put("model",model).put("thinking",settings.thinking(catalog)).put("server",settings["server"]).toString())
        work.enqueueUniqueWork("analysis:${app.store.file.name}:${job.id}",ExistingWorkPolicy.KEEP,request)
        withContext(Dispatchers.Main) { done(saved) }
    }
    fun cancel(job:Job) { active(job)?.let { work.cancelWorkById(it.id) } }
    fun fill(job:Job,done:(Job)->Unit)=action { val filled=app.listing.fill(job);withContext(Dispatchers.Main) { done(filled) } }
    fun move(job:Job,done:(Job)->Unit)=action(true) { require(active(job)==null);val next=app.store.moveToApplied(job);withContext(Dispatchers.Main) { done(next) } }
    fun delete(job:Job,done:()->Unit)=action { require(active(job)==null);require(!paidPending(job)) {"Recover the pending paid analysis before deleting this job."};app.store.delete(job);withContext(Dispatchers.Main) { done() } }
    fun importResume(uri:Uri,done:(Resume)->Unit)=action {
        val name=fileName(uri);val mime=app.contentResolver.getType(uri).orEmpty()
        require(name.substringAfterLast('.').lowercase() in listOf("pdf","docx","txt")) { "Choose a PDF, DOCX or text resume." }
        val bytes=app.contentResolver.openInputStream(uri).use { requireNotNull(it);it.readBounded(10*1024*1024+1) }
        val resume=app.store.addResume(name,mime,bytes);withContext(Dispatchers.Main) { done(resume) }
    }
    fun fileName(uri:Uri):String=app.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use { if(it.moveToFirst()) it.getString(0) else null } ?: "Resume"
    fun importDatabase(uri:Uri)=action { ensureIdle();app.store.importDatabase(uri,fileName(uri)) }
    fun exportDatabase(uri:Uri)=action { ensureIdle();app.contentResolver.openOutputStream(uri,"w").use { requireNotNull(it);app.store.exportTo(it) };notices.emit("Database exported") }
    fun refreshCredits()=action { app.credits.checkoutStatus();app.credits.refresh() }
    fun exportLogs(uri:Uri)=action { val logs=File(app.filesDir,"logs").listFiles().orEmpty().filter { it.extension=="log" }.joinToString("\n") { it.readText() }
        app.contentResolver.openOutputStream(uri,"w").use { requireNotNull(it);it.write(logs.toByteArray()) } }
}
