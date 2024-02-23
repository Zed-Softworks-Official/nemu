import type { Config } from 'tailwindcss'

const config: Config = {
    content: ['./pages/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}', './app/**/*.{js,ts,jsx,tsx,mdx}'],
    theme: {
        colors: {
            white: '#f3f3f3',
            charcoal: '#333333',
            primarylight: '#0e90f9',
            azure: '#1B72BA'
        },
        extend: {
            fontFamily: {
                nunito: ['nunito', 'sans']
            },
            animation: {
                'pop-in': 'button-pop 0.25s ease-out'
            }
        }
    },
    daisyui: {
        themes: [
            {
                'nemu-dark': {
                    primary: '#2185d5',
                    secondary: '#0e90f9',
                    accent: '#ffffff',
                    neutral: '#0e90f9',
                    'base-100': '#333333',
                    info: '#1B72BA',
                    success: '#1ece53',
                    warning: '#e2ef2b',
                    error: '#d82750'
                }
            },
            'light'
        ],
        darkTheme: 'nemu-dark', // name of one of the included themes for dark mode
        base: true, // applies background color and foreground color for root element by default
        styled: true, // include daisyUI colors and design decisions for all components
        utils: true, // adds responsive and modifier utility classes
        prefix: '', // prefix for daisyUI classnames (components, modifiers and responsive class names. Not colors)
        logs: false, // Shows info about daisyUI version and used config in the console when building your CSS
        themeRoot: ':root' // The element that receives theme color CSS variables
    },
    darkMode: 'class',
    plugins: [require('@tailwindcss/typography'), require('daisyui'), require('tailwind-scrollbar')]
}
export default config
