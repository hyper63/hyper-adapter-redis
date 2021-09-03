// Harness deps
import { default as appOpine } from "https://x.nest.land/hyper-app-opine@1.2.3/mod.js";
import { default as core } from "https://x.nest.land/hyper@1.4.6/mod.js";

import redis from "../mod.js";

const hyperConfig = {
  app: appOpine,
  adapters: [
    { port: 'cache', plugins: [redis({ hostname: '127.0.0.1', port: 6379 })] },
  ],
};

core(hyperConfig);