<script lang="ts">
	import MarkdownViewer from './components/MarkdownViewer.svelte';
	let article = "# Hola"
</script>

<MarkdownViewer bind:article={article} />


<style>
</style>