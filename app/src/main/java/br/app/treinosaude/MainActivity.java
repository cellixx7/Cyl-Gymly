package br.app.treinosaude;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Treino & Saúde — app pessoal 100% offline.
 * A interface é HTML/JS local (assets/www). Os dados ficam em arquivos
 * internos do app (data.json), com cópias de segurança diárias automáticas.
 */
public class MainActivity extends Activity {

    private static final int REQ_EXPORT = 11;
    private static final int REQ_IMPORT = 12;
    private static final int REQ_GALLERY = 13;
    private static final int REQ_CAMERA = 14;
    private static final int REQ_NOTIF = 15;

    private static final Pattern SAFE_ID = Pattern.compile("^[A-Za-z0-9_-]{1,64}$");
    private static final Pattern SAFE_KIND = Pattern.compile("^[a-z-]{1,20}$");
    private static final long MAX_IMPORT_BYTES = 60L * 1024 * 1024;
    private static final int KEEP_DAILY = 14;
    private static final int KEEP_SAFETY = 10;

    private WebView web;
    /** Sessão de treino em andamento: ao sair do app, ele vira uma janela flutuante (picture-in-picture). */
    private volatile boolean pipWanted = false;
    private boolean pendingOpenSession = false;
    private boolean inPip = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if ("file".equals(u.getScheme())) return false;
                // Links externos abrem fora do app (o app não acessa a internet)
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                android.util.Log.i("TreinoSaude", m.message() + " @" + m.lineNumber());
                return true;
            }
        });
        setContentView(web);
        web.loadUrl("file:///android_asset/www/index.html");
        if (getIntent() != null && getIntent().getBooleanExtra("openSession", false)) pendingOpenSession = true;
    }

    @Override
    protected void onResume() { super.onResume(); WorkoutNotifier.foreground = !inPip; }

    @Override
    protected void onStop() { super.onStop(); WorkoutNotifier.foreground = false; }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getBooleanExtra("openSession", false)) callJs("openRunningSession", "");
    }

    private void applyPipParams() {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            android.app.PictureInPictureParams.Builder b = new android.app.PictureInPictureParams.Builder()
                    .setAspectRatio(new android.util.Rational(1, 1));
            if (Build.VERSION.SDK_INT >= 31) b.setAutoEnterEnabled(pipWanted).setSeamlessResizeEnabled(false);
            setPictureInPictureParams(b.build());
        } catch (Exception ignored) { }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (pipWanted && Build.VERSION.SDK_INT >= 26 && Build.VERSION.SDK_INT < 31 && !inPip) {
            try { enterPictureInPictureMode(new android.app.PictureInPictureParams.Builder().setAspectRatio(new android.util.Rational(1, 1)).build()); }
            catch (Exception ignored) { }
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean pip, android.content.res.Configuration cfg) {
        super.onPictureInPictureModeChanged(pip, cfg);
        inPip = pip;
        WorkoutNotifier.foreground = !pip && isResumedCompat();
        callJs("onPip", pip ? "1" : "0");
    }

    private boolean isResumedCompat() { return getWindow() != null && hasWindowFocus(); }

    /** Ao sair do app (ou trocar de tela), grava qualquer alteração pendente. */
    @Override
    protected void onPause() {
        super.onPause();
        if (web != null) web.evaluateJavascript("window.flushPending && window.flushPending()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.appBack ? window.appBack() : false", value -> {
            if (!"true".equals(value)) MainActivity.super.onBackPressed();
        });
    }

    private void callJs(String fn, String arg) {
        runOnUiThread(() -> web.evaluateJavascript(
                "window." + fn + " && window." + fn + "(" + JSONObject.quote(arg == null ? "" : arg) + ")", null));
    }

    // ---------- arquivos ----------

    private File dataFile() { return new File(getFilesDir(), "data.json"); }
    private File backupDir() { File d = new File(getFilesDir(), "backups"); d.mkdirs(); return d; }
    private File photoDir() { File d = new File(getFilesDir(), "photos"); d.mkdirs(); return d; }

    private static String readAll(InputStream in) throws Exception { return readAll(in, Long.MAX_VALUE); }

    /** Lê até {@code max} bytes; acima disso, lança erro (protege contra arquivos enormes). */
    private static String readAll(InputStream in, long max) throws Exception {
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            long total = 0;
            int n;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > max) throw new TooBigException();
                bo.write(buf, 0, n);
            }
            return bo.toString("UTF-8");
        } finally { in.close(); }
    }

    private static class TooBigException extends Exception { }

    private static boolean safeId(String id) { return id != null && SAFE_ID.matcher(id).matches(); }

    private static String stamp() { return new SimpleDateFormat("yyyy-MM-dd-HHmmss", Locale.US).format(new Date()); }

    private static void copyFile(File from, File to) throws Exception {
        writeAtomic(to, readAll(new FileInputStream(from)));
    }

    private void prune(String prefix, int keep) {
        File[] all = backupDir().listFiles((dir, name) -> name.startsWith(prefix) && name.endsWith(".json"));
        if (all != null && all.length > keep) {
            Arrays.sort(all);
            for (int i = 0; i < all.length - keep; i++) all[i].delete();
        }
    }

    private static void writeAtomic(File f, String content) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        FileOutputStream fo = new FileOutputStream(tmp);
        fo.write(content.getBytes(StandardCharsets.UTF_8));
        fo.getFD().sync();
        fo.close();
        if (!tmp.renameTo(f)) throw new Exception("rename failed");
    }

    /**
     * Cópia diária: na primeira gravação do dia, guarda o estado ANTERIOR (o que estava salvo antes
     * desta alteração). Assim, um erro de hoje não sobrescreve a cópia boa. Mantém os últimos 14 dias.
     */
    private void dailyBackupOfPrevious() {
        try {
            File cur = dataFile();
            if (!cur.exists() || cur.length() == 0) return;
            String day = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
            File b = new File(backupDir(), "backup-" + day + ".json");
            if (b.exists()) return;
            String prev = readAll(new FileInputStream(cur));
            try { new JSONObject(prev); } catch (Exception bad) { return; } // não copia conteúdo ilegível como "cópia boa"
            writeAtomic(b, prev);
            prune("backup-", KEEP_DAILY);
        } catch (Exception ignored) { }
    }

    private String savePhotoFromUri(Uri uri) throws Exception {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        InputStream in = getContentResolver().openInputStream(uri);
        BitmapFactory.decodeStream(in, null, o);
        in.close();
        int max = Math.max(o.outWidth, o.outHeight);
        int sample = 1;
        while (max / (sample * 2) >= 1280) sample *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        in = getContentResolver().openInputStream(uri);
        Bitmap bmp = BitmapFactory.decodeStream(in, null, o2);
        in.close();
        if (bmp == null) throw new Exception("imagem inválida");
        int rotate = 0;
        try {
            in = getContentResolver().openInputStream(uri);
            ExifInterface ex = new ExifInterface(in);
            int ori = ex.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            in.close();
            if (ori == ExifInterface.ORIENTATION_ROTATE_90) rotate = 90;
            else if (ori == ExifInterface.ORIENTATION_ROTATE_180) rotate = 180;
            else if (ori == ExifInterface.ORIENTATION_ROTATE_270) rotate = 270;
        } catch (Exception ignored) { }
        float scale = Math.min(1f, 1280f / Math.max(bmp.getWidth(), bmp.getHeight()));
        Matrix m = new Matrix();
        if (scale < 1f) m.postScale(scale, scale);
        if (rotate != 0) m.postRotate(rotate);
        Bitmap out = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
        String id = "p" + System.currentTimeMillis();
        FileOutputStream fo = new FileOutputStream(new File(photoDir(), id + ".jpg"));
        out.compress(Bitmap.CompressFormat.JPEG, 75, fo);
        fo.close();
        return id;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        try {
            if (requestCode == REQ_EXPORT) {
                Uri uri = data != null ? data.getData() : null;
                if (resultCode == RESULT_OK && uri != null) callJs("onExportDone", writeExport(uri));
                else { callJs("onExportDone", "cancel"); pendingExportFile().delete(); }
            } else if (requestCode == REQ_IMPORT) {
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    String text;
                    try { text = readAll(getContentResolver().openInputStream(data.getData()), MAX_IMPORT_BYTES); }
                    catch (TooBigException big) { callJs("onImportError", "Arquivo grande demais para ser um backup deste app."); return; }
                    callJs("onImportFile", text);
                }
            } else if (requestCode == REQ_GALLERY) {
                if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                    callJs("onPhoto", savePhotoFromUri(data.getData()));
                }
            } else if (requestCode == REQ_CAMERA) {
                if (resultCode == RESULT_OK) {
                    callJs("onPhoto", savePhotoFromUri(PhotoProvider.CAMERA_URI));
                }
            }
        } catch (Exception e) {
            Toast.makeText(this, "Erro: " + e.getMessage(), Toast.LENGTH_LONG).show();
            if (requestCode == REQ_EXPORT) callJs("onExportDone", "error");
        }
    }

    /** Conteúdo a exportar fica em arquivo (não só na memória): se o Android recriar a tela
     *  ou o processo enquanto o seletor de arquivos está aberto, o conteúdo não se perde. */
    private File pendingExportFile() { return new File(getCacheDir(), "pending-export.json"); }

    /** Grava o conteúdo pendente no documento escolhido e confere o tamanho.
     *  Nunca deixa para trás um arquivo vazio: se não houver o que gravar, apaga o documento criado. */
    private String writeExport(Uri uri) {
        File src = pendingExportFile();
        long expected = src.exists() ? src.length() : 0;
        if (expected <= 0) { discardDocument(uri); return "error:empty"; }
        long written = 0;
        try {
            OutputStream os;
            try { os = getContentResolver().openOutputStream(uri, "w"); }
            catch (Exception e) { os = getContentResolver().openOutputStream(uri, "wt"); }
            if (os == null) throw new java.io.IOException("sem acesso ao destino");
            try (InputStream in = new FileInputStream(src)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); written += n; }
                os.flush();
            } finally { os.close(); }
        } catch (Exception e) {
            android.util.Log.e("TreinoSaude", "export: " + e);
            discardDocument(uri);
            return "error:write";
        }
        if (written != expected) { discardDocument(uri); return "error:write"; }
        // Conferência: relê o destino quando o provedor permite (alguns, como nuvem, não permitem de imediato)
        long check = -1;
        try (InputStream in = getContentResolver().openInputStream(uri)) {
            if (in != null) { check = 0; byte[] buf = new byte[65536]; int n; while ((n = in.read(buf)) > 0) check += n; }
        } catch (Exception ignored) { }
        if (check == 0) { discardDocument(uri); return "error:empty"; }
        src.delete();
        return "ok:" + written;
    }

    private void discardDocument(Uri uri) {
        try { android.provider.DocumentsContract.deleteDocument(getContentResolver(), uri); } catch (Exception ignored) { }
    }

    /** Ponte entre a interface (JavaScript) e o Android. */
    public class Bridge {

        /**
         * Estado do arquivo principal: missing (nunca salvo), ok (com o conteúdo) ou error.
         * Se o conteúdo não for JSON válido, uma cópia é guardada em backups/corrupt-*.json
         * ANTES de qualquer outra coisa, e nada é apagado.
         */
        @JavascriptInterface
        public String loadState() {
            JSONObject o = new JSONObject();
            try {
                String[] names = backupDir().list((dir, name) -> name.startsWith("backup-") && name.endsWith(".json"));
                o.put("hasBackups", names != null && names.length > 0);
                File f = dataFile();
                if (!f.exists()) { o.put("status", "missing"); return o.toString(); }
                String raw;
                try { raw = readAll(new FileInputStream(f)); }
                catch (Exception e) { o.put("status", "error"); o.put("error", String.valueOf(e.getMessage())); return o.toString(); }
                try { new JSONObject(raw); }
                catch (Exception bad) {
                    try { copyFile(f, new File(backupDir(), "corrupt-" + stamp() + ".json")); prune("corrupt-", KEEP_SAFETY); } catch (Exception ignored) { }
                }
                o.put("status", "ok");
                o.put("data", raw);
            } catch (Exception e) {
                try { o.put("status", "error"); o.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
            }
            return o.toString();
        }

        @JavascriptInterface
        public String loadData() {
            try {
                File f = dataFile();
                if (!f.exists()) return "";
                return readAll(new FileInputStream(f));
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public boolean saveData(String json) {
            try {
                new JSONObject(json); // nunca grava conteúdo inválido no arquivo principal
                dailyBackupOfPrevious();
                writeAtomic(dataFile(), json);
                return true;
            } catch (Exception e) { return false; }
        }

        /** Cópia de segurança antes de operações que substituem os dados (restaurar, começar do zero). */
        @JavascriptInterface
        public boolean saveSafetyBackup(String kind, String content) {
            try {
                if (kind == null || !SAFE_KIND.matcher(kind).matches() || content == null) return false;
                writeAtomic(new File(backupDir(), kind + "-" + stamp() + ".json"), content);
                prune(kind + "-", KEEP_SAFETY);
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public String listPhotos() {
            JSONArray arr = new JSONArray();
            String[] all = photoDir().list((dir, name) -> name.endsWith(".jpg"));
            if (all != null) for (String n : all) { String id = n.substring(0, n.length() - 4); if (safeId(id)) arr.put(id); }
            return arr.toString();
        }

        @JavascriptInterface
        public String listBackups() {
            JSONArray arr = new JSONArray();
            File[] all = backupDir().listFiles((dir, name) -> name.endsWith(".json"));
            if (all != null) {
                Arrays.sort(all);
                for (int i = all.length - 1; i >= 0; i--) arr.put(all[i].getName());
            }
            return arr.toString();
        }

        @JavascriptInterface
        public String readBackup(String name) {
            try {
                String n = new File(String.valueOf(name)).getName();
                if (!n.matches("^[A-Za-z0-9_.-]{1,80}$")) return "";
                File f = new File(backupDir(), n);
                return readAll(new FileInputStream(f));
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public boolean exportFile(String filename, String content, String mime) {
            if (content == null || content.isEmpty()) return false;
            try {
                File f = pendingExportFile();
                File tmp = new File(f.getPath() + ".tmp");
                try (FileOutputStream fo = new FileOutputStream(tmp)) {
                    fo.write(content.getBytes(StandardCharsets.UTF_8));
                    fo.getFD().sync();
                }
                if (!tmp.renameTo(f)) return false;
            } catch (Exception e) { return false; }
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime == null || mime.isEmpty() ? "application/json" : mime);
                i.putExtra(Intent.EXTRA_TITLE, filename);
                try { startActivityForResult(i, REQ_EXPORT); }
                catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "Sem gerenciador de arquivos", Toast.LENGTH_LONG).show(); }
            });
            return true;
        }

        @JavascriptInterface
        public void importFile() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(i, REQ_IMPORT); }
                catch (ActivityNotFoundException e) { Toast.makeText(MainActivity.this, "Sem gerenciador de arquivos", Toast.LENGTH_LONG).show(); }
            });
        }

        @JavascriptInterface
        public void pickPhoto(String source) {
            runOnUiThread(() -> {
                try {
                    if ("camera".equals(source)) {
                        Intent i = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
                        i.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, PhotoProvider.CAMERA_URI);
                        i.setClipData(ClipData.newRawUri("foto", PhotoProvider.CAMERA_URI));
                        i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivityForResult(i, REQ_CAMERA);
                    } else {
                        Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                        i.setType("image/*");
                        i.addCategory(Intent.CATEGORY_OPENABLE);
                        startActivityForResult(Intent.createChooser(i, "Escolher foto"), REQ_GALLERY);
                    }
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Câmera/galeria indisponível", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface
        public String getPhoto(String id) {
            if (!safeId(id)) return "";
            try {
                File f = new File(photoDir(), new File(id).getName() + ".jpg");
                FileInputStream in = new FileInputStream(f);
                ByteArrayOutputStream bo = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                in.close();
                return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public boolean putPhoto(String id, String dataUrl) {
            if (!safeId(id) || dataUrl == null || !(dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.startsWith("data:image/png;base64,"))) return false;
            try {
                String b64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                FileOutputStream fo = new FileOutputStream(new File(photoDir(), new File(id).getName() + ".jpg"));
                fo.write(Base64.decode(b64, Base64.DEFAULT));
                fo.close();
                return true;
            } catch (Exception e) { return false; }
        }

        @JavascriptInterface
        public void deletePhoto(String id) {
            if (!safeId(id)) return;
            new File(photoDir(), id + ".jpg").delete();
        }

        @JavascriptInterface
        public void shareText(String title, String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_SUBJECT, title);
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, title));
            });
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void setReminders(String json) {
            getSharedPreferences("reminders", MODE_PRIVATE).edit().putString("list", json).apply();
            ReminderReceiver.scheduleAll(MainActivity.this);
            if (Build.VERSION.SDK_INT >= 33 && json.contains("\"enabled\":true")
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF));
            }
        }

        /** Estado do treino em andamento para a notificação fixa e o aviso de fim do descanso. */
        @JavascriptInterface
        public void workoutStatus(String json) {
            WorkoutNotifier.update(MainActivity.this, json);
            boolean active = json != null && json.contains("\"active\":true");
            if (active && Build.VERSION.SDK_INT >= 33
                    && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                    && !getSharedPreferences("workout", MODE_PRIVATE).getBoolean("askedNotif", false)) {
                getSharedPreferences("workout", MODE_PRIVATE).edit().putBoolean("askedNotif", true).apply();
                runOnUiThread(() -> requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF));
            }
        }

        /** Liga/desliga a janela flutuante ao sair do app (só durante um treino). */
        @JavascriptInterface
        public void setPip(boolean wanted) {
            pipWanted = wanted && Build.VERSION.SDK_INT >= 26 && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
            runOnUiThread(MainActivity.this::applyPipParams);
        }

        @JavascriptInterface
        public boolean pipSupported() { return Build.VERSION.SDK_INT >= 26 && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE); }

        @JavascriptInterface
        public boolean takeOpenSession() { boolean v = pendingOpenSession; pendingOpenSession = false; return v; }

        @JavascriptInterface
        public String appVersion() { return "1.3.1"; }
    }
}
