# hyper-adapter-redis

[![nest badge](https://nest.land/badge.svg)](https://nest.land/package/hyper-adapter-redis)
[![current version](https://img.shields.io/github/tag/hyper63/hyper-adapter-redis)](https://github.com/hyper63/hyper-adapter-redis/tags/)
[![test status](https://github.com/hyper63/hyper-adapter-redis/workflows/.github/workflows/test.yml/badge.svg)](https://github.com/hyper63/hyper-adapter-redis/actions/workflows/test.yml)

This adapter works for the 'cache' port.

## Install

```sh
npm install @hyper63/adapter-redis
```

## Environment Variables

```sh
REDIS_URL="https://redis:6379"
```

## Configuration

hyper63.config.js

```js
const redis = require('@hyper63/adapter-redis')

module.exports = {
  ...
  adapters: [
    {port: 'cache', plugins: [redis({url: process.env.REDIS_URL})]}
  ]
}
```
