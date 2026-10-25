import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import { getSupabase } from "./supabase";

/**
 * Expo push registration + tap deep-links.
 * The token is re-registered on every app start (plan risk table: token churn),
 * stored under the signed-in user in `expo_push_tokens` (token is the PK).
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

let lastRegistered: string | null = null;

export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return; // Expo push does not work on simulators.
  const sb = getSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Job updates",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const status = await Notifications.getPermissionsAsync();
  let finalStatus = status;
  if (status.status !== "granted") {
    finalStatus = await Notifications.requestPermissionsAsync();
  }
  if (finalStatus.status !== "granted") return;

  const pushKey = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const tokenRes = await Notifications.getExpoPushTokenAsync(pushKey ? { projectId: pushKey } : undefined);
  const token = tokenRes.data;
  if (token === lastRegistered) return;

  const { error } = await sb.from("hericilla_expo_push_tokens").upsert(
    { token, user_id: user.id, os: Platform.OS, enabled: true, updated_at: new Date().toISOString() },
    { onConflict: "token" },
  );
  if (!error) lastRegistered = token;
}

/** Route notification taps to the right screen. Returns a disposer. */
export function subscribeNotificationDeepLinks(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    const jobId = data?.job_id;
    if (typeof jobId === "string") {
      router.push(`/job/${jobId}` as never);
      return;
    }
    const path = data?.path;
    if (typeof path === "string") router.push(path as never);
  });
  return () => sub.remove();
}
