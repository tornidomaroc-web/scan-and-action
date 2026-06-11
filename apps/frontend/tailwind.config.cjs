module.exports = {
  // The theme toggle (Sidebar) and the index.html boot script drive a `dark`
  // class on <html>; without this, Tailwind `dark:` styles follow the OS
  // instead and the toggle only half-works.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }
    },
  },
  plugins: [],
}
