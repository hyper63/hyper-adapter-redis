<h1 align="center">hyper-adapter-redis</h1>
<p align="center">A Cache port adapter for Redis in the <a href="https://hyper.io/">hyper</a>  service framework</p>
</p>
<p align="center">
  <a href="https://nest.land/package/hyper-adapter-redis"><img src="https://nest.land/badge.svg" alt="Nest Badge" /></a>
  <a href="https://github.com/hyper63/hyper-adapter-redis/actions/workflows/test.yml"><img src="https://github.com/hyper63/hyper-adapter-redis/actions/workflows/test.yml/badge.svg" alt="Test" /></a>
  <a href="https://github.com/hyper63/hyper-adapter-redis/tags/"><img src="https://img.shields.io/github/tag/hyper63/hyper-adapter-redis" alt="Current Version" /></a>
</p>

---

## Table of Contents

- [Getting Started](#getting-started)
- [Installation](#installation)
- [Features](#features)
- [Methods](#methods)
- [Contributing](#contributing)
- [License](#license)

## Getting Started

```js
import { default as redis } from 'https://x.nest.land/hyper-adapter-redis@1.2.9/mod.js'

export default {
  app: opine,
  adapter: [
    {
      port: 'cache',
      plugins: [
        redis({
          hostname: Deno.env.get('REDIS_HOST'),
          port: Deno.env.get('REDIS_PORT'), // defaults to 6379
        }),
      ],
    },
  ],
}
```

## Installation

This is a Deno module available to import from
[nest.land](https://nest.land/package/hyper-adapter-redis)

deps.js

```js
export { default as redis } from 'https://x.nest.land/hyper-adapter-redis@1.2.9/mod.js'
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
