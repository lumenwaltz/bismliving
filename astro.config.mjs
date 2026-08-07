// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://bismliving.com',
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'vi'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
