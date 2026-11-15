package com.desigrit.zebby.data

import java.io.ByteArrayOutputStream
import java.io.InputStream

/** Bounded streaming, including Android 8 where InputStream.readNBytes is unavailable. */
fun InputStream.readBounded(limit:Int):ByteArray {
    val output=ByteArrayOutputStream();val buffer=ByteArray(65536)
    while(output.size()<limit) {val count=read(buffer,0,minOf(buffer.size,limit-output.size()));if(count<0) break;output.write(buffer,0,count)}
    return output.toByteArray()
}

/** Hash cloud databases in bounded chunks instead of materializing resume BLOBs in RAM. */
fun InputStream.sha256Bounded():String {
    val digest=java.security.MessageDigest.getInstance("SHA-256");val buffer=ByteArray(65536);var total=0L
    while(true) {val n=read(buffer);if(n<0) break;total+=n;require(total<=512L*1024*1024) {"This database is larger than 512 MB."};digest.update(buffer,0,n)}
    return digest.digest().joinToString("") {"%02x".format(it)}
}
