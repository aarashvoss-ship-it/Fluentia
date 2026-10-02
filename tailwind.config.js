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
          DEFAULT: "#FBBF24",
          hover: "#FCD34D",
          subtle: "rgba(245, 158, 11, 0.2)",
        },
        text: {
          primary: "#F3F4F6",
          secondary: "#9CA3AF",
          muted: "#6B7280",
        },
        success: "#10B981",
        warning: "#FBBF24",
      },
      fontFamily: {
        sans: ["var(--font-inter, system-ui)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
