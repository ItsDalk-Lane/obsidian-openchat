import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });

test("LAN token checks are disabled when token env is absent", async () => {
  const security = await jiti.import("./request-security.ts");
  const prev = process.env.PI_WEB_LAN_API_TOKEN;
  delete process.env.PI_WEB_LAN_API_TOKEN;
  try {
    const request = new Request("http://192.168.1.10:30141/api/tasks");
    assert.equal(security.shouldRequireLanApiToken(request), false);
    assert.equal(security.isLanApiTokenAllowed(request), true);
  } finally {
    if (prev === undefined) delete process.env.PI_WEB_LAN_API_TOKEN;
    else process.env.PI_WEB_LAN_API_TOKEN = prev;
  }
});

test("LAN token checks enforce token for non-loopback requests", async () => {
  const security = await jiti.import("./request-security.ts");
  const prev = process.env.PI_WEB_LAN_API_TOKEN;
  process.env.PI_WEB_LAN_API_TOKEN = "secret-token";
  try {
    const lanRequest = new Request("http://192.168.1.10:30141/api/tasks", {
      headers: { "x-pi-web-token": "secret-token" },
    });
    assert.equal(security.shouldRequireLanApiToken(lanRequest), true);
    assert.equal(security.isLanApiTokenAllowed(lanRequest), true);

    const denied = new Request("http://192.168.1.10:30141/api/tasks");
    assert.equal(security.isLanApiTokenAllowed(denied), false);

    const localhost = new Request("http://127.0.0.1:30141/api/tasks");
    assert.equal(security.shouldRequireLanApiToken(localhost), false);
  } finally {
    if (prev === undefined) delete process.env.PI_WEB_LAN_API_TOKEN;
    else process.env.PI_WEB_LAN_API_TOKEN = prev;
  }
});
