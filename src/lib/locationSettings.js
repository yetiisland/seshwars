import { Capacitor } from '@capacitor/core'

// Matches capacitor.config.json's appId.
const APP_ID = 'com.seshwars.app'

// Opens the OS-level Settings page for this app so the user can re-enable
// location — without adding a new native plugin. Neither platform needs
// one: iOS's `app-settings:` URL scheme and Android's `intent://` settings
// deep link are both handled by Capacitor's built-in external-URL
// forwarding, the same mechanism tel:/mailto: links already use in this
// app, not a plugin API.
//
// The iOS path (`app-settings:`) is a long-standing, documented Apple URL
// scheme and is reused as-is. The Android path constructs an
// ACTION_APPLICATION_DETAILS_SETTINGS intent URI for this app's package —
// this is a commonly used plugin-free technique, but it was NOT possible to
// verify on an actual Android device/emulator here. If it doesn't open
// Settings in practice, the fallback is either a small custom Capacitor
// plugin or the community `capacitor-native-settings` package.
//
// Returns true if a native settings-open was attempted (nothing more to do
// — there's no reliable "did it actually open" signal from either URL
// scheme), false on web, where the caller should show on-screen instructions
// instead.
export function openLocationSettings() {
  if (!Capacitor.isNativePlatform()) return false
  const platform = Capacitor.getPlatform()
  if (platform === 'ios') {
    window.open('app-settings:', '_system')
    return true
  }
  if (platform === 'android') {
    window.open(`intent://${APP_ID}#Intent;scheme=package;action=android.settings.APPLICATION_DETAILS_SETTINGS;end`, '_system')
    return true
  }
  return false
}
