package com.desigrit.zebby

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import com.desigrit.zebby.ui.WelcomeContent
import com.desigrit.zebby.ui.ZebbyTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[35],qualifiers="w393dp-h800dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class WelcomeTest {
    @get:Rule val rule=createComposeRule()
    private var renderedView:View?=null

    @Composable private fun Content(busy:Boolean=false,appearance:String="light",onCreate:()->Unit={},onOpen:()->Unit={}) {
        val view=LocalView.current
        SideEffect {renderedView=view.rootView}
        ZebbyTheme(appearance) {WelcomeContent(busy,onCreate,onOpen)}
    }

    private fun capture(name:String) {
        rule.waitForIdle()
        rule.runOnIdle {
            val view=renderedView!!
            val image=Bitmap.createBitmap(view.width,view.height,Bitmap.Config.ARGB_8888)
            view.draw(Canvas(image))
            val output=File("build/reports/welcome/$name.png").apply {parentFile!!.mkdirs()}
            output.outputStream().use {image.compress(Bitmap.CompressFormat.PNG,100,it)}
            image.recycle()
        }
    }

    @Test fun phoneWelcomeWaitsForExplicitChoice() {
        var creates=0;var opens=0
        rule.setContent {Content(onCreate={creates++},onOpen={opens++})}
        rule.onNodeWithText("Your search, in one place.").assertIsDisplayed()
        rule.onNodeWithText("Create database").assertIsDisplayed()
        rule.onNodeWithText("Open existing database").assertIsDisplayed()
        assertEquals(0,creates);assertEquals(0,opens)
        capture("android-welcome-phone")
        rule.onNodeWithText("Open existing database").performClick()
        assertEquals(1,opens);assertEquals(0,creates)
        rule.onNodeWithText("Create database").performClick()
        assertEquals(1,creates)
    }

    @Test @Config(qualifiers="w1100dp-h800dp-mdpi") fun tabletWelcomeKeepsActionsTogether() {
        rule.setContent {Content()}
        val create=rule.onNodeWithText("Create database").fetchSemanticsNode().boundsInRoot
        val open=rule.onNodeWithText("Open existing database").fetchSemanticsNode().boundsInRoot
        assertEquals(create.center.y,open.center.y,1f)
        capture("android-welcome-tablet")
    }

    @Test fun openingDatabaseDisablesBothActions() {
        rule.setContent {Content(busy=true,appearance="dark")}
        rule.onNodeWithText("Create database").assertIsNotEnabled()
        rule.onNodeWithText("Open existing database").assertIsNotEnabled()
        capture("android-welcome-dark-busy")
    }
}
