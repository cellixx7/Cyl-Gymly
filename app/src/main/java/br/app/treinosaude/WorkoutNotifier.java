package br.app.treinosaude;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONObject;

/**
 * Treino em andamento fora do app: notificação fixa (exercício atual, série, contagem do descanso)
 * e aviso com vibração quando o descanso termina — também com o app em segundo plano ou a tela apagada.
 * Estado recebido do JavaScript: {active, title, text, restEndsAt (ms, 0 = sem descanso), next}.
 */
public class WorkoutNotifier extends BroadcastReceiver {
    static final String CH_ONGOING = "treino_atual";
    static final String CH_ALERT = "descanso_fim";
    static final int ID_ONGOING = 2000, ID_ALERT = 2001;
    static final String ACTION_REST_END = "br.app.treinosaude.REST_END";
    /** true enquanto o app está aberto em tela cheia (aí o próprio app avisa, sem notificação). */
    static volatile boolean foreground = false;

    private static void channels(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        if (nm.getNotificationChannel(CH_ONGOING) == null) {
            NotificationChannel c = new NotificationChannel(CH_ONGOING, "Treino em andamento", NotificationManager.IMPORTANCE_LOW);
            c.setShowBadge(false);
            nm.createNotificationChannel(c);
        }
        if (nm.getNotificationChannel(CH_ALERT) == null) {
            NotificationChannel c = new NotificationChannel(CH_ALERT, "Fim do descanso", NotificationManager.IMPORTANCE_HIGH);
            c.enableVibration(true);
            c.setVibrationPattern(new long[]{0, 400, 200, 400});
            nm.createNotificationChannel(c);
        }
    }

    private static PendingIntent openApp(Context ctx) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("openSession", true);
        return PendingIntent.getActivity(ctx, 300, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent restEnd(Context ctx) {
        Intent i = new Intent(ctx, WorkoutNotifier.class).setAction(ACTION_REST_END);
        return PendingIntent.getBroadcast(ctx, 301, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Notification.Builder builder(Context ctx, String ch) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, ch) : new Notification.Builder(ctx);
    }

    static void update(Context ctx, String json) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        JSONObject o;
        try { o = new JSONObject(json); } catch (Exception e) { o = new JSONObject(); }
        ctx.getSharedPreferences("workout", Context.MODE_PRIVATE).edit().putString("state", o.toString()).apply();
        am.cancel(restEnd(ctx));
        if (!o.optBoolean("active")) { nm.cancel(ID_ONGOING); nm.cancel(ID_ALERT); return; }
        channels(nm);
        long ends = o.optLong("restEndsAt", 0);
        boolean resting = ends > System.currentTimeMillis();
        Notification.Builder b = builder(ctx, CH_ONGOING)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(resting ? "Descanso · " + o.optString("title") : o.optString("title", "Treino em andamento"))
                .setContentText(resting ? "Próxima: " + o.optString("next") : o.optString("text"))
                .setContentIntent(openApp(ctx))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(resting);
        if (Build.VERSION.SDK_INT >= 21) b.setVisibility(Notification.VISIBILITY_PUBLIC);
        if (resting) {
            b.setWhen(ends).setUsesChronometer(true);
            if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true);
            nm.cancel(ID_ALERT);
            schedule(am, ctx, ends);
        }
        try { nm.notify(ID_ONGOING, b.build()); } catch (SecurityException ignored) { }
    }

    private static void schedule(AlarmManager am, Context ctx, long at) {
        PendingIntent pi = restEnd(ctx);
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) { am.set(AlarmManager.RTC_WAKEUP, at, pi); }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ACTION_REST_END.equals(intent.getAction())) return;
        String st = ctx.getSharedPreferences("workout", Context.MODE_PRIVATE).getString("state", "{}");
        JSONObject o;
        try { o = new JSONObject(st); } catch (Exception e) { return; }
        if (!o.optBoolean("active")) return;
        // volta a notificação fixa para "sem descanso"
        try { o.put("restEndsAt", 0); } catch (Exception ignored) { }
        update(ctx, o.toString());
        if (foreground) return; // app aberto: o próprio app vibra e avisa
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        channels(nm);
        Notification.Builder b = builder(ctx, CH_ALERT)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle("Descanso concluído")
                .setContentText("Próxima: " + o.optString("next"))
                .setContentIntent(openApp(ctx))
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_ALARM);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setVibrate(new long[]{0, 400, 200, 400});
        else b.setTimeoutAfter(5 * 60 * 1000);
        try { nm.notify(ID_ALERT, b.build()); } catch (SecurityException ignored) { }
    }
}
