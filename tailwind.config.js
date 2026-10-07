/** @type {import('tailwindcss').Config} */
const semanticPalette = (name, shades) =>
  Object.fromEntries(
    shades.map((shade) => [
      shade,
      `rgb(var(--fluentia-${name}-${shade}-rgb) / <alpha-value>)`,
    ]),
  );

module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--app-background-rgb) / <alpha-value>)",
        surface: "rgb(var(--card-surface-rgb) / <alpha-value>)",
        border: "rgb(var(--card-border-rgb) / <alpha-value>)",
        amber: semanticPalette("amber", [200, 300, 400, 500, 950]),
        indigo: semanticPalette("indigo", [100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        blue: semanticPalette("indigo", [100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        sky: semanticPalette("indigo", [200, 300, 400, 500]),
        emerald: semanticPalette("emerald", [100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        green: semanticPalette("emerald", [300, 900]),
        rose: semanticPalette("rose", [100, 300, 400, 500, 600, 700, 800, 900, 950]),
        red: semanticPalette("rose", [100, 200, 300, 400, 500, 700, 900]),
        accent: {
          DEFAULT: "rgb(var(--fluentia-amber-500-rgb) / <alpha-value>)",
          hover: "rgb(var(--fluentia-amber-400-rgb) / <alpha-value>)",
          subtle: "rgb(var(--fluentia-amber-500-rgb) / 0.2)",
        },
        text: {
          primary: "#F3F4F6",
          secondary: "#9CA3AF",
          muted: "#6B7280",
        },
        success: {
          DEFAULT: "rgb(var(--fluentia-emerald-400-rgb) / <alpha-value>)",
          subtle: "rgb(var(--fluentia-emerald-950-rgb) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--fluentia-amber-400-rgb) / <alpha-value>)",
          subtle: "rgb(var(--fluentia-amber-950-rgb) / <alpha-value>)",
        },
        info: {
          DEFAULT: "rgb(var(--fluentia-indigo-400-rgb) / <alpha-value>)",
          subtle: "rgb(var(--fluentia-indigo-950-rgb) / <alpha-value>)",
        },
        error: {
          DEFAULT: "rgb(var(--fluentia-rose-400-rgb) / <alpha-value>)",
          subtle: "rgb(var(--fluentia-rose-950-rgb) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter, system-ui)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
