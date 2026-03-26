const input = JSON.parse(await Bun.stdin.text()) as { file_path?: string }
const filePath = input.file_path

if (
	typeof filePath === "string" &&
	/\.(cjs|cts|css|js|jsx|json|jsonc|mjs|mts|ts|tsx)$/.test(filePath)
) {
	Bun.spawnSync(["./node_modules/.bin/biome", "check", "--write", filePath], {
		stdio: ["inherit", "inherit", "inherit"],
	})
}
