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

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Lembretes locais opcionais. Cada lembrete: {enabled, title, text, hour, minute, days:[1..7]} (1 = segunda).
 * Disparos diários inexatos (economizam bateria); o dia da semana é conferido no disparo.
 */
public class ReminderReceiver extends BroadcastReceiver {
    private static final int MAX = 20;
    private static final String CHANNEL = "lembretes";

    static JSONArray load(Context ctx) {
        try {
            return new JSONArray(ctx.getSharedPreferences("reminders", Context.MODE_PRIVATE).getString("list", "[]"));
        } catch (Exception e) { return new JSONArray(); }
    }

    private static PendingIntent pi(Context ctx, int idx) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        i.setAction("br.app.treinosaude.REMINDER_" + idx);
        i.putExtra("idx", idx);
        return PendingIntent.getBroadcast(ctx, idx, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void scheduleAll(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (int i = 0; i < MAX; i++) am.cancel(pi(ctx, i));
        JSONArray list = load(ctx);
        for (int i = 0; i < Math.min(MAX, list.length()); i++) {
            JSONObject r = list.optJSONObject(i);
            if (r == null || !r.optBoolean("enabled")) continue;
            Calendar c = Calendar.getInstance();
            c.set(Calendar.HOUR_OF_DAY, r.optInt("hour", 9));
            c.set(Calendar.MINUTE, r.optInt("minute", 0));
            c.set(Calendar.SECOND, 0);
            c.set(Calendar.MILLISECOND, 0);
            if (c.getTimeInMillis() <= System.currentTimeMillis()) c.add(Calendar.DAY_OF_YEAR, 1);
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(), AlarmManager.INTERVAL_DAY, pi(ctx, i));
        }
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action)) { scheduleAll(ctx); return; }
        int idx = intent.getIntExtra("idx", -1);
        JSONArray list = load(ctx);
        JSONObject r = idx >= 0 ? list.optJSONObject(idx) : null;
        if (r == null || !r.optBoolean("enabled")) return;
        int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK); // 1 = domingo
        int day = dow == Calendar.SUNDAY ? 7 : dow - 1;             // 1 = segunda ... 7 = domingo
        JSONArray days = r.optJSONArray("days");
        boolean today = days == null || days.length() == 0;
        if (days != null) for (int k = 0; k < days.length(); k++) if (days.optInt(k) == day) today = true;
        if (!today) return;

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Lembretes", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(ctx, 100 + idx, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(r.optString("title", "Cyl Gymly"))
                .setContentText(r.optString("text", ""))
                .setContentIntent(content)
                .setAutoCancel(true);
        try { nm.notify(1000 + idx, b.build()); } catch (SecurityException ignored) { }
    }
}
