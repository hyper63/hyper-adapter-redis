import { Async } from 'crocks'
import { always, append, compose, identity, ifElse, isNil, not } from 'ramda'

const createKey = (store, key) => `${store}_${key}`;

export default function (client) {
  // redis commands
  const get = Async.fromNode(client.get.bind(client));
  const set = Async.fromNode(client.set.bind(client));
  const del = Async.fromNode(client.del.bind(client));
  const keys = Async.fromNode(client.keys.bind(client));
  const scan = Async.fromNode(client.scan.bind(client));

  /**
   * @param {string} name
   * @returns {Promise<object>}
   */
  const createStore = (name) =>
    Async.of([])
      .map(append(createKey("store", name)))
      .map(append("active"))
      .chain(set)
      .map(always({ ok: true }))
      .toPromise();

  /**
   * @param {string} name
   * @returns {Promise<object>}
   */
  const destroyStore = (name) =>
    del(createKey("store", name))
      .chain(() => keys(name + "_*"))
      .chain(
        ifElse(
          (keys) => keys.length > 0,
          del,
          (keys) => Async.of(keys)
        )
      )
      .map(always({ ok: true }))
      .toPromise();

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const createDoc = ({ store, key, value, ttl }) =>
    Async.of([])
      .map(append(createKey(store, key)))
      .map(append(JSON.stringify(value)))
      .map(
        ifElse(
          () => not(isNil(ttl)),
          compose(append(ttl), append("PX")),
          identity
        )
      )
      .chain(set)
      .map(() => ({
        ok: true,
        doc: value,
      }))
      .toPromise();

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const getDoc = ({ store, key }) =>
    get(createKey(store, key)).map((v) => {
      if (!v) {
        return { ok: false, msg: "document not found" };
      }
      return { ok: true, doc: JSON.parse(v) };
    })
    .toPromise();

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const updateDoc = ({ store, key, value, ttl }) =>
    Async.of([])
      .map(append(createKey(store, key)))
      .map(append(JSON.stringify(value)))
      .map(
        ifElse(
          () => not(isNil(ttl)),
          compose(append(ttl), append("PX")),
          identity
        )
      )
      .chain((args) => set(...args))
      .map((v) => ({
        ok: true,
      }))
      .toPromise();

  /**
   * @param {CacheDoc}
   * @returns {Promise<object>}
   */
  const deleteDoc = ({ store, key }) =>
    del(createKey(store, key)).map(always({ ok: true })).toPromise();

  /**
   * @param {CacheQuery}
   * @returns {Promise<object>}
   */
  const listDocs = ({ store, pattern = "*" }) =>
    scan(0, "MATCH", store + "_" + pattern)
      .chain(([cursor, keys]) =>
        Async.all(
          keys.map((key) =>
            get(key).map((v) => ({
              key: key.replace(`${store}_`, ""),
              value: JSON.parse(v),
            }))
          )
        )
      )
      .map((docs) => {
        return {
          ok: true,
          docs,
        };
      }).toPromise();

  return Object.freeze({
    createStore,
    destroyStore,
    createDoc,
    getDoc,
    updateDoc,
    deleteDoc,
    listDocs
  });

}