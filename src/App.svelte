<script lang="ts">
	import MarkdownViewer from './components/MarkdownViewer.svelte';
	import LastPost from './components/LastPost.svelte';

	async function get_readme() {
		return fetch("https://api.github.com/repos/EnzoDiazDev/EnzoDiazDev/contents/README.md", {
			headers: {
				"accept": "application/vnd.github.VERSION.raw"
			}
		}).then(response => response.body.getReader().read())
			.then(uintarray => new TextDecoder("utf-8").decode(uintarray.value))
	}

	function parse_readme(text){
		//Remove header and footer
		return text
			.split("<!--header--->").slice(1)
			.join("")
			.split("<!--footer-->").shift();
	}

	async function get_lastpost(){
		/**
		 * @type {{
		 *  title:string,
		 *  link:string,
		 *  description:string
		 * }}
		 */
	 	return await fetch("https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/@enzodiazdev")
			.then(response => response.json())
			.then(data => data.items.shift());
	}

	//let readme = get_readme();
</script>

{#await get_readme() then text}
	<MarkdownViewer content={parse_readme(text)}/>
	{#await get_lastpost() then lastpost}
		<LastPost title={lastpost.title} description={lastpost.description} link={lastpost.link}/>
	{/await}
{/await}


<style>
</style>