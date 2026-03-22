// src/server.ts
import 'dotenv/config'
import { createApp } from './app'
import { env }       from './config/env'
import { logger }    from './config/logger'
import { db }        from './config/database'
import { cache }     from './config/cache'

async function bootstrap() {
  // Verify DB + cache connections
  await db.query('SELECT 1')
  logger.info('✓ PostgreSQL connected')

  await cache.ping()
  logger.info('✓ Redis connected')

  const app = createApp()
  const server = app.listen(env.PORT, () => {
    logger.info(`◈ MoneyMind API v${env.API_VERSION} running on :${env.PORT} [${env.NODE_ENV}]`)
  })

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down gracefully`)
    server.close(async () => {
      await db.end()
      await cache.quit()
      logger.info('Server closed.')
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

bootstrap().catch((err) => {
  logger.error('Fatal startup error:', err)
  process.exit(1)
})


// ─────────────────────────────────────────────────────────────
// src/config/env.ts
// ─────────────────────────────────────────────────────────────
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:      z.enum(['development', 'production', 'test']).default('development'),
  PORT:          z.coerce.number().default(3001),
  API_VERSION:   z.string().default('v1'),

  DATABASE_URL:  z.string().min(1),
  REDIS_URL:     z.string().default('redis://localhost:6379'),

  SUPABASE_URL:              z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  JWT_SECRET:    z.string().min(32),
  JWT_EXPIRES_IN:z.string().default('7d'),

  CORS_ORIGINS:  z.string().transform(s =>
    s.split(',').map(o => o.trim()).filter(Boolean)
  ).default('http://localhost:3000'),

  ANTHROPIC_API_KEY:   z.string().optional(),
  GOOGLE_CLOUD_API_KEY:z.string().optional(),

  UPLOAD_MAX_MB: z.coerce.number().default(10),
  LOG_LEVEL:     z.enum(['error','warn','info','http','debug']).default('info'),
})

export const env = envSchema.parse(process.env)
export type Env  = z.infer<typeof envSchema>


// ─────────────────────────────────────────────────────────────
// src/config/logger.ts
// ─────────────────────────────────────────────────────────────
import winston                from 'winston'
import DailyRotateFile        from 'winston-daily-rotate-file'

const { combine, timestamp, printf, colorize, errors } = winston.format

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    `${timestamp} ${level}: ${stack ?? message}`
  )
)

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
)

const isProduction = process.env.NODE_ENV === 'production'

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: isProduction ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    ...(isProduction ? [
      new DailyRotateFile({
        filename:    'logs/error-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        level:       'error',
        maxFiles:    '14d',
        zippedArchive: true,
      }),
      new DailyRotateFile({
        filename:    'logs/combined-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles:    '7d',
        zippedArchive: true,
      }),
    ] : []),
  ],
})


// ─────────────────────────────────────────────────────────────
// src/config/database.ts  — PostgreSQL pool via pg
// ─────────────────────────────────────────────────────────────
import { Pool } from 'pg'

let _db: Pool | null = null

export function getDb(): Pool {
  if (!_db) {
    _db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:  process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max:  20,
      idleTimeoutMillis:    30_000,
      connectionTimeoutMillis: 5_000,
    })
    _db.on('error', (err) => {
      console.error('PostgreSQL pool error:', err)
    })
  }
  return _db
}

export const db = getDb()


// ─────────────────────────────────────────────────────────────
// src/config/cache.ts  — Redis client
// ─────────────────────────────────────────────────────────────
import { createClient } from 'redis'

const redisClient = createClient({
  url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 5_000) },
})

redisClient.on('error', (err) => console.error('Redis error:', err))
redisClient.on('connect', () => console.log('Redis connected'))

// Auto-connect
redisClient.connect().catch(console.error)

export const cache = redisClient

// Helper wrappers
export async function cacheGet<T>(key: string): Promise<T | null> {
  const val = await cache.get(key)
  return val ? JSON.parse(val) : null
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  await cache.setEx(key, ttlSeconds, JSON.stringify(value))
}

export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length) await cache.del(keys)
}
