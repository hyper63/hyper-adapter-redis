import { R, redis } from "./deps.js";

import createAdapter from "./adapter.js";

const { mergeRight } = R;

/**
 * @typedef RedisClientArgs
 * @property {string} hostname
 * @property {number?} port - defaults to 6379
 *
 * @param {RedisClientArgs} config
 * @returns {object}
 */
export default function RedisCacheAdapter(
  config = {},
  options = { client: redis, cluster: false },
) {
  options.client = options.client || redis;

  async function load(prevLoad = {}) {
    // prefer args passed to adapter over previous load
    config = mergeRight(prevLoad, config);
    const client = await options.client.connect(config);
    if (options.cluster) {
      await options.client.clusterMeet(config.hostname, 6380);
      await options.client.redis.clusterNodes();
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
