import { loadEnv, defineConfig } from '@medusajs/framework/utils'


loadEnv(process.env.NODE_ENV || 'development', process.cwd())


console.log("DATABASE_URL:", process.env.DATABASE_URL)
console.log("REDIS_URL:", process.env.REDIS_URL || process.env.redisUrl)

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  }
})
