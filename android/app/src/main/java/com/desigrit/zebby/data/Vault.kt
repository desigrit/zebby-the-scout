package com.desigrit.zebby.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Keys and wallet credentials never enter the portable SQLite file or Android backup. */
interface Secrets {
    fun get(name:String):String
    fun put(name:String,value:String)
}
class Vault(context: Context):Secrets {
    private val prefs = context.getSharedPreferences("vault", Context.MODE_PRIVATE)
    private val alias = "zebby-vault-v1"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    @Synchronized override fun get(name: String): String {
        val encoded = prefs.getString(name,null) ?: return ""
        try { val bytes = Base64.decode(encoded,Base64.NO_WRAP); val cipher=Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12)))
            return String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8)
        } catch (_: Exception) { error("Secure storage could not be unlocked. Restore your credits or add your API key again.") }
    }
    @Synchronized override fun put(name: String, value: String) {
        val editor=prefs.edit()
        if(value.isEmpty()) editor.remove(name) else {
            val cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key())
            editor.putString(name, Base64.encodeToString(cipher.iv + cipher.doFinal(value.toByteArray()),Base64.NO_WRAP))
        }
        check(editor.commit()) { "Could not save secure settings." }
    }
}
