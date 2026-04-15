#!/bin/bash

# TimeSync Phase 1 - Complete Frontend File Generator
# Creates ALL frontend files matching the wireframe

set -e

echo "🎨 Creating all frontend files..."

cd "$(dirname "$0")/frontend"

# Create directory structure
mkdir -p src/app/\(auth\)/login
mkdir -p src/app/\(dashboard\)/timesheet
mkdir -p src/components/{layout,ui}
mkdir -p src/{lib,store,types}

# ============================================
# package.json
# ============================================
cat > package.json << 'ENDOFFILE'
{
  "name": "timesync-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.1.0",
    "react": "^18",
    "react-dom": "^18",
    "axios": "^1.6.7",
    "zustand": "^4.5.0",
    "lucide-react": "^0.323.0",
    "clsx": "^2.1.0",
    "date-fns": "^3.3.1"
  },
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.0.1",
    "postcss": "^8",
    "tailwindcss": "^3.3.0",
    "eslint": "^8",
    "eslint-config-next": "14.1.0"
  }
}
ENDOFFILE

# ============================================
# tsconfig.json
# ============================================
cat > tsconfig.json << 'ENDOFFILE'
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
ENDOFFILE

# ============================================
# next.config.js
# ============================================
cat > next.config.js << 'ENDOFFILE'
/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig
ENDOFFILE

# ============================================
# tailwind.config.ts
# ============================================
cat > tailwind.config.ts << 'ENDOFFILE'
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0f",
        foreground: "#ffffff",
      },
    },
  },
  plugins: [],
};
export default config;
ENDOFFILE

# ============================================
# postcss.config.js
# ============================================
cat > postcss.config.js << 'ENDOFFILE'
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
ENDOFFILE

# ============================================
# .env.local
# ============================================
cat > .env.local << 'ENDOFFILE'
NEXT_PUBLIC_API_URL=http://localhost:8000
ENDOFFILE

echo "✅ Configuration files created!"
echo ""
echo "Next: Run npm install to install dependencies"
