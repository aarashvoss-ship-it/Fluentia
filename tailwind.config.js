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
        background: "#0E1117",
        surface: {
          DEFAULT: "#161B22",
          elevated: "#1F242C",
          subtle: "#12161D",
        },
        border: {
          subtle: "#262C36",
          strong: "#3B4352",
        },
        accent: {
          DEFAULT: "#E8A838",
          hover: "#D4962C",
          subtle: "rgba(232, 168, 56, 0.12)",
        },
        text: {
          primary: "#F3F4F6",
          secondary: "#9CA3AF",
          muted: "#6B7280",
        },
        success: "#10B981",
        warning: "#F59E0B",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        serif:   ["var(--font-fraunces)", "serif"],
        sans:    ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};
