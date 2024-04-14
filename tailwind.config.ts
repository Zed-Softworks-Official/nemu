import type { Config } from 'tailwindcss'

const config = {
    darkMode: ['class'],
    content: [
        './pages/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './app/**/*.{ts,tsx}',
        './src/**/*.{ts,tsx}'
    ],
    prefix: '',
    theme: {
        container: {
            center: true,
            padding: '2rem',
            screens: {
                '2xl': '1400px'
            }
        },
        extend: {
            // colors: {
            //     border: 'hsl(var(--border))',
            //     input: 'hsl(var(--input))',
            //     ring: 'hsl(var(--ring))',
            //     background: 'hsl(var(--background))',
            //     foreground: 'hsl(var(--foreground))',
            //     primary: {
            //         DEFAULT: 'hsl(var(--primary))',
            //         foreground: 'hsl(var(--primary-foreground))'
            //     },
            //     secondary: {
            //         DEFAULT: 'hsl(var(--secondary))',
            //         foreground: 'hsl(var(--secondary-foreground))'
            //     },
            //     destructive: {
            //         DEFAULT: 'hsl(var(--destructive))',
            //         foreground: 'hsl(var(--destructive-foreground))'
            //     },
            //     muted: {
            //         DEFAULT: 'hsl(var(--muted))',
            //         foreground: 'hsl(var(--muted-foreground))'
            //     },
            //     accent: {
            //         DEFAULT: 'hsl(var(--accent))',
            //         foreground: 'hsl(var(--accent-foreground))'
            //     },
            //     popover: {
            //         DEFAULT: 'hsl(var(--popover))',
            //         foreground: 'hsl(var(--popover-foreground))'
            //     },
            //     card: {
            //         DEFAULT: 'hsl(var(--card))',
            //         foreground: 'hsl(var(--card-foreground))'
            //     }
            // },
            // borderRadius: {
            //     lg: 'var(--radius)',
            //     md: 'calc(var(--radius) - 2px)',
            //     sm: 'calc(var(--radius) - 4px)'
            // },
            keyframes: {
                'accordion-down': {
                    from: { height: '0' },
                    to: { height: 'var(--radix-accordion-content-height)' }
                },
                'accordion-up': {
                    from: { height: 'var(--radix-accordion-content-height)' },
                    to: { height: '0' }
                }
            },
            animation: {
                'accordion-down': 'accordion-down 0.2s ease-out',
                'accordion-up': 'accordion-up 0.2s ease-out'
            }
        }
    },
    daisyui: {
        themes: [
            {
                dark: {
                    primary: '#2185d5',
                    secondary: '#0e90f9',
                    accent: '#ffffff',
                    neutral: '#0e90f9',
                    'base-100': '#333333',
                    info: '#1B72BA',
                    success: '#1ece53',
                    warning: '#e2ef2b',
                    error: '#d82750'
                },
                light: {
                    primary: '#2185d5',
                    secondary: '#0e90f9',
                    accent: '#ffffff',
                    neutral: '#0e90f9',
                    'base-100': '#f3f3f3',
                    info: '#1B72BA',
                    success: '#1ece53',
                    warning: '#e2ef2b',
                    error: '#d82750'
                }
            }
        ],
        darkTheme: 'dark', // name of one of the included themes for dark mode
        base: true, // applies background color and foreground color for root element by default
        styled: true, // include daisyUI colors and design decisions for all components
        utils: true, // adds responsive and modifier utility classes
        prefix: '', // prefix for daisyUI classnames (components, modifiers and responsive class names. Not colors)
        logs: false, // Shows info about daisyUI version and used config in the console when building your CSS
        themeRoot: ':root' // The element that receives theme color CSS variables
    },
    plugins: [require('tailwindcss-animate'), require('daisyui')]
} satisfies Config

export default config
