import type { Config } from "tailwindcss";

/** @type {import('tailwindcss').Config} */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // New design tokens
        surface: {
          0: 'var(--bg-0)',
          1: 'var(--bg-1)',
          2: 'var(--bg-2)',
          3: 'var(--bg-3)',
          4: 'var(--bg-4)',
        },
        line: {
          1: 'var(--line-1)',
          2: 'var(--line-2)',
          3: 'var(--line-3)',
        },
        fg: {
          0: 'var(--fg-0)',
          1: 'var(--fg-1)',
          2: 'var(--fg-2)',
          3: 'var(--fg-3)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          line: 'var(--accent-line)',
          fg: 'var(--accent-fg)',
        },
        danger: 'var(--danger)',

        // Legacy tokens — keep existing components working
        primary: 'rgb(var(--color-text-primary))',
        secondary: 'rgb(var(--color-text-secondary))',
        card: {
          DEFAULT: 'rgb(var(--color-card-bg))',
          border: 'rgb(var(--color-card-border))',
        },
        btn: {
          DEFAULT: 'rgb(var(--color-button-bg))',
          text: 'rgb(var(--color-button-text))',
          'text-transparent': 'rgb(var(--color-button-text-transparent))',
          hover: 'rgb(var(--color-button-hover-bg))',
          transparent: 'rgb(var(--color-button-transparent-bg))',
          'transparent-hover': 'rgb(var(--color-button-transparent-hover-bg))',
        },
        input: {
          DEFAULT: 'rgb(var(--color-input-bg))',
          border: 'rgb(var(--color-input-border))',
          text: 'rgb(var(--color-input-text))',
          placeholder: 'rgb(var(--color-input-placeholder))',
        },
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-2)',
        pop: 'var(--shadow-pop)',
        subtle: 'var(--shadow-1)',
      },
      fontFamily: {
        inter: ['var(--font-inter)'],
        mono: ['var(--font-jetbrains-mono)', 'var(--font-roboto-mono)'],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
