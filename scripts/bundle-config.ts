/**
 * Bundle Config Script
 *
 * Compiles YAML configuration files into TypeScript for browser compatibility.
 * Run with: npm run build:config
 *
 * This script reads:
 * - config/models.yml
 * - config/providers/*.yml
 *
 * And generates:
 * - src/config/bundled.ts
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { parse } from "yaml";
import { join } from "path";
import type {
  ModelsConfigYaml,
  ProviderConfigYaml,
} from "../src/config/schema.js";

const CONFIG_DIR = "config";
const OUTPUT_FILE = "src/config/bundled.ts";

// Read models config
const modelsPath = join(CONFIG_DIR, "models.yml");
const modelsYaml = readFileSync(modelsPath, "utf-8");
const models: ModelsConfigYaml = parse(modelsYaml);

// Read all provider configs
const providersDir = join(CONFIG_DIR, "providers");
const providerFiles = readdirSync(providersDir).filter((f) =>
  f.endsWith(".yml")
);
const providers: Record<string, ProviderConfigYaml> = {};

for (const file of providerFiles) {
  const filePath = join(providersDir, file);
  const yaml = readFileSync(filePath, "utf-8");
  const config: ProviderConfigYaml = parse(yaml);
  providers[config.name] = config;
}

// Generate TypeScript output
const output = `// AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
// Source: config/models.yml and config/providers/*.yml
// Regenerate with: npm run build:config

import type { ModelsConfigYaml, ProviderConfigYaml } from "./schema.js";

export const BUNDLED_MODELS: ModelsConfigYaml = ${JSON.stringify(models, null, 2)};

export const BUNDLED_PROVIDERS: Record<string, ProviderConfigYaml> = ${JSON.stringify(providers, null, 2)};
`;

writeFileSync(OUTPUT_FILE, output);
console.log(`Generated ${OUTPUT_FILE}`);
console.log(`  - Models: ${models.models.length} definitions`);
console.log(`  - Generic aliases: ${Object.keys(models.generic_aliases).length}`);
console.log(`  - Providers: ${Object.keys(providers).join(", ")}`);
