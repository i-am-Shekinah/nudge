package app.nudge.mobile;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.Random;

/**
 * Renders FCM messages in the app process so the branded small icon
 * survives OEM transports (HiOS replaces it on transport-rendered
 * notifications). Extends the Capacitor service so token + JS delivery
 * events keep flowing through super.
 */
public class NudgeMessagingService extends MessagingService {

    private static final String CHANNEL_ID = "nudge-alerts";

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        // Keeps pushNotificationReceived working for a live JS context.
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String title = data.get("title");
        String body = data.get("body");
        if (title == null && body == null) {
            return; // data payloads without a message are for JS only
        }
        ensureChannel();

        String url = data.get("url");
        Intent tap = new Intent(Intent.ACTION_VIEW, Uri.parse("nudge://push?url=" + (url == null ? "/dashboard" : url)));
        tap.setPackage(getPackageName());
        tap.setClass(this, MainActivity.class);
        tap.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, new Random().nextInt(), tap, PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.push_notification)
                .setContentTitle(title == null ? "Nudge" : title)
                .setContentText(body == null ? "" : body)
                .setColor(0xFFF8AF18)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pi);

        NotificationManagerCompat nm = NotificationManagerCompat.from(this);
        try {
            nm.notify(new Random().nextInt(), builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted: nothing to show anyway.
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(new NotificationChannel(
                    CHANNEL_ID, "Nudge alerts", NotificationManager.IMPORTANCE_HIGH));
        }
    }
}
