// Harness deps
import { default as appExpress } from 'https://raw.githubusercontent.com/hyper63/hyper/hyper-app-express%40v1.1.0/packages/app-express/mod.ts'
import { default as core } from 'https://raw.githubusercontent.com/hyper63/hyper/hyper%40v4.1.0/packages/core/mod.ts'

import redis from '../mod.js'

const hyperConfig = {
  app: appExpress,
  adapters: [
    { port: 'cache', plugins: [redis({ url: 'http://127.0.0.1:6379' })] },
  ],
}

core(hyperConfig)
