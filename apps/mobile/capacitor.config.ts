import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.nudge.mobile',
  appName: 'Nudge',
  webDir: '../web/out',
  // The WebView serves from http://localhost (Capacitor default) so the app
  // bundle's absolute paths work; auth deep links arrive via nudge://.
  android: {
    allowMixedContent: false,
  },
};

export default config;
