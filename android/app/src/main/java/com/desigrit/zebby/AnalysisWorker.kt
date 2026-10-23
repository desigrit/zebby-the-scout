package com.desigrit.zebby

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.*
import com.desigrit.zebby.data.*
import com.desigrit.zebby.network.ResumeReader
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import org.json.JSONObject
import kotlin.coroutines.coroutineContext

class AnalysisWorker(context:Context,params:WorkerParameters):CoroutineWorker(context,params) {
    private val app=context.applicationContext as ZebbyApplication
    override suspend fun getForegroundInfo():ForegroundInfo {
        val manager=applicationContext.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("analysis","Job analysis",NotificationManager.IMPORTANCE_LOW))
        val notification=NotificationCompat.Builder(applicationContext,"analysis").setSmallIcon(android.R.drawable.ic_menu_search)
            .setContentTitle("Zebby is analyzing your job").setContentText("You can keep using the app.").setOngoing(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel,"Cancel",WorkManager.getInstance(applicationContext).createCancelPendingIntent(id)).build()
        return if(Build.VERSION.SDK_INT>=29) ForegroundInfo(id.hashCode(),notification,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC) else ForegroundInfo(id.hashCode(),notification)
    }
    override suspend fun doWork():Result=withContext(Dispatchers.IO) {
        val runKey="run:$id"
        try {
            val run=JSONObject(app.vault.get(runKey));val plan=run.getBoolean("plan");val record=run.getString("record");val workspace=run.getString("workspace")
            require(app.store.file.name==workspace) { "The selected database changed. Reopen the job before analyzing." }
            val job=app.store.get(plan,record) ?: error("This job is no longer available.")
            require(job.source()==run.getString("source")) { "This job changed before analysis started. Try again from the latest version." }
            val provider=run.getString("provider")
            require(runAttemptCount==0 || provider=="credits") { "Analysis was interrupted. Tap Analyze to start it again." }
            setForeground(getForegroundInfo());val started=System.currentTimeMillis()
            suspend fun progress(stage:String) { setProgress(workDataOf("stage" to stage,"started" to started)) }
            progress("Reading your resume")
            val resume=app.store.resumes().firstOrNull { it.id==job["resume_id"] } ?: error("Choose a resume before analyzing.")
            val resumeText=ResumeReader.read(applicationContext,resume.name,app.store.resumeBytes(resume.id))
            require(job.description.length >= if(plan) 100 else 80) { "Add a longer job description before analyzing." }
            val input=JSONObject().put("resumeText",resumeText).put("jobDescription",job.description).put("company",job.company).put("title",job["title"])
                .put("currentCvOverview",if(plan) job["current_overview"] else "").put("url",job["listing_url"]).put("team",job["team"]).put("locations",job["locations"])
            val paidKey="$workspace:${if(plan) "plan" else "match"}:$record"
            val result=if(provider=="credits") AnalysisResult.parse(app.credits.analyze(paidKey,input,plan,run.getString("model"),run.getString("thinking"),::progress),plan)
                else app.engine.analyze(provider,run.getString("model"),run.getString("thinking"),run.getString("server"),input,plan,::progress)
            coroutineContext.ensureActive();progress("Saving analysis")
            require(app.store.file.name==workspace) { "The database changed. Your paid result can be recovered from the original job." }
            app.store.save(result.apply(job),expectedSource=job.source(),analysis=true)
            if(provider=="credits") app.credits.acknowledge(paidKey)
            app.vault.put(runKey,"");app.log("analysis.completed")
            Result.success()
        } catch(e:CancellationException) { app.log("analysis.cancelled");throw e }
        catch(e:Exception) {
            app.log("analysis.failed",e)
            Result.failure(workDataOf("error" to (e.message ?: "Analysis could not finish. Try again.").take(500)))
        }
    }
}
