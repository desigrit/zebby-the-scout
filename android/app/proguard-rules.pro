-keep class com.tom_roush.** { *; }
-dontwarn javax.xml.stream.**
-dontwarn java.awt.**
-dontwarn javax.imageio.**

# Optional JPEG2000 image codecs; Zebby only extracts PDF text.
# https://github.com/TomRoush/PdfBox-Android#optional-dependencies
-dontwarn com.gemalto.jp2.JP2Decoder
-dontwarn com.gemalto.jp2.JP2Encoder
