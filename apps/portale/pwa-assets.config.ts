// Genera le icone dell'app installabile (favicon, icone per Android e PC,
// icona per iPhone) da public/logo.svg, come in TheAccount.
// Si rilancia con: npm run icone (dentro apps/portale).
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

const sfondo = { background: '#1d3557' };

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...preset,
    maskable: { ...preset.maskable, resizeOptions: sfondo },
    apple: { ...preset.apple, resizeOptions: sfondo },
  },
  images: ['public/logo.svg'],
});
