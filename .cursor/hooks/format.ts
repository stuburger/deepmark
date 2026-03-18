const input = JSON.parse(await Bun.stdin.text())
const filePath: string = input.file_path

if (/\.(ts|tsx|js|jsx|json|css)$/.test(filePath)) {
	Bun.spawnSync(["./node_modules/.bin/biome", "check", "--write", filePath], {
		stdio: ["inherit", "inherit", "inherit"],
	})
}
