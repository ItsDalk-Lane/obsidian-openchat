import assert from "node:assert/strict";
import test from "node:test";
import { parseMcpImport } from "./mcp-import.ts";

test("parses the standard mcpServers wrapper", () => {
  const { servers, unnamedEntry } = parseMcpImport(JSON.stringify({
    mcpServers: {
      "zai-mcp-server": {
        type: "stdio",
        command: "npx",
        args: ["-y", "@z_ai/mcp-server"],
        env: { Z_AI_API_KEY: "YOUR_API_KEY", Z_AI_MODE: "ZHIPU" },
      },
    },
  }));
  assert.equal(unnamedEntry, null);
  assert.deepEqual(servers, [{
    name: "zai-mcp-server",
    entry: {
      command: "npx",
      args: ["-y", "@z_ai/mcp-server"],
      env: { Z_AI_API_KEY: "YOUR_API_KEY", Z_AI_MODE: "ZHIPU" },
    },
  }]);
});

test("strips markdown code fences", () => {
  const { servers } = parseMcpImport('```json\n{"mcpServers":{"a":{"command":"npx"}}}\n```');
  assert.equal(servers[0].name, "a");
  assert.deepEqual(servers[0].entry, { command: "npx" });
});

test("parses multiple servers at once", () => {
  const { servers } = parseMcpImport(JSON.stringify({
    mcpServers: {
      local: { command: "uvx", args: ["mcp-server"] },
      remote: { url: "https://mcp.example.com/mcp", headers: { Authorization: "Bearer x" } },
    },
  }));
  assert.deepEqual(servers.map((s) => s.name), ["local", "remote"]);
  assert.deepEqual(servers[1].entry, {
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: "Bearer x" },
  });
});

test("parses a bare name-to-entry map", () => {
  const { servers } = parseMcpImport('{"zread":{"command":"npx","args":["-y","zread"]}}');
  assert.equal(servers[0].name, "zread");
});

test("returns an unnamed entry for a single bare server object", () => {
  const { servers, unnamedEntry } = parseMcpImport('{"type":"stdio","command":"npx","args":["-y","pkg"]}');
  assert.deepEqual(servers, []);
  assert.deepEqual(unnamedEntry, { command: "npx", args: ["-y", "pkg"] });
});

test("keeps http auth fields and lifecycle", () => {
  const { servers } = parseMcpImport(JSON.stringify({
    mcpServers: {
      api: { url: "https://x/mcp", auth: "bearer", bearerToken: "t", lifecycle: "eager" },
    },
  }));
  assert.deepEqual(servers[0].entry, {
    url: "https://x/mcp",
    auth: "bearer",
    bearerToken: "t",
    lifecycle: "eager",
  });
});

test("rejects invalid JSON", () => {
  assert.throws(() => parseMcpImport("{not json"), /JSON 解析失败/);
});

test("rejects entries without command or url", () => {
  assert.throws(
    () => parseMcpImport('{"mcpServers":{"bad":{"args":["-y"]}}}'),
    /服务器 "bad" 缺少 command（stdio）或 url（http）/,
  );
});

test("rejects non-string-array args", () => {
  assert.throws(
    () => parseMcpImport('{"mcpServers":{"bad":{"command":"npx","args":"-y pkg"}}}'),
    /args 必须是字符串数组/,
  );
});

test("rejects invalid lifecycle values", () => {
  assert.throws(
    () => parseMcpImport('{"mcpServers":{"bad":{"command":"npx","lifecycle":"always"}}}'),
    /lifecycle 无效/,
  );
});

test("rejects empty mcpServers and empty objects", () => {
  assert.throws(() => parseMcpImport('{"mcpServers":{}}'), /mcpServers 为空/);
  assert.throws(() => parseMcpImport("{}"), /JSON 对象为空/);
});
