import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#F08300",
          deep: "#D17300",
          50: "#FEF6EC",
          100: "#FDEAD3",
          500: "#F08300",
          600: "#D17300",
          700: "#A85D00",
        },
        ink: {
          900: "#1A1A1E",
          700: "#3D3D45",
          500: "#6B6B76",
          300: "#A9A9B4",
          200: "#D4D4DD",
          100: "#E9E9EF",
          50: "#F5F5F8",
        },
        screenbg: "#0B0B0F",
      },
      borderRadius: { card: "12px" },
      boxShadow: {
        card: "0 1px 3px rgba(16,16,20,0.06), 0 4px 12px rgba(16,16,20,0.05)",
        lift: "0 4px 8px rgba(16,16,20,0.08), 0 8px 24px rgba(16,16,20,0.08)",
      },
    },
  },
  plugins: [],
};
export default config;
