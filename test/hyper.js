// Harness deps
import { default as appExpress } from 'https://x.nest.land/hyper-app-express@1.0.0/mod.ts'
import { default as core } from 'https://x.nest.land/hyper@3.4.2/mod.js'

import redis from '../mod.js'

const hyperConfig = {
  app: appExpress,
  adapters: [
    { port: 'cache', plugins: [redis({ hostname: '127.0.0.1', port: 6379 })] },
  ],
}

core(hyperConfig)
