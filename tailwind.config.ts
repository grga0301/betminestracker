// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pitch: '#0a0f0a',
        'pitch-mid': '#111811',
        'pitch-light': '#1a231a',
        chalk: '#f0f4f0',
        'chalk-dim': '#8a9e8a',
        accent: '#4ade80',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
