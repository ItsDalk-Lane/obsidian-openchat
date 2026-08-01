"use strict";

// 独立服务启动器需要在 CommonJS 入口中加载 TypeScript 运行器。
const { createJiti } = require("jiti");

const jiti = createJiti(__filename, {
  interopDefault: true,
  tsconfigPaths: true,
});

jiti.import("./index.ts")
  .then(({ startServer }) => startServer())
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
