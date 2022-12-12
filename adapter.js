import { crocks, HyperErr, R } from "./deps.js";
import { handleHyperErr } from "./utils.js";

const { Async } = crocks;
const { always, append, identity, ifElse, isNil, map, not, compose } = R;

const createKey = (store, key) => `${store}_${key}`;

/**
 * @typedef Options
 * @property {number} scanCount
 *
 * @param {*} client
 * @param {Options} options
 * @returns
 */
export default function (client, options) {
  // redis commands
  // key: Promise<string>
  const get = Async.fromPromise(client.get.bind(client));
  // key, value, { px, ex }: Promise<string>
  const set = Async.fromPromise(client.set.bind(client));
  // key, key, key: Promise<string[]>
  const del = Async.fromPromise(client.del.bind(client));
  // cursor, { type, pattern }: Promise<[string, string[]]>
  const scan = Async.fromPromise(client.scan.bind(client));

  const { scanCount } = options;

  const index = () => {
    return Promise.resolve(HyperErr({ status: 501, msg: "Not Implemented" }));
  };

  const checkIfStoreExists = (store) => (key) =>
    get(createKey("store", store))
      .chain(
        (_) =>
          _ ? Async.Resolved(key) : Async.Rejected(HyperErr({
            status: 400,
            msg: "Store does not exist",
          })),
      );

  const checkForConflict = ([id]) =>
    get(id)
      .chain(
        (_) =>
          _
            ? Async.Rejected(HyperErr({
              status: 409,
              msg: "Document Conflict",
            }))
            : Async.Resolved([id]),
      );

  /**
   * TODO: should this return error if store already exists?
   *
   * @param {string} name
   * @returns {Promise<object>}
   */
  const createStore = (name) =>
    Async.of([])
      .map(append(createKey("store", name)))
      .map(append("active"))
      .chain((args) => set(...args))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      )
      .toPromise();

  /**
   * TODO: should this return error if store doesn't exist?
   *
   * @param {string} name
   * @returns {Promise<object>}
   */
  const destroyStore = (name) =>
    Async.of(createKey(name, "*"))
      // grab all keys belonging to this store
      .chain((matcher) =>
        scan(0, { pattern: matcher })
          .chain(getKeys(scan, matcher))
      )
      .chain(
        ifElse(
          (keys) => keys.length > 0,
          compose(
            // wait for keys to be deleted
            Async.all,
            // delete each key, sequentially
            // TODO: see https://github.com/hyper63/hyper-adapter-redis/issues/17
            map(del),
          ),
          (keys) => Async.of(keys),
        ),
      )
      // Delete the key that tracks the store's existence
      .chain(() => del(createKey("store", name)))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      )
      .toPromise();

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const createDoc = ({ store, key, value, ttl }) =>
    Async.of([createKey(store, key)])
      .chain(checkIfStoreExists(store))
      // don't allow over-writting of existing keys
      .chain(checkForConflict)
      .map(append(JSON.stringify(value)))
      .map(
        ifElse(
          () => not(isNil(ttl)),
          append({ px: ttl }),
          identity,
        ),
      )
      .chain((args) => set(...args))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({
          ok: true,
          doc: value,
        })),
      )
      .toPromise();

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const getDoc = ({ store, key }) =>
    checkIfStoreExists(store)()
      .chain(() => get(createKey(store, key)))
      .chain((v) => {
        if (!v) {
          return Async.Rejected(HyperErr({
            status: 404,
            msg: "document not found",
          }));
        }
        return Async.Resolved(JSON.parse(v));
      })
      .bichain(
        handleHyperErr,
        (v) => Async.Resolved(v),
      )
      .toPromise();

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const updateDoc = ({ store, key, value, ttl }) =>
    Async.of([])
      .chain(checkIfStoreExists(store))
      .map(append(createKey(store, key)))
      .map(append(JSON.stringify(value)))
      .map(
        ifElse(
          () => not(isNil(ttl)),
          append({ px: ttl }),
          identity,
        ),
      )
      .chain((args) => set(...args))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      )
      .toPromise();

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const deleteDoc = ({ store, key }) =>
    checkIfStoreExists(store)()
      .chain(() => del(createKey(store, key)))
      .bichain(
        handleHyperErr,
        always(Async.Resolved({ ok: true })),
      )
      .toPromise();

  /**
   * @param {CacheQuery}
   * @returns {Promise<object>}
   */
  const listDocs = async ({ store, pattern = "*" }) => {
    const matcher = createKey(store, pattern);
    return await scan(0, { pattern: matcher, count: scanCount })
      .chain(getKeys(scan, matcher, scanCount))
      .chain(getValues(get, store))
      .bichain(
        handleHyperErr,
        (docs) => Async.Resolved({ ok: true, docs }),
      )
      .toPromise();
  };

  return Object.freeze({
    index,
    createStore,
    destroyStore,
    createDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    listDocs,
  });
}

function getKeys(scan, matcher, count) {
  return function repeat([cursor, keys]) {
    return cursor === "0"
      ? Async.Resolved(keys)
      : scan(cursor, { pattern: matcher, count })
        .chain(repeat)
        .map((v) => keys.concat(v));
  };
}

function getValues(get, store) {
  return function (keys) {
    return Async.all(
      map((key) =>
        get(key).map((v) => ({
          key: key.replace(`${store}_`, ""),
          value: JSON.parse(v),
        })), keys),
    );
  };
}
