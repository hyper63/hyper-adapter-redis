import { R, redis, redisCluster } from "./deps.js";

import createAdapter from "./adapter.js";

const { mergeRight } = R;

/**
 * @typedef RedisClientArgs
 * @property {string} hostname
 * @property {number?} port - defaults to 6379
 *
 * @typedef RedisAdapterOptions
 * @property {{ connect: () => Promise<{}> }?} client
 * @property {boolean?} cluster - defaults to false
 * @property {number?} scanCount - The workload size of scan calls. Defaults to 1000
 *
 * @param {RedisClientArgs} config
 * @param {RedisAdapterOptions?} options
 * @returns {object}
 */
export default function RedisCacheAdapter(
  config = {},
  options = {},
) {
  options.client = options.client || (options.cluster ? redisCluster : redis);
  options.scanCount = options.scanCount || 1000;

  async function load(prevLoad = {}) {
    // prefer args passed to adapter over previous load
    config = mergeRight(prevLoad, config);

    let client;
    if (options.cluster) {
      // redis cluster client
      client = await options.client.connect({
        nodes: [
          {
            hostname: config.hostname,
            port: config.port,
          },
        ],
      });
    } else {
      // regular redis client
      client = await options.client.connect(config);
    }
    // create client
    return { client, options: { scanCount: options.scanCount } };
  }

  /**
   * @param {{ client, options: { scanCount: number } }} env
   * @returns {function}
   */
  function link({ client, options }) {
    /**
     * @param {object} adapter
     * @returns {object}
     */
    return function () {
      return createAdapter(client, options);
    };
  }

  return Object.freeze({
    id: "redis-cache-adapter",
    port: "cache",
    load,
    link,
  });
}
