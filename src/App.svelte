<script lang="ts">
	import MarkdownViewer from './components/MarkdownViewer.svelte';

	async function get_readme() {
		return fetch("https://api.github.com/repos/EnzoDiazDev/EnzoDiazDev/contents/README.md", {
			headers: {
				"accept": "application/vnd.github.VERSION.raw"
			}
		}).then(response => response.body.getReader().read())
			.then(uintarray => new TextDecoder("utf-8").decode(uintarray.value))
	}

	let readme = get_readme();
</script>

{#await readme then text}
	<MarkdownViewer content={text.split("<!--header--->").slice(1).join("")}/>
{/await}


<style>
</style>