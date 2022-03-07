import { crocks, R } from "./deps.js";
import { handleHyperErr, HyperErr } from "./utils.js";

const { Async } = crocks;
const { always, append, identity, ifElse, isNil, map, not } = R;

const createKey = (store, key) => `${store}_${key}`;

export default function (client) {
  // redis commands
  // key: Promise<string>
  const get = Async.fromPromise(client.get.bind(client));
  // key, value, { px, ex }: Promise<string>
  const set = Async.fromPromise(client.set.bind(client));
  // key, key, key: Promise<string[]>
  const del = Async.fromPromise(client.del.bind(client));
  // key: Promise<string[]>
  const keys = Async.fromPromise(client.keys.bind(client));
  // cursor, { type, pattern }: Promise<[string, string[]]>
  const scan = Async.fromPromise(client.scan.bind(client));

  const index = () => {
    return Promise.resolve(HyperErr({ status: 501, msg: "Not Implemented" }));
  };

  const checkIfStoreExists = (store) =>
    (key) =>
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
    del(createKey("store", name))
      .chain(() => keys(name + "_*"))
      .chain(
        ifElse(
          (keys) => keys.length > 0,
          (args) => del(...args),
          (keys) => Async.of(keys),
        ),
      )
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
    const matcher = `${store}_${pattern}`;
    return await scan(0, { pattern: matcher })
      .chain(getKeys(scan, matcher))
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

function getKeys(scan, matcher) {
  return function repeat([cursor, keys]) {
    return cursor === "0"
      ? Async.Resolved(keys)
      : scan(cursor, { pattern: matcher })
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
