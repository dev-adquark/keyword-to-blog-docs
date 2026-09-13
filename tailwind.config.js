/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#FAFAF8",
        ink: "#15171C",
        muted: "#5B5F6B",
        line: "#E4E2DC",
        indigo: {
          DEFAULT: "#3B36E0",
          dark: "#2B27B8",
          soft: "#EEEDFC",
        },
        amber: {
          DEFAULT: "#D97706",
          soft: "#FCF1DE",
        },
        surface: "#F1F0EB",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      maxWidth: {
        prose: "72ch",
      },
    },
  },
  plugins: [],
};
