package com.desigrit.zebby

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.desigrit.zebby.ui.ZebbyRoot

class MainActivity:ComponentActivity() {
    private val model:ZebbyViewModel by viewModels()
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState);enableEdgeToEdge()
        setContent { ZebbyRoot(model,if(intent.action==Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT) else null) }
    }
    override fun onNewIntent(intent:Intent) { super.onNewIntent(intent);setIntent(intent);setContent { ZebbyRoot(model,if(intent.action==Intent.ACTION_SEND) intent.getStringExtra(Intent.EXTRA_TEXT) else null) } }
    override fun onResume() { super.onResume();model.reload() }
}
