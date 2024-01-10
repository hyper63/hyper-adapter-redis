import { R } from './deps.js'
import { assert, assertEquals, assertObjectMatch, cachePort, spy } from './dev_deps.js'

import factory from './adapter.js'

const resolves = (val) => () => Promise.resolve(val)

const baseStubClient = {
  get: resolves(),
  set: resolves(),
  del: resolves(),
  scan: resolves(),
  mget: resolves(),
}

const scanCount = 2
const createAdapter = (redis) => cachePort(factory({ redis, scanCount, hashSlot: true }))

Deno.test('adapter', async (t) => {
  await t.step('listDocs', async (t) => {
    const stubScan = (count) => {
      const results = []
      for (let i = 0; i < count; i++) results.push(`key${i}`)

      const scans = R.splitEvery(2, results.reverse())
        .map((v, index) => [`${index * v.length}`, v])
        .reverse()
      const scan = spy(() => Promise.resolve(scans.shift()))

      return scan
    }

    await t.step('with no hashSlot', async (t) => {
      const createAdapter = (redis) => cachePort(factory({ redis, scanCount, hashSlot: false }))

      await t.step('should return the results of the scan', async () => {
        const count = 100
        const scan = stubScan(count)

        const adapter = createAdapter({
          ...baseStubClient,
          get: resolves(JSON.stringify({ bam: 'baz' })),
          scan,
        })

        const res = await adapter.listDocs({
          store: 'word',
          pattern: '*',
        })

        assertEquals(scan.calls.length, count / scanCount)
        assertObjectMatch(scan.calls[0].args, [0, {
          pattern: 'word_*',
          count: scanCount,
        }])
        assertObjectMatch(scan.calls[1].args, [`${count - scanCount}`, {
          pattern: 'word_*',
          count: scanCount,
        }])
        assert(res.docs.length === count)
      })

      await t.step('should return all of the docs', async () => {
        const doc = { bam: 'baz' }

        const adapter = createAdapter({
          ...baseStubClient,
          get: resolves(JSON.stringify(doc)),
          scan: resolves(['0', ['key']]),
        })

        const result = await adapter.listDocs({
          store: 'foo',
          pattern: '*',
        })

        assert(result.ok)
        assertEquals(result.docs.length, 1)
        assertObjectMatch(result.docs[0].value, doc)
      })
    })

    await t.step('with hasSlot', async (t) => {
      const createAdapter = (redis) => cachePort(factory({ redis, scanCount, hashSlot: true }))

      await t.step('should return the results of the scan', async () => {
        const count = 100
        const scan = stubScan(100)

        const adapter = createAdapter({
          ...baseStubClient,
          mget: resolves([JSON.stringify({ bam: 'baz' }), JSON.stringify({ bam: 'baz' })]),
          scan,
        })

        const res = await adapter.listDocs({
          store: 'word',
          pattern: '*',
        })

        assertEquals(scan.calls.length, count / scanCount)
        assertObjectMatch(scan.calls[0].args, [0, {
          pattern: '{word}_*',
          count: scanCount,
        }])
        assertObjectMatch(scan.calls[1].args, [`${count - scanCount}`, {
          pattern: '{word}_*',
          count: scanCount,
        }])
        assert(res.docs.length === count)
      })

      await t.step('should return all of the docs', async () => {
        const doc = { bam: 'baz' }

        const adapter = createAdapter({
          ...baseStubClient,
          mget: resolves([JSON.stringify(doc)]),
          scan: resolves(['0', ['key']]),
        })

        const result = await adapter.listDocs({
          store: 'foo',
          pattern: '*',
        })

        assert(result.ok)
        assertEquals(result.docs.length, 1)
        assertObjectMatch(result.docs[0].value, doc)
      })
    })
  })

  await t.step('createStore', async (t) => {
    await t.step('should create a logical keyspace in redis', async () => {
      const adapter = createAdapter(baseStubClient)

      const result = await adapter.createStore('foo')
      assert(result.ok)
    })

    await t.step('* doc - no store exists', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: resolves(undefined), // looking up store produces undefined
      })

      const err = await adapter.createDoc({
        store: 'foo',
        key: 'bar',
        value: { foo: 'bar', ttl: String(30000) },
      })

      assertObjectMatch(err, {
        ok: false,
        status: 400,
        msg: 'Store does not exist',
      })
    })
  })

  await t.step('destroyStore', async (t) => {
    await t.step('should remove the logical keyspace if no keys exist', async () => {
      const del = spy(() => Promise.resolve(2))
      const adapter = createAdapter({
        ...baseStubClient,
        del,
        scan: resolves(['0', []]),
      })

      const result = await adapter.destroyStore('foo')

      assertEquals(del.calls.length, 1)
      assertObjectMatch(del.calls[0], { args: ['store_foo'] })
      assert(result.ok)
    })

    await t.step('with no hashSlot', async (t) => {
      const createAdapter = (redis) => cachePort(factory({ redis, scanCount, hashSlot: false }))

      await t.step(
        'should remove the keys in the logical keyspace, then remove the logical keyspace',
        async () => {
          const del = spy(() => Promise.resolve(2))
          const adapter = createAdapter({
            ...baseStubClient,
            del,
            scan: resolves(['0', ['foo_baz', 'foo_bar']]),
          })

          const result = await adapter.destroyStore('foo')

          assert(result.ok)
          assertObjectMatch(del.calls[0], { args: ['foo_baz'] })
          assertObjectMatch(del.calls[1], { args: ['foo_bar'] })
          assertObjectMatch(del.calls[2], { args: ['store_foo'] })
        },
      )
    })

    await t.step('with hashSlot', async (t) => {
      const createAdapter = (redis) => cachePort(factory({ redis, scanCount, hashSlot: true }))

      await t.step(
        'should remove the keys in the logical keyspace, then remove the logical keyspace',
        async () => {
          const del = spy(() => Promise.resolve(2))
          const adapter = createAdapter({
            ...baseStubClient,
            del,
            scan: resolves(['0', ['{foo}_baz', '{foo}_bar']]),
          })

          const result = await adapter.destroyStore('foo')

          assert(result.ok)
          assertObjectMatch(del.calls[0], { args: ['{foo}_baz', '{foo}_bar'] })
          assertObjectMatch(del.calls[1], { args: ['store_foo'] })
        },
      )
    })
  })

  await t.step('createDoc', async (t) => {
    await t.step('should save the doc in redis as serialized JSON', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        set: (k, v, opts) => {
          assertEquals(k, '{foo}_bar')
          assertEquals(v, JSON.stringify({ bam: 'baz' }))
          assertObjectMatch(opts, { px: 5000 })
          return Promise.resolve('OK')
        },
        get: (k) =>
          k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ active: true }))
            : Promise.resolve(null),
      })

      const result = await adapter.createDoc({
        store: 'foo',
        key: 'bar',
        value: { bam: 'baz' },
        ttl: String(5000),
      })

      assert(result.ok)
      assertEquals(result.doc, { bam: 'baz' })
    })

    await t.step(
      'should return a HyperErr with status 409, if the key already exists',
      async () => {
        const adapter = createAdapter({
          ...baseStubClient,
          get: (k) =>
            k === 'store_foo'
              ? Promise.resolve(JSON.stringify({ active: true })) // store
              : Promise.resolve(JSON.stringify({ foo: 'bar' })), // doc already exists
        })

        const err = await adapter.createDoc({
          store: 'foo',
          key: 'bar',
          value: { bam: 'baz' },
          ttl: String(5000),
        })

        assertObjectMatch(err, {
          ok: false,
          status: 409,
          msg: 'Document Conflict',
        })
      },
    )

    await t.step(
      'should immediately expire by setting a 0 px when provided ttl is negative',
      async () => {
        const adapter = createAdapter({
          ...baseStubClient,
          set: (_k, _v, opts) => {
            assertEquals(opts.px, 1)
            return Promise.resolve('OK')
          },
          get: (k) =>
            k === 'store_foo'
              ? Promise.resolve(JSON.stringify({ foo: 'bar' }))
              : Promise.resolve(undefined), // not found
        })

        await adapter.createDoc({
          store: 'foo',
          key: 'bar',
          value: { bam: 'baz' },
          ttl: String(-100),
        })

        const result = await adapter.getDoc({
          store: 'foo',
          key: 'bar',
        })

        assertObjectMatch(result, {
          ok: false,
          status: 404,
          msg: 'document not found',
        })
      },
    )
  })

  await t.step('getDoc', async (t) => {
    await t.step('should retrieve and parse the doc as JSON', async () => {
      const value = { bam: 'baz' }
      const adapter = createAdapter({
        ...baseStubClient,
        // serialized JSON
        get: (k) => {
          return k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ active: true })) // store
            : (assertEquals(k, '{foo}_bar'), Promise.resolve(JSON.stringify(value)))
        },
      })

      const result = await adapter.getDoc({
        store: 'foo',
        key: 'bar',
      })

      assertObjectMatch(result, value)
    })

    await t.step('should return a HyperErr with status of 404 if key is not found', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: (k) =>
          k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ foo: 'bar' }))
            : Promise.resolve(undefined),
      })

      const err = await adapter.getDoc({
        store: 'foo',
        key: 'bar',
      })

      assertObjectMatch(err, {
        ok: false,
        status: 404,
        msg: 'document not found',
      })
    })
  })

  await t.step('updateDoc', async (t) => {
    await t.step('should upsert the doc into Redis as serialized JSON', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        set: (k, v, opts) => {
          assertEquals(k, '{foo}_bar')
          assertEquals(v, JSON.stringify({ hello: 'world' }))
          assertObjectMatch(opts, { px: 123 })
          return Promise.resolve('OK')
        },
        get: (k) =>
          k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ active: true }))
            : Promise.resolve(undefined),
      })

      const result = await adapter.updateDoc({
        store: 'foo',
        key: 'bar',
        value: { hello: 'world' },
        ttl: String(123),
      })
      assert(result.ok)
    })

    await t.step(
      'should immediately expire by setting a 0 px when provided ttl is negative',
      async () => {
        const adapter = createAdapter({
          ...baseStubClient,
          set: (_k, _v, opts) => {
            assertEquals(opts.px, 1)
            return Promise.resolve('OK')
          },
          get: (k) =>
            k === 'store_foo'
              ? Promise.resolve(JSON.stringify({ foo: 'bar' }))
              : Promise.resolve(undefined), // not found
        })

        await adapter.updateDoc({
          store: 'foo',
          key: 'bar',
          value: { bam: 'baz' },
          ttl: String(-100),
        })

        const result = await adapter.getDoc({
          store: 'foo',
          key: 'bar',
        })

        assertObjectMatch(result, {
          ok: false,
          status: 404,
          msg: 'document not found',
        })
      },
    )
  })

  await t.step('deleteDoc', async (t) => {
    await t.step('should remove the key from redis', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: (k) => k === 'store_foo' ? Promise.resolve('{"active": true}') : Promise.resolve(null),
      })

      const result = await adapter.deleteDoc({
        store: 'foo',
        key: 'bar',
      })

      assert(result.ok)
    })
  })
})
