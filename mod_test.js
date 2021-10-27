import { z } from "./deps.js";
import { assert, assertEquals, resolves } from "./dev_deps.js";

import RedisCacheAdapter from "./mod.js";

const schema = z.object({
  id: z.string().optional(),
  port: z.string().optional(),
  load: z.function()
    .args(z.any().optional())
    .returns(z.any()),
  link: z.function()
    .args(z.any())
    .returns(
      z.function()
        .args(z.any())
        .returns(z.any()),
    ),
});

const baseStubClient = {
  get: resolves(),
  set: resolves(),
  del: resolves(),
  keys: resolves(),
  scan: resolves(),
};

Deno.test("validate schema", () => {
  assert(schema.safeParse(RedisCacheAdapter()).success);
});

Deno.test("returns a redis client", async () => {
  const res = await RedisCacheAdapter({}, {
    client: { connect: resolves({ foo: "bar" }) },
  }).load();

  assert(res.client);
  assertEquals(res.client.foo, "bar");
});

Deno.test("returns a redis cluster client", async () => {
  const res = await RedisCacheAdapter({ hostname: "foo", port: 6380 }, {
    client: {
      connect: (config) => Promise.resolve(config),
    },
    cluster: true,
  }).load();

  assert(res.client);
  assertEquals(res.client.nodes[0].hostname, "foo");
  assertEquals(res.client.nodes[0].port, 6380);
});

Deno.test("returns an adapter", () => {
  const res = RedisCacheAdapter().link({ client: baseStubClient })();
  assert(res.createStore);
});
