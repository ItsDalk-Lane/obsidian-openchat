const path = require("node:path");
const { createJiti } = require("jiti");

const jiti = createJiti(__filename);
const { enLocale } = jiti(path.join(__dirname, "../lib/i18n/messages/en.ts"));
const { zhCNLocale } = jiti(path.join(__dirname, "../lib/i18n/messages/zh-CN.ts"));

function flattenMessages(value, prefix = "", result = Object.create(null)) {
  for (const [key, child] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenMessages(child, nextKey, result);
    } else {
      result[nextKey] = child;
    }
  }
  return result;
}

function missingKeys(source, target) {
  return Object.keys(source)
    .filter((key) => !Object.hasOwn(target, key))
    .sort();
}

const english = flattenMessages(enLocale.messages);
const chinese = flattenMessages(zhCNLocale.messages);
const missingInChinese = missingKeys(english, chinese);
const missingInEnglish = missingKeys(chinese, english);

console.log(`i18n parity: en=${Object.keys(english).length} zh-CN=${Object.keys(chinese).length}`);

if (missingInChinese.length > 0) {
  console.error(`missing in zh-CN (${missingInChinese.length}): ${missingInChinese.join(", ")}`);
}

if (missingInEnglish.length > 0) {
  console.error(`missing in en (${missingInEnglish.length}): ${missingInEnglish.join(", ")}`);
}

if (missingInChinese.length > 0 || missingInEnglish.length > 0) {
  process.exitCode = 1;
} else {
  console.log("i18n parity: zero difference");
}
