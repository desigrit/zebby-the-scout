package com.desigrit.zebby.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import android.app.Activity
import android.content.ContextWrapper
import android.graphics.drawable.ColorDrawable
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.graphics.toArgb
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val light = lightColorScheme(
    primary=Color(0xFFA64A34),onPrimary=Color.White,primaryContainer=Color(0xFFF8E8E1),onPrimaryContainer=Color(0xFF773222),
    secondary=Color(0xFF71675F),onSecondary=Color.White,secondaryContainer=Color(0xFFF0ECE6),onSecondaryContainer=Color(0xFF302C29),
    tertiary=Color(0xFF2D8864),background=Color(0xFFF8F6F3),onBackground=Color(0xFF302C29),surface=Color(0xFFF8F6F3),onSurface=Color(0xFF302C29),
    surfaceContainer=Color(0xFFF0ECE6),surfaceContainerLow=Color(0xFFF5F2EE),surfaceContainerLowest=Color.White,
    surfaceContainerHigh=Color(0xFFECE6DF),surfaceVariant=Color(0xFFF0ECE6),onSurfaceVariant=Color(0xFF71675F),
    outline=Color(0xFFA49A90),outlineVariant=Color(0xFFDDD7D0),error=Color(0xFF9E3D22),errorContainer=Color(0xFFFFF0E9),onErrorContainer=Color(0xFF862F19))
private val dark = darkColorScheme(
    primary=Color(0xFFF0AC91),onPrimary=Color(0xFF24201E),primaryContainer=Color(0xFF443830),onPrimaryContainer=Color(0xFFFFC5AD),
    secondary=Color(0xFFBDB8B2),onSecondary=Color(0xFF24201E),secondaryContainer=Color(0xFF35302D),onSecondaryContainer=Color(0xFFF2F0EC),
    tertiary=Color(0xFF9DD8BC),background=Color(0xFF24201E),onBackground=Color(0xFFF2F0EC),surface=Color(0xFF24201E),onSurface=Color(0xFFF2F0EC),
    surfaceContainer=Color(0xFF2D2825),surfaceContainerLow=Color(0xFF292421),surfaceContainerLowest=Color(0xFF1E1B19),
    surfaceContainerHigh=Color(0xFF35302D),surfaceVariant=Color(0xFF332D29),onSurfaceVariant=Color(0xFFBDB8B2),
    outline=Color(0xFF89817A),outlineVariant=Color(0xFF4F4A48),error=Color(0xFFF5B3A6),errorContainer=Color(0xFF4C302A),onErrorContainer=Color(0xFFF5B3A6))

@Composable fun ZebbyTheme(appearance:String,content:@Composable ()->Unit) {
    val night=appearance=="dark" || appearance!="light" && isSystemInDarkTheme()
    val colors=if(night) dark else light
    val view=LocalView.current
    if(!view.isInEditMode) SideEffect {
        var context=view.context
        while(context is ContextWrapper && context !is Activity) context=context.baseContext
        val activity=context as? ComponentActivity
        activity?.let {
            val transparent=android.graphics.Color.TRANSPARENT
            val bars=if(night) SystemBarStyle.dark(transparent) else SystemBarStyle.light(transparent,transparent)
            it.enableEdgeToEdge(statusBarStyle=bars,navigationBarStyle=bars)
            it.window.setBackgroundDrawable(ColorDrawable(colors.background.toArgb()))
        }
    }
    MaterialTheme(colorScheme=colors,typography=Typography(),content=content)
}
