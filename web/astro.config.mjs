import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// Cloudflare Pages, served from the domain root. `site` is the one place the
// public address lives: pages read it back as import.meta.env.SITE for
// canonicals, og:url, og:image and the sitemap.
export default defineConfig({
  site: 'https://otakulist.pages.dev',
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
