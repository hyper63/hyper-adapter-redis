import { assert, assertEquals, validateFactorySchema } from "./dev_deps.js";

import RedisCacheAdapter from "./mod.js";

const resolves = (val) => () => Promise.resolve(val);

const baseStubClient = {
  get: resolves(),
  set: resolves(),
  del: resolves(),
  keys: resolves(),
  scan: resolves(),
};

Deno.test("mod", async (t) => {
  await t.step("validate factory schema", () => {
    assert(validateFactorySchema(RedisCacheAdapter({}, {
      client: { connect: resolves({ foo: "bar" }) },
    })));
  });

  await t.step("load", async (t) => {
    await t.step("returns a redis client", async () => {
      const res = await RedisCacheAdapter({}, {
        client: { connect: resolves({ foo: "bar" }) },
      }).load();

      assert(res.client);
      assertEquals(res.client.foo, "bar");
    });

    await t.step("returns a redis cluster client", async () => {
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
  });

  await t.step("link", async (t) => {
    await t.step("returns an adapter", () => {
      const res = RedisCacheAdapter().link({ client: baseStubClient })();
      assert(res.createStore);
    });
  });
});
