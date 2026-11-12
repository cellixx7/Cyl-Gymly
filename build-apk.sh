#!/usr/bin/env bash
# Gera o APK sem Gradle, usando só as ferramentas do Android SDK.
# Uso: ANDROID_HOME=/caminho/do/sdk ./build-apk.sh
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_HOME:-$HOME/android-sdk}"
BT="$SDK/build-tools/35.0.0"
PLATFORM="$SDK/platforms/android-35/android.jar"
SRC=app/src/main
OUT=build
rm -rf "$OUT"; mkdir -p "$OUT/res" "$OUT/classes" "$OUT/dex" "$OUT/gen"

# O manifest não tem "package" (padrão do Android Studio); o script injeta aqui.
sed 's#<manifest #<manifest package="br.app.treinosaude" #' "$SRC/AndroidManifest.xml" > "$OUT/AndroidManifest.xml"
# DEBUG=1 gera uma variante depurável (só para testes no emulador; não usar no celular)
if [ "${DEBUG:-0}" = "1" ]; then sed -i 's#<application\b#<application android:debuggable="true"#' "$OUT/AndroidManifest.xml"; fi
echo "1/6 compilando recursos"
"$BT/aapt2" compile --dir "$SRC/res" -o "$OUT/res/res.zip"
echo "2/6 empacotando manifest + recursos + telas"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" --manifest "$OUT/AndroidManifest.xml" \
  -A "$SRC/assets" --java "$OUT/gen" --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 5 --version-name 1.3.1 "$OUT/res/res.zip"
echo "3/6 compilando Java"
javac -source 17 -target 17 -encoding UTF-8 -nowarn -classpath "$PLATFORM" -d "$OUT/classes" \
  $(find "$SRC/java" "$OUT/gen" -name '*.java')
echo "4/6 convertendo para DEX"
"$BT/d8" --min-api 24 --lib "$PLATFORM" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"
(cd "$OUT/dex" && zip -q -j ../unsigned.apk classes.dex)
echo "5/6 alinhando"
"$BT/zipalign" -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
echo "6/6 assinando"
if [ ! -f keystore.jks ]; then
  keytool -genkeypair -keystore keystore.jks -alias treinosaude -keyalg RSA -keysize 2048 -validity 36500 \
    -storepass "${TS_KEY_PASS:-treinosaude}" -keypass "${TS_KEY_PASS:-treinosaude}" -dname "CN=Treino e Saude, C=BR"
fi
"$BT/apksigner" sign --ks keystore.jks --ks-key-alias treinosaude --ks-pass "pass:${TS_KEY_PASS:-treinosaude}" \
  --key-pass "pass:${TS_KEY_PASS:-treinosaude}" --out "$OUT/TreinoSaude.apk" "$OUT/aligned.apk"
"$BT/apksigner" verify "$OUT/TreinoSaude.apk"
echo "APK pronto: $OUT/TreinoSaude.apk"
