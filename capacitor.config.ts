import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cidadex.br',
  appName: 'CidadeX',
  webDir: 'dist',
  server: {
    url: 'https://cidadex-br.com',
    cleartext: false,
  },
  android: {
    backgroundColor: '#1a6b40',
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a6b40',
      overlaysWebView: false,
    },
  },
};

export default config;
