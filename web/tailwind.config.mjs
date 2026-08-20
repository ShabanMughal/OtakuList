/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}'],
  corePlugins: {
    // disabled during migration so Tailwind's reset doesn't override the
    // existing global.css. Re-enable once pages are fully on Tailwind.
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        bg: '#0a0612',
        'bg-2': '#0f0a1c',
        panel: 'rgba(255,255,255,0.045)',
        'panel-brd': 'rgba(167,139,250,0.16)',
        text: '#f4f2ff',
        muted: '#b3aad4',
        dim: '#837aa6',
        accent: '#8b5cf6',
        'accent-2': '#a78bfa',
        'accent-3': '#c084fc',
        glow: '#7c3aed',
        gold: '#f2c14e',
      },
      fontFamily: {
        display: ['Unbounded', 'sans-serif'],
        body: ['Poppins', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      maxWidth: {
        site: '1160px',
      },
    },
  },
  plugins: [],
};
