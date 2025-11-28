/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{html,ts}",
    ],
    theme: {
        extend: {
            colors: {
                // Colores personalizados para SupplyFlow
                'logistics-blue': '#1e40af',
                'logistics-dark': '#0f172a',
            },
        },
    },
    plugins: [],
}