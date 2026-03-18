const input = JSON.parse(await Bun.stdin.text())

if (input.status === "completed") {
	Bun.spawnSync(["bun", "run", "typecheck"], {
		stdio: ["inherit", "inherit", "inherit"],
	})
}
