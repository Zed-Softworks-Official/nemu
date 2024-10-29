import { withUt } from 'uploadthing/tw'

export default withUt({
    darkMode: ['class'],
    content: [
        './pages/**/*.{ts,tsx}',
        './components/**/*.{ts,tsx}',
        './app/**/*.{ts,tsx}',
        './src/**/*.{ts,tsx}'
    ],
    prefix: '',
    theme: {
    	extend: {
    		keyframes: {
    			'accordion-down': {
    				from: {
    					height: '0'
    				},
    				to: {
    					height: 'var(--radix-accordion-content-height)'
    				}
    			},
    			'accordion-up': {
    				from: {
    					height: 'var(--radix-accordion-content-height)'
    				},
    				to: {
    					height: '0'
    				}
    			}
    		},
    		animation: {
    			'accordion-down': 'accordion-down 0.2s ease-out',
    			'accordion-up': 'accordion-up 0.2s ease-out',
    			'pop-in': 'button-pop 0.2s ease-in-out'
    		},
    		colors: {
    			sidebar: {
    				DEFAULT: 'hsl(var(--sidebar-background))',
    				foreground: 'hsl(var(--sidebar-foreground))',
    				primary: 'hsl(var(--sidebar-primary))',
    				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
    				accent: 'hsl(var(--sidebar-accent))',
    				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
    				border: 'hsl(var(--sidebar-border))',
    				ring: 'hsl(var(--sidebar-ring))'
    			}
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
})
