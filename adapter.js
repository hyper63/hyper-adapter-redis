import { crocks, HyperErr, R } from './deps.js'
import { handleHyperErr } from './utils.js'

const { Async } = crocks
const { always, append, identity, ifElse, isNil, not } = R

/**
 * Create a hyper store cache key, with the given prefix.
 * By default, the prefix is hashtagged to ensure all keys "contained" in the prefix
 * are stored within the same hash slot. This is useful when performing multi-key operations
 * on a Redis cluster. See https://github.com/hyper63/hyper-adapter-redis/issues/17
 *
 * See: https://redis.io/docs/reference/cluster-spec/#hash-tags
 *
 * @param {string} prefix - the prefix for the key, typically the hyper cache store name
 * @param {string} key - the key
 * @param {boolean} [hashSlot] - whether to hashtag the prefix, which will cause all keys
 * "within" this prefix to be mapped to the same hash slot. This is useful for multi-key operations
 * performed on a Redis cluster. Defaults to false, which is to say "hashtag the prefix"
 * @returns
 */
const createKey = (prefix, key, hashSlot = true) =>
  `${hashSlot ? `{${prefix}}` : `${prefix}`}_${key}`

/**
 * Pages sizes above ~2500 will cause maximum callstack exceeded errors
 * when using Async.all() which uses recursion internally.
 *
 * But we only use Async.all() when hashSlots are disabled, to sideskirt CROSSSLOT
 * errors: see https://github.com/hyper63/hyper-adapter-redis/issues/17
 *
 * So if hashSlots are enabled, then we simply return the provided count, nooping. Otherwise,
 * we return the minimum between count, and our limit of 2500 we have tested to work despite
 * Async.all()'s implementation.
 *
 * This is purely an implementation detail, when performing multi key operations
 * and so does not impact the consumer:
 * - listDocs
 * - deleting all keys in hyper Cache store, as part of destroyStore()
 */
const maxPageSize = (count, hashSlot) => hashSlot ? count : Math.min(count, 2500)

const mapTtl = (ttl) =>
  ifElse(
    () => not(isNil(ttl)),
    /**
     * If ttl is <0, then it should be expired
     * immediately.
     *
     * Setting the ttl to 1 effectively does that.
     */
    append({ px: Math.max(Number(ttl), 1) }),
    /**
     * No ttl, ergo live forever
     */
    identity,
  )

/**
 * @typedef Options
 * @property {number} scanCount
 * @property {any} client
 *
 * @param {Options} options
 */
export default function ({ redis, scanCount, hashSlot = true }) {
  // redis commands
  // key: Promise<string>
  const get = Async.fromPromise(redis.get.bind(redis))
  // key, value, { px, ex }: Promise<string>
  const set = Async.fromPromise(redis.set.bind(redis))
  // key, key, key: Promise<string[]>
  const del = Async.fromPromise(redis.del.bind(redis))
  // cursor, { type, pattern }: Promise<[string, string[]]>
  const scan = Async.fromPromise(redis.scan.bind(redis))
  // key, key, key: Promise<any[]>
  const mget = Async.fromPromise(redis.mget.bind(redis))

  const index = () => {
    return Promise.resolve(HyperErr({ status: 501, msg: 'Not Implemented' }))
  }

  const checkIfStoreExists = (store) => (key) =>
    get(createKey('store', store, false))
      .chain(
        (_) =>
          _ ? Async.Resolved(key) : Async.Rejected(HyperErr({
            status: 400,
            msg: 'Store does not exist',
          })),
      )

  const checkForConflict = ([id]) =>
    get(id)
      .chain(
        (_) =>
          _
            ? Async.Rejected(HyperErr({
              status: 409,
              msg: 'Document Conflict',
            }))
            : Async.Resolved([id]),
      )

  /**
   * TODO: should this return error if store already exists?
   *
   * @param {string} name
   * @returns {Promise<object>}
   */
  const createStore = (name) =>
    Async.of([])
      .map(append(createKey('store', name, false)))
      .map(append('active'))
      .chain((args) => set(...args))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      )
      .toPromise()

  /**
   * TODO: should this return error if store doesn't exist?
   *
   * @param {string} name
   * @returns {Promise<object>}
   */
  const destroyStore = (name) =>
    Async.of(createKey(name, '*', hashSlot))
      // grab all keys belonging to this store
      .chain((matcher) => getKeys(scan, matcher, scanCount))
      .chain(
        ifElse(
          (keys) => keys.length > 0,
          deleteKeys(del, scanCount, hashSlot),
          (keys) => Async.of(keys),
        ),
      )
      // Delete the key that tracks the store's existence
      .chain(() => del(createKey('store', name, false)))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      )
      .toPromise()

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const createDoc = ({ store, key, value, ttl }) =>
    Async.of([createKey(store, key, hashSlot)])
      .chain(checkIfStoreExists(store))
      // don't allow over-writting of existing keys
      .chain(checkForConflict)
      .map(append(JSON.stringify(value)))
      .map(mapTtl(ttl))
      .chain((args) => set(...args))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({
          ok: true,
          doc: value,
        })),
      )
      .toPromise()

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const getDoc = ({ store, key }) =>
    Async.of(createKey(store, key, hashSlot))
      .chain(checkIfStoreExists(store))
      .chain(get)
      .chain((v) => {
        if (!v) {
          return Async.Rejected(HyperErr({
            status: 404,
            msg: 'document not found',
          }))
        }
        return Async.Resolved(JSON.parse(v))
      })
      .bichain(
        handleHyperErr,
        (v) => Async.Resolved(v),
      )
      .toPromise()

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const updateDoc = ({ store, key, value, ttl }) =>
    Async.of([])
      .chain(checkIfStoreExists(store))
      .map(append(createKey(store, key, hashSlot)))
      .map(append(JSON.stringify(value)))
      .map(mapTtl(ttl))
      .chain((args) => set(...args))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      )
      .toPromise()

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const deleteDoc = ({ store, key }) =>
    checkIfStoreExists(store)()
      .chain(() => del(createKey(store, key, hashSlot)))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      )
      .toPromise()

  /**
   * @param {CacheQuery}
   * @returns {Promise<object>}
   */
  const listDocs = ({ store, pattern = '*' }) => {
    return getKeys(scan, createKey(store, pattern, hashSlot), scanCount)
      .chain(getValues({ get, mget }, store, scanCount, hashSlot))
      .bichain(
        handleHyperErr,
        (docs) => Async.Resolved({ ok: true, docs }),
      )
      .toPromise()
  }

  return Object.freeze({
    index,
    createStore,
    destroyStore,
    createDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    listDocs,
  })
}

function getKeys(scan, matcher, count) {
  function page(cursor, keys) {
    return scan(cursor, { pattern: matcher, count })
      .map(([nCursor, nKeys]) => {
        keys = keys.concat(nKeys)

        return nCursor === '0'
          ? keys
          /**
           * Return a thunk that continues the next iteration, thus ensuring the callstack
           * is only ever one call deep.
           *
           * This is continuation passing style, to be leverage by our trampoline
           */
          : () => page(nCursor, keys)
      }).toPromise()
  }

  /**
   * Our initial thunk that performs the first scan
   */
  return Async.fromPromise(page)(0, [])
    .chain(Async.fromPromise(trampoline))
}

function getValues({ get, mget }, store, count, hashSlot) {
  const prefix = `${createKey(store, '', hashSlot).split('_').shift()}_`

  return function (keys) {
    function page(keys, values) {
      count = maxPageSize(count, hashSlot)

      const nKeys = keys.splice(0, count)
      return Async.of()
        /**
         * If the adapter is NOT configured to use hash slot for the store,
         * then we must get the keys individually see https://github.com/hyper63/hyper-adapter-redis/issues/17
         *
         * Otherwise, we are using hash slots, so all keys for a store will be mapped
         * to a single hash slot and so can be retrieved as a set.
         *
         * Regardless, we still break up the operations into "pages" according
         * to the provided count, so as to not block the Redis thread for too long
         * on any given operation
         */
        .chain(() => hashSlot ? mget(...nKeys) : Async.all(nKeys.map((key) => get(key))))
        .map((nValues) => {
          values = values.concat(
            nValues.map((v, i) => ({
              key: nKeys[i].replace(prefix, ''),
              value: JSON.parse(v),
            })),
          )

          return keys.length === 0
            ? values
            /**
             * Return a thunk that continues the next iteration, thus ensuring the callstack
             * is only ever one call deep.
             *
             * This is continuation passing style, to be leverage by our trampoline
             */
            : () => page(keys, values)
        }).toPromise()
    }

    /**
     * Our initial thunk that performs the first scan
     */
    return Async.fromPromise(page)(keys, [])
      .chain(Async.fromPromise(trampoline))
  }
}

function deleteKeys(del, count, hashSlot) {
  return function (keys) {
    function page(keys) {
      count = maxPageSize(count, hashSlot)

      const nKeys = keys.splice(0, count)
      return Async.of()
        /**
         * If the adapter is NOT configured to use hash slot for the store,
         * then we must del the keys individually see https://github.com/hyper63/hyper-adapter-redis/issues/17
         *
         * Otherwise, we are using hash slots, so all keys for a store will be mapped
         * to a single hash slot and so can be deleted as a set.
         *
         * Regardless, we still break up the operations into "pages" according
         * to the provided count, so as to not block the Redis thread for too long
         * on any given operation
         */
        .chain(() => hashSlot ? del(...nKeys) : Async.all(nKeys.map((key) => del(key))))
        .map(() => {
          return keys.length === 0
            ? []
            /**
             * Return a thunk that continues the next iteration, thus ensuring the callstack
             * is only ever one call deep.
             *
             * This is continuation passing style, to be leverage by our trampoline
             */
            : () => page(keys)
        }).toPromise()
    }

    /**
     * Our initial thunk that performs the first scan
     */
    return Async.of(keys)
      .chain(Async.fromPromise(page))
      .chain(Async.fromPromise(trampoline))
  }
}

async function trampoline(init) {
  let result = init
  /**
   * Call toPromise() on the Async, to unwrap each iteration
   * instead of chaining them in a single Async.
   *
   * This prevents overflowing the callback, and gives us our trampoline
   */
  while (typeof result === 'function') result = await result()
  return result
}
