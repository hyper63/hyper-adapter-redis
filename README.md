<h1 align="center">hyper-adapter-redis</h1>
<p align="center">A Cache port adapter for Redis in the <a href="https://hyper.io/">hyper</a>  service framework</p>
</p>
<p align="center">
  <a href="https://github.com/hyper63/hyper-adapter-redis/actions/workflows/test-and-publish.yml"><img src="https://github.com/hyper63/hyper-adapter-redis/actions/workflows/test-and-publish.yml/badge.svg" alt="Test" /></a>
  <a href="https://github.com/hyper63/hyper-adapter-redis/tags/"><img src="https://img.shields.io/github/tag/hyper63/hyper-adapter-redis" alt="Current Version" /></a>
</p>

---

<!-- toc -->

- [Getting Started](#getting-started)
- [Installation](#installation)
- [Features](#features)
- [Methods](#methods)
- [Contributing](#contributing)
- [Testing](#testing)
- [License](#license)

<!-- tocstop -->

## Getting Started

```js
import { default as redis } from 'https://raw.githubusercontent.com/hyper63/hyper-adapter-redis/v3.1.0/mod.js'

export default {
  app: opine,
  adapter: [
    {
      port: 'cache',
      plugins: [
        redis({ url: 'http://user@password@redis.host:6379' }),
      ],
    },
  ],
}
```

You can also pass a separate `hostname` and `port` to the adapter:

```js
redis({ hostname: 'redis.host', port: 6380 }),
```

> `port` will always default to `6379` if not provided, then `443` if the `url` protocol is `https`
> then finally `80`

To connect to a Redis Cluster, pass the `cluster` flag:

```js
redis({ url: 'http://user@password@redis.host:6379', cluster: true })
```

The adapter will automatically discover all nodes in the Cluster.

## Installation

This is a Deno module available to import from
[nest.land](https://nest.land/package/hyper-adapter-redis)

deps.js

```js
export { default as redis } from 'https://raw.githubusercontent.com/hyper63/hyper-adapter-redis/v3.1.0/mod.js'
```

## Features

- Create a named store in `Redis`
- Destroy a named store in `Redis`
- Create a document in a store in `Redis`
- Get a document from a store in `Redis`
- Update a document in a store in `Redis`
- Delete a document from a store in `Redis`
- List documents in a sttore in `Redis`

## Methods

This adapter fully implements the Search port and can be used as the
[hyper Cache service](https://docs.hyper.io/cache-api) adapter

See the full port [here](https://nest.land/package/hyper-port-cache)

## Contributing

Contributions are welcome! See the hyper
[contribution guide](https://docs.hyper.io/oss/contributing-to-hyper)

## Testing

```
deno task test
```

To lint, check formatting, and run unit tests

## License

Apache-2.0
