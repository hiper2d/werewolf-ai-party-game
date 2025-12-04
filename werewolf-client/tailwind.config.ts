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
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      fontFamily: {
        inter: ['var(--font-inter)'],
        mono: ['var(--font-roboto-mono)'],
      },
      boxShadow: {
        card: '0 4px 16px var(--color-card-shadow)',
      },
    },
  },
  plugins: [],
};
export default config;
