/** @type {import('tailwindcss').Config} */
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
        accent: {
          DEFAULT: "#FBBF24",
          hover: "#FCD34D",
          subtle: "rgba(245, 158, 11, 0.2)",
        },
        text: {
          primary: "#F3F4F6",
          secondary: "#9CA3AF",
          muted: "#6B7280",
        },
        success: {
          DEFAULT: "#34D399",
          subtle: "#064E3B",
        },
        warning: {
          DEFAULT: "#FBBF24",
          subtle: "#78350F",
        },
        info: {
          DEFAULT: "#38BDF8",
          subtle: "#0C4A6E",
        },
        error: {
          DEFAULT: "#FB7185",
          subtle: "#881337",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter, system-ui)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
