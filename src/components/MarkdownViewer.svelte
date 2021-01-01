<script lang="ts">
	import {Viewer} from "bytemd";

	export let article:string;
</script>

<article class="markdown-body">
    <Viewer value={article}/>
</article>