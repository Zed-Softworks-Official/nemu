import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    colors: {
      white: '#f3f3f3',
      charcoal: '#333333',
      primarylight: '#0e90f9',
      primary: '#2185d5',
      azure: '#1B72BA',
      fullwhite: '#fff',
      fullblack: '#262626',
      error: '#d82750'
    },
    extend: {
      fontFamily: {
        'nunito': ['nunito', 'sans']
      }
    },
  },
  darkMode: 'class',
  plugins: [],
}
export default config
