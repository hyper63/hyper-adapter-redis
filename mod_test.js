import { z } from "./deps.js";
import { assert, resolves } from "./dev_deps.js";

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
    client: { connect: resolves(baseStubClient) },
  }).load();
  assert(res.client);
});

Deno.test("returns an adapter", () => {
  const res = RedisCacheAdapter().link({ client: baseStubClient })();
  assert(res.createStore);
});
