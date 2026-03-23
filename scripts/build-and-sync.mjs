import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyToVault } from "./copy-to-vault.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginDir = resolve(scriptDir, "..");
const releaseRootDir = resolve(pluginDir, "openchat");
const buildFiles = ["main.js", "styles.css", "manifest.json"];

function runProductionBuild() {
	return new Promise((resolveBuild, rejectBuild) => {
		const child = spawn(
			process.execPath,
			[resolve(pluginDir, "esbuild.config.mjs"), "production"],
			{
				cwd: pluginDir,
				stdio: "inherit",
				shell: false
			}
		);

		child.on("error", (error) => {
			rejectBuild(new Error(`[openchat] Build process failed to start: ${error.message}`));
		});

		child.on("close", (code) => {
			if (code === 0) {
				resolveBuild();
				return;
			}
			rejectBuild(new Error(`[openchat] Build failed with exit code ${code}`));
		});
	});
}

async function readManifest() {
	const manifestPath = resolve(pluginDir, "manifest.json");
	const manifestContent = await readFile(manifestPath, "utf8");
	return JSON.parse(manifestContent);
}

async function archiveBuildArtifacts(version) {
	const versionDir = resolve(releaseRootDir, version);

	await mkdir(versionDir, { recursive: true });

	for (const fileName of buildFiles) {
		const sourcePath = resolve(pluginDir, fileName);
		const targetPath = resolve(versionDir, fileName);
		await copyFile(sourcePath, targetPath);
	}

	return versionDir;
}

try {
	console.log("[openchat] Starting production build...");
	await runProductionBuild();
	const manifest = await readManifest();
	if (!manifest?.version || typeof manifest.version !== "string") {
		throw new Error("[openchat] manifest.json 缺少有效的 version 字段");
	}

	console.log(`[openchat] Build finished. Archiving files to openchat/${manifest.version}...`);
	const versionDir = await archiveBuildArtifacts(manifest.version);

	console.log("[openchat] Archive finished. Syncing files to Obsidian vault...");
	await copyToVault({
		sourceDir: versionDir,
		fileNames: buildFiles
	});
	console.log("[openchat] Build + sync completed.");
} catch (error) {
	console.error(`[openchat] Build + sync failed: ${error.message}`);
	process.exit(1);
}
