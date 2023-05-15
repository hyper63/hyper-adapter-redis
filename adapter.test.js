import {
  assert,
  assertEquals,
  assertObjectMatch,
  spy,
  validateCacheAdapterSchema,
} from './dev_deps.js'

import createAdapter from './adapter.js'

const resolves = (val) => () => Promise.resolve(val)

const baseStubClient = {
  get: resolves(),
  set: resolves(),
  del: resolves(),
  scan: resolves(),
}

const baseOptions = { scanCount: 100 }

Deno.test('adapter', async (t) => {
  await t.step('should implement the port', () => {
    assert(
      validateCacheAdapterSchema(createAdapter(baseStubClient, baseOptions)),
    )
  })

  await t.step('listDocs', async (t) => {
    await t.step('test scan', async () => {
      let results = []
      for (let i = 0; i < 100; i++) {
        results.push(`key${i}`)
      }

      const scans = [
        ['50', results.slice(0, 50)],
        ['0', results.slice(50)],
      ]
      const scan = spy(() => Promise.resolve(scans.shift()))

      const adapter = createAdapter({
        ...baseStubClient,
        get: resolves(JSON.stringify({ bam: 'baz' })),
        scan,
      }, baseOptions)

      results = await adapter.listDocs({
        store: 'word',
        pattern: '*',
      })

      assertObjectMatch(scan.calls[0].args, [0, {
        pattern: 'word_*',
        count: 100,
      }])
      assertObjectMatch(scan.calls[1].args, ['50', {
        pattern: 'word_*',
        count: 100,
      }])
      assert(results.docs.length === 100)
    })

    await t.step('list redis docs', async () => {
      const doc = { bam: 'baz' }

      const adapter = createAdapter({
        ...baseStubClient,
        get: resolves(JSON.stringify(doc)),
        scan: resolves(['0', ['key']]),
      }, baseOptions)

      const result = await adapter.listDocs({
        store: 'foo',
        pattern: '*',
      })

      assert(result.ok)
      assertEquals(result.docs.length, 1)
      assertObjectMatch(result.docs[0].value, doc)
    })
  })

  await t.step('createStore', async (t) => {
    await t.step('create redis store', async () => {
      const adapter = createAdapter(baseStubClient, baseOptions)

      const result = await adapter.createStore('foo')
      assert(result.ok)
    })

    await t.step('* doc - no store exists', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: resolves(undefined), // looking up store produces undefined
      }, baseOptions)

      const err = await adapter.createDoc({
        store: 'foo',
        key: 'bar',
        value: { foo: 'bar', ttl: '5m' },
      })

      assertObjectMatch(err, {
        ok: false,
        status: 400,
        msg: 'Store does not exist',
      })
    })
  })

  await t.step('destroyStore', async (t) => {
    await t.step('remove redis store - no keys', async () => {
      const del = spy(() => Promise.resolve(2))
      const adapter = createAdapter({
        ...baseStubClient,
        del,
        scan: resolves(['0', []]),
      }, baseOptions)

      const result = await adapter.destroyStore('foo')

      assertEquals(del.calls.length, 1)
      assertObjectMatch(del.calls[0], { args: ['store_foo'] })
      assert(result.ok)
    })

    await t.step('remove redis store - keys', async () => {
      const del = spy(() => Promise.resolve(2))
      const adapter = createAdapter({
        ...baseStubClient,
        del,
        scan: resolves(['0', ['baz', 'bar']]),
      }, baseOptions)

      const result = await adapter.destroyStore('foo')

      assert(result.ok)
      assertObjectMatch(del.calls[0], { args: ['baz'] })
      assertObjectMatch(del.calls[1], { args: ['bar'] })
      assertObjectMatch(del.calls[2], { args: ['store_foo'] })
    })
  })

  await t.step('createDoc', async (t) => {
    await t.step('create redis doc', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: (k) =>
          k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ active: true }))
            : Promise.resolve(null),
      }, baseOptions)

      const result = await adapter.createDoc({
        store: 'foo',
        key: 'bar',
        value: { bam: 'baz' },
        ttl: 5000,
      })

      assert(result.ok)
      assertEquals(result.doc, { bam: 'baz' })
    })

    await t.step('create redis doc - conflict', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: (k) =>
          k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ active: true })) // store
            : Promise.resolve(JSON.stringify({ foo: 'bar' })), // doc already exists
      }, baseOptions)

      const err = await adapter.createDoc({
        store: 'foo',
        key: 'bar',
        value: { bam: 'baz' },
        ttl: 5000,
      })

      assertObjectMatch(err, {
        ok: false,
        status: 409,
        msg: 'Document Conflict',
      })
    })

    await t.step('create doc - immediately expire with negative ttl', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        set: (_k, _v, opts) => {
          assertEquals(opts.px, 0)
          return Promise.resolve('OK')
        },
        get: (k) =>
          k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ foo: 'bar' }))
            : Promise.resolve(undefined), // not found
      }, baseOptions)

      await adapter.createDoc({
        store: 'foo',
        key: 'bar',
        value: { bam: 'baz' },
        ttl: -100,
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
    })
  })

  await t.step('getDoc', async (t) => {
    await t.step('get redis doc', async () => {
      const value = { bam: 'baz' }
      const adapter = createAdapter({
        ...baseStubClient,
        get: resolves(JSON.stringify(value)),
      }, baseOptions)

      const result = await adapter.getDoc({
        store: 'foo',
        key: 'bar',
      })

      assertObjectMatch(result, value)
    })

    await t.step('get redis doc - not found', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: (k) =>
          k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ foo: 'bar' }))
            : Promise.resolve(undefined),
      }, baseOptions)

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
    await t.step('update redis doc', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: (k) => k === 'store_foo' ? Promise.resolve('{"active": true}') : Promise.resolve(null),
      }, baseOptions)

      const result = await adapter.updateDoc({
        store: 'foo',
        key: 'bar',
        value: { hello: 'world' },
      })
      console.log(result)
      assert(result.ok)
    })

    await t.step('create doc - immediately expire with negative ttl', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        set: (_k, _v, opts) => {
          assertEquals(opts.px, 0)
          return Promise.resolve('OK')
        },
        get: (k) =>
          k === 'store_foo'
            ? Promise.resolve(JSON.stringify({ foo: 'bar' }))
            : Promise.resolve(undefined), // not found
      }, baseOptions)

      await adapter.updateDoc({
        store: 'foo',
        key: 'bar',
        value: { bam: 'baz' },
        ttl: -100,
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
    })
  })

  await t.step('deleteDoc', async (t) => {
    await t.step('delete redis doc', async () => {
      const adapter = createAdapter({
        ...baseStubClient,
        get: (k) => k === 'store_foo' ? Promise.resolve('{"active": true}') : Promise.resolve(null),
      }, baseOptions)

      const result = await adapter.deleteDoc({
        store: 'foo',
        key: 'bar',
      })

      assert(result.ok)
    })
  })
})
