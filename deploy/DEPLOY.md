# MoneyMind — Complete Deployment Guide
# Railway (API + DB + Redis) + Vercel (Next.js) + EAS (React Native)

## ภาพรวม Infrastructure

```
                    ┌──────────────────────────────────┐
                    │         Supabase (managed)        │
                    │  PostgreSQL · Auth · Storage · RT  │
                    └────────────────┬─────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────┐
          │                          │                       │
   ┌──────▼──────┐           ┌───────▼──────┐      ┌───────▼──────┐
   │   Railway   │           │    Vercel    │      │  EAS Build   │
   │  Node.js API│           │  Next.js Web │      │ React Native │
   │  Redis cache│           │  Dashboard   │      │  iOS/Android │
   └─────────────┘           └──────────────┘      └──────────────┘
```

---

## 1. RAILWAY — Node.js API + Redis

### ติดตั้ง Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### สร้าง Project

```bash
cd moneymind-api
railway init
# เลือก "Empty Project" แล้วตั้งชื่อ "moneymind-api"
```

### เพิ่ม Redis

```bash
# ใน Railway Dashboard → Add Service → Database → Redis
# หรือ via CLI:
railway add --service redis
```

### ตั้ง Environment Variables

```bash
# ตั้งทีละตัวด้วย CLI
railway variables set NODE_ENV=production
railway variables set PORT=3001
railway variables set API_VERSION=v1
railway variables set LOG_LEVEL=info

# Supabase (copy จาก Supabase dashboard)
railway variables set SUPABASE_URL="https://xxxx.supabase.co"
railway variables set SUPABASE_SERVICE_ROLE_KEY="eyJ..."

# Database — ใช้ Supabase PostgreSQL (อย่าสร้าง Railway DB แยก เพื่อ RLS)
railway variables set DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

# Redis — Railway จะ inject REDIS_URL ให้อัตโนมัติถ้า link service

# Security
railway variables set JWT_SECRET="$(openssl rand -base64 48)"
railway variables set JWT_EXPIRES_IN="7d"

# CORS — ใส่ทั้ง local และ production
railway variables set CORS_ORIGINS="http://localhost:3000,https://moneymind.vercel.app"

# AI/OCR
railway variables set ANTHROPIC_API_KEY="sk-ant-..."
railway variables set GOOGLE_CLOUD_API_KEY="AIzaSy..."
```

### ตั้ง Build + Start commands ใน railway.json

```bash
cat > railway.json << 'EOF'
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/server.js",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
EOF
```

### Deploy

```bash
railway up
# หรือ link GitHub repo เพื่อ auto-deploy on push:
railway link
```

### ตรวจสอบ

```bash
# Get your Railway URL
railway domain

# Test health endpoint
curl https://moneymind-api-production.up.railway.app/health
# Expected: {"status":"ok","ts":"...","version":"v1"}

# View logs
railway logs
```

---

## 2. VERCEL — Next.js Web Dashboard

### ติดตั้ง Vercel CLI

```bash
npm install -g vercel
vercel login
```

### Deploy

```bash
cd moneymind-web   # Next.js project root
vercel

# Follow prompts:
# - Link to existing project? N
# - Project name: moneymind
# - Root directory: ./
# - Build command: next build
# - Output directory: .next
```

### ตั้ง Environment Variables

```bash
# Public (exposed to browser)
vercel env add NEXT_PUBLIC_SUPABASE_URL
# → paste: https://xxxx.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
# → paste: eyJ...

vercel env add NEXT_PUBLIC_APP_URL
# → paste: https://moneymind.vercel.app

vercel env add NEXT_PUBLIC_API_URL
# → paste: https://moneymind-api-production.up.railway.app/api/v1

# Server-side (secret)
vercel env add SUPABASE_URL
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add NEXTAUTH_SECRET   # openssl rand -base64 32
vercel env add NEXTAUTH_URL      # https://moneymind.vercel.app
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add GITHUB_CLIENT_ID
vercel env add GITHUB_CLIENT_SECRET
vercel env add ANTHROPIC_API_KEY
```

### vercel.json

```json
{
  "framework": "nextjs",
  "buildCommand": "next build",
  "devCommand": "next dev",
  "installCommand": "npm install",
  "regions": ["sin1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Access-Control-Allow-Credentials", "value": "true" },
        { "key": "Access-Control-Allow-Origin",      "value": "*"    }
      ]
    }
  ]
}
```

### Production Deploy

```bash
vercel --prod

# หรือ link GitHub → auto-deploy on push to main:
vercel link
```

### ตรวจสอบ

```bash
vercel ls          # list deployments
vercel logs        # view logs
vercel inspect <url>  # deployment details
```

---

## 3. EAS BUILD — React Native (iOS + Android)

### ติดตั้ง EAS CLI

```bash
npm install -g eas-cli
eas login
```

### Initialize EAS

```bash
cd moneymind-mobile
eas init --id <your-expo-project-id>
```

### ตั้ง eas.json

```json
{
  "cli": {
    "version": ">= 10.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "ios":     { "simulator": true  }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "channel": "preview"
    },
    "production": {
      "android": { "buildType": "app-bundle" },
      "ios":     { "credentialsSource": "remote" },
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "internal"
      },
      "ios": {
        "appleId": "your@email.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      }
    }
  }
}
```

### Environment Variables สำหรับ Expo

```bash
# .env ใน root (Expo จะ inject EXPO_PUBLIC_* ให้อัตโนมัติ)
cat > .env << 'EOF'
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_API_URL=https://moneymind-api-production.up.railway.app/api/v1
EOF

# Set EAS secrets (สำหรับ build-time)
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://xxxx.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "eyJ..."
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://moneymind-api-production.up.railway.app/api/v1"
```

### Build Android APK (preview)

```bash
eas build --platform android --profile preview

# Track build progress:
eas build:list

# Download APK เมื่อ build เสร็จ:
eas build:view  # จะแสดง download URL
```

### Build iOS Simulator

```bash
eas build --platform ios --profile development
```

### Build Production (App Bundle + IPA)

```bash
# Android
eas build --platform android --profile production

# iOS (ต้องมี Apple Developer Account $99/ปี)
eas build --platform ios --profile production
```

### Submit to Stores

```bash
# Google Play (ต้องมี service account JSON)
eas submit --platform android

# App Store
eas submit --platform ios
```

---

## 4. SUPABASE Edge Functions Deploy

```bash
# ติดตั้ง Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref xxxxxxxxxxxxxxxxxxxx

# Set secrets
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set GOOGLE_CLOUD_API_KEY=AIzaSy...

# Deploy Edge Functions
supabase functions deploy ocr-receipt          --no-verify-jwt
supabase functions deploy ai-financial-chat    --no-verify-jwt
supabase functions deploy verify-slip          --no-verify-jwt

# ตรวจสอบ
supabase functions list
```

---

## 5. GitHub Actions — CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy MoneyMind

on:
  push:
    branches: [main]

env:
  RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
  VERCEL_TOKEN:  ${{ secrets.VERCEL_TOKEN }}

jobs:
  # ── Deploy API to Railway ─────────────────────────────────
  deploy-api:
    name: Deploy API → Railway
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./moneymind-api

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: moneymind-api/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Type-check
        run: npx tsc --noEmit

      - name: Build
        run: npm run build

      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway up --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}

  # ── Deploy Web to Vercel ──────────────────────────────────
  deploy-web:
    name: Deploy Web → Vercel
    runs-on: ubuntu-latest
    needs: deploy-api
    defaults:
      run:
        working-directory: ./moneymind-web

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: moneymind-web/package-lock.json

      - name: Install Vercel CLI
        run: npm install -g vercel@latest

      - name: Pull Vercel settings
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}

      - name: Build project
        run: vercel build --prod --token=${{ secrets.VERCEL_TOKEN }}

      - name: Deploy to Vercel
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}

  # ── Deploy Supabase Edge Functions ────────────────────────
  deploy-functions:
    name: Deploy Edge Functions → Supabase
    runs-on: ubuntu-latest
    if: contains(github.event.head_commit.message, '[deploy-functions]')

    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Deploy functions
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
          supabase functions deploy ocr-receipt
          supabase functions deploy ai-financial-chat
          supabase functions deploy verify-slip
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### GitHub Secrets ที่ต้องตั้ง

```bash
# Settings → Secrets → Actions → New repository secret

RAILWAY_TOKEN           # railway whoami --token
VERCEL_TOKEN            # vercel tokens create ci
VERCEL_ORG_ID           # vercel env pull → ดูใน .vercel/project.json
VERCEL_PROJECT_ID       # same
SUPABASE_PROJECT_REF    # xxxxxxxxxxxxxxxxxxxx (จาก URL)
SUPABASE_ACCESS_TOKEN   # supabase.com → Account → Access Tokens
```

---

## 6. Custom Domain Setup

### Vercel (Web)

```bash
vercel domains add moneymind.app
# หรือ subdomain:
vercel domains add app.moneymind.app

# ทำตาม instructions เพื่อ add CNAME/A record ใน DNS
```

### Railway (API)

```bash
railway domain --service api
# จะได้ subdomain Railway ให้เลือก custom domain ได้ใน dashboard
```

---

## 7. Post-Deploy Checklist

```bash
# ── API Health ───────────────────────────────────
curl https://your-api.up.railway.app/health
# → {"status":"ok","version":"v1"}

# ── Test Auth ────────────────────────────────────
curl -H "Authorization: Bearer <supabase_jwt>" \
  https://your-api.up.railway.app/api/v1/auth/me

# ── Test Transaction ─────────────────────────────
curl -X POST \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"type":"expense","amount":65,"merchant":"7-Eleven"}' \
  https://your-api.up.railway.app/api/v1/transactions

# ── Web ──────────────────────────────────────────
open https://moneymind.vercel.app

# ── Supabase Functions ───────────────────────────
curl https://xxxx.supabase.co/functions/v1/ocr-receipt \
  -H "Authorization: Bearer <anon_key>" \
  -d '{"receipt_id":"...","user_id":"..."}'
```

---

## 8. Monitoring & Costs

| Service | Free tier | Cost (production) |
|---------|-----------|-------------------|
| Railway | $5 credit/mo | ~$10-20/mo (API + Redis) |
| Vercel | 100GB bandwidth | Free (hobby) / $20/mo (pro) |
| Supabase | 500MB DB, 2GB storage | Free / $25/mo (pro) |
| EAS Build | 30 builds/mo | Free / $99/mo (production) |
| **Total** | **~$0 dev** | **~$55-65/mo production** |

### Railway Cost Optimization

```bash
# Scale down when inactive (dev environment)
railway service update --sleep-application true

# Monitor usage
railway metrics
```
