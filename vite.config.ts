import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
	plugins: [react(), tailwindcss(), cloudflare()],
	environments: {
		client: {
			build: {
				rollupOptions: {
					// 404.html is its own page so it shares the Tailwind theme and fonts.
					input: ["index.html", "404.html"],
				},
			},
		},
	},
});
