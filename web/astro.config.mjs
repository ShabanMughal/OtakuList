import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// GitHub Pages project site → served under /OtakuList
export default defineConfig({
  site: 'https://shabanmughal.github.io',
  base: '/OtakuList',
  // output import.html / showcase.html (matches the old URLs & canonicals)
  build: { format: 'file' },
  integrations: [
    tailwind({
      // keep our existing global.css as the source of resets/base for now;
      // Tailwind's preflight is disabled so it won't fight the current styles.
      applyBaseStyles: false,
    }),
  ],
});
