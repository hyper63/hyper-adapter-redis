import { assert, assertEquals, pluginFactory } from './dev_deps.js'

import RedisCacheAdapter from './mod.js'

const resolves = (val) => () => Promise.resolve(val)

const baseStubClient = {
  get: resolves(),
  mget: resolves(),
  set: resolves(),
  del: resolves(),
  keys: resolves(),
  scan: resolves(),
}

const options = {
  url: 'http://user:pass@redis.url:6379',
  client: { connect: resolves({ foo: 'bar' }) },
}

Deno.test('mod', async (t) => {
  await t.step('validate factory schema', () => {
    assert(pluginFactory(RedisCacheAdapter(options)))
  })

  await t.step('load', async (t) => {
    await t.step('returns a redis client', async () => {
      const res = await RedisCacheAdapter(options).load()

      assert(res.redis)
      assertEquals(res.redis.foo, 'bar')
    })

    await t.step('returns a redis cluster client using the host name and port', async () => {
      const res = await RedisCacheAdapter({
        hostname: 'foo',
        port: 6380,
        client: {
          connect: (config) => Promise.resolve(config),
        },
        cluster: true,
      }).load()

      assert(res.redis)
      assertEquals(res.redis.nodes[0].hostname, 'foo')
      assertEquals(res.redis.nodes[0].port, 6380)
    })

    await t.step('returns options', async (t) => {
      await t.step('with defaults', async () => {
        const withDefault = await RedisCacheAdapter(options).load()

        assertEquals(withDefault.scanCount, 10000)
      })

      await t.step('without defaults', async () => {
        const withoutDefault = await RedisCacheAdapter({
          ...options,
          // Pass in scan count through config
          scanCount: 111,
        }).load()

        assertEquals(withoutDefault.scanCount, 111)
      })
    })
  })

  await t.step('link', async (t) => {
    await t.step('returns an adapter', () => {
      const res = RedisCacheAdapter().link({
        redis: baseStubClient,
        scanCount: 101,
      })()
      assert(res.createStore)
    })
  })
})
