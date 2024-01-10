import { crocks, R, redis, redisCluster } from './deps.js'

import createAdapter from './adapter.js'

const { Async } = crocks
const { Rejected, Resolved, of } = Async
const { defaultTo, mergeRight, isEmpty } = R

/**
 * @typedef RedisClientArgs
 * @property {string} [hostname]
 * @property {number} [port] - defaults to 6379
 * @property {string} [url] - a connection string that is parsed to determine Redis configuration
 * @property {{ connect: () => Promise<{}> }} [client]
 * @property {boolean} [cluster] - defaults to false
 * @property {number} [scanCount] - The workload size of scan calls. Defaults to 1000
 * @property {boolean} [hashSlot] - whether to hash all keys in each store to a single slot. This is really only necessary,
 * if your redis is a cluster. Using the default is recommended. Defaults to true
 *
 * @param {RedisClientArgs} config
 */
export default function RedisCacheAdapter(config) {
  const checkClientArgs = (config) => {
    if (config.url) return Resolved(config)
    if (config.hostname) return Resolved(config)
    return Rejected({
      message: 'either a url or hostname must be provided in order to connect to Redis',
    })
  }

  const setPort = (config) => mergeRight({ port: 6379 }, config)

  const setScanCount = (config) => mergeRight({ scanCount: 10000 }, config)

  const setClient = Async.fromPromise(async (config) => {
    const { hostname: _hostname, port: _port, url, cluster, client: _client, hashSlot } = config
    const Client = _client || (cluster ? redisCluster : redis)

    const configFromUrl = url ? new URL(url) : {}

    const hostname = configFromUrl.hostname || _hostname
    const port = !isEmpty(configFromUrl)
      ? Number(configFromUrl.port) || (configFromUrl.protocol === 'https:' ? 443 : 80)
      : _port
    const password = configFromUrl.password || undefined

    let client
    if (cluster) {
      // redis cluster client
      client = await Client.connect({
        nodes: [{ hostname, port }],
      })
    } else {
      // regular redis client
      client = await Client.connect({ hostname, port, password })
    }

    return mergeRight(config, { redis: client, hashSlot: hashSlot != null ? hashSlot : true })
  })

  return Object.freeze({
    id: 'redis-cache-adapter',
    port: 'cache',
    load: (prevLoad) =>
      of(prevLoad)
        .map(defaultTo({}))
        .map((prevLoad) => mergeRight(prevLoad, config || {}))
        .chain(checkClientArgs)
        .map(setScanCount)
        .map(setPort)
        .chain(setClient)
        .toPromise()
        .catch((e) => console.log('Error: In Load Method', e.message)),
    link: ({ redis, scanCount, hashSlot }) => (_) => createAdapter({ redis, scanCount, hashSlot }),
  })
}
