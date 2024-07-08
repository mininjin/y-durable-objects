import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import { defineConfig } from "rollup";

export default defineConfig({
	input: "src/index.ts",
	output: {
		exports: "named",
		format: "es",
		file: "dist/index.mjs",
		sourcemap: true,
	},
	external: [/^cloudflare:/],
	plugins: [
		commonjs(),
		nodeResolve({
			exportConditions: ["browser", "worker"],
			browser: true,
		}),
		typescript(),
	],
});
