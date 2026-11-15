@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
package com.desigrit.zebby.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.FolderOpen
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.desigrit.zebby.R
import com.desigrit.zebby.UiState
import com.desigrit.zebby.ZebbyViewModel

@Composable fun WelcomeScreen(vm:ZebbyViewModel,state:UiState) {
    val open=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) {uri ->
        if(uri!=null) vm.importDatabase(uri)
    }
    WelcomeContent(busy=state.busy,onCreate=vm::createDatabase,onOpen={open.launch(arrayOf("*/*"))})
}

@Composable fun WelcomeContent(busy:Boolean,onCreate:()->Unit,onOpen:()->Unit) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val viewportHeight=maxHeight
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()),horizontalAlignment=Alignment.CenterHorizontally) {
            Column(Modifier.widthIn(max=650.dp).fillMaxWidth().heightIn(min=viewportHeight).padding(horizontal=28.dp,vertical=40.dp),
                verticalArrangement=Arrangement.Center,horizontalAlignment=Alignment.Start) {
                Image(painterResource(R.drawable.zebby),null,Modifier.size(96.dp).clip(CircleShape))
                Spacer(Modifier.height(28.dp))
                Text("Your search, in one place.",style=MaterialTheme.typography.headlineLarge)
                Spacer(Modifier.height(16.dp))
                Text("Plan for the roles you want, then track every application and resume you send.",
                    style=MaterialTheme.typography.bodyLarge,color=MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(28.dp))
                FlowRow(horizontalArrangement=Arrangement.spacedBy(10.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                    Button(onClick=onCreate,enabled=!busy,shape=MaterialTheme.shapes.small,modifier=Modifier.heightIn(min=48.dp)) {
                        Icon(Icons.Outlined.Add,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text("Create database")
                    }
                    OutlinedButton(onClick=onOpen,enabled=!busy,shape=MaterialTheme.shapes.small,modifier=Modifier.heightIn(min=48.dp)) {
                        Icon(Icons.Outlined.FolderOpen,null,Modifier.size(18.dp));Spacer(Modifier.width(8.dp));Text("Open existing database")
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("Open a database from your device or cloud drive. Use Settings to sync between devices.",
                    style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
