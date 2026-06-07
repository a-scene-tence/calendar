import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'do-done',
  brand: {
    displayName: 'Do & Done',
    primaryColor: '#A8C8EF',
    icon: 'https://a-scene-tence.github.io/do-done/icon-512.png',
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'vite',
      build: 'tsc -b && vite build',
    },
  },
  permissions: [],
  outdir: 'dist',
  webViewProps: {
    type: 'partner',
  },
});
