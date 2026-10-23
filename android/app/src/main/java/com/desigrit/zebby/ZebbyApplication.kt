package com.desigrit.zebby

import android.app.Application
import com.desigrit.zebby.data.*
import com.desigrit.zebby.network.*
import java.io.File

class ZebbyApplication:Application() {
    val store by lazy { Store(this) }
    val vault by lazy { Vault(this) }
    val preferences by lazy { Preferences(this) }
    val contracts by lazy { Contracts(this) }
    val http by lazy { Http() }
    val engine by lazy { AnalysisEngine(http,contracts,vault) }
    val credits by lazy { Credits(http,vault) }
    val cloud by lazy { CloudSync(this,store) }
    val listing by lazy { ListingReader(http) }
    @Synchronized fun log(event:String,error:Throwable?=null) {
        // Deliberately excludes exception messages, URLs, requests, keys, resumes and job content.
        val folder=File(filesDir,"logs").apply { mkdirs() };val file=File(folder,"zebby.log")
        if(file.length()>512*1024) file.renameTo(File(folder,"zebby-previous.log"))
        file.appendText("${now()} $event ${error?.javaClass?.simpleName.orEmpty()}\n")
    }
}
