// handoff/tailwind.config.ts
//
// NOTE: This codebase uses Tailwind v4 with @theme inline in globals.css —
// most theme extension happens THERE, not here. This file exists for the
// places where you genuinely need a JS config (custom plugins, content paths,
// presets, dark mode strategy).
//
// In v4, after globals.css adds the named scales, all of these classes
// just work without any JS config:
//
//   bg-pacific-500   text-pacific-700   border-pacific-200
//   bg-sand-100      text-sand-800      ring-pacific-400
//   bg-sun-500       bg-sunset-500
//   font-display     font-mono          font-sans
//   bg-primary-soft  text-primary-soft-foreground
//   bg-accent-soft   text-accent-soft-foreground
//   bg-highlight-soft
//
// The repo currently has no tailwind.config.ts. You only need one if you
// add the following:

import type { Config } from "tailwindcss";

const config: Config = {
  // v4 reads sources from globals.css; only set this if you need to override.
  // content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],

  darkMode: ["class"],

  theme: {
    extend: {
      // Custom keyframes for any non-trivial animation. Token-based.
      keyframes: {
        "fade-in": {
          "0%":   { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.55" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms cubic-bezier(0.2, 0, 0, 1)",
        "pulse-dot": "pulse-dot 2.4s ease-in-out infinite",
      },
    },
  },

  plugins: [
    // Add typography or forms plugins here if/when needed.
  ],
};

export default config;
