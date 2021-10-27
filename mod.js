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
    return { client };
  }

  /**
   * @param {{ client }} env
   * @returns {function}
   */
  function link({ client }) {
    /**
     * @param {object} adapter
     * @returns {object}
     */
    return function () {
      return createAdapter(client);
    };
  }

  return Object.freeze({
    id: "redis-cache-adapter",
    port: "cache",
    load,
    link,
  });
}
