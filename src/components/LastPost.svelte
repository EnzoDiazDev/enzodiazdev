<script lang="ts">
import { onMount } from "svelte";


    export let title
    export let description
    export let link

    let description_element;

    onMount(() => {
        description_element.innerHTML = description.slice(0, 550)
            .trim() + "..."
            .replace(/<h4>/g, "<h6>")
    })
</script>

<h5>Último post</h5>
<article>
    <h2>{title}</h2>
    <div bind:this={description_element}></div>
    <div class="readmore">
        <a target="_blank" href={link}>leer más...</a>
    </div>
</article>

<style>
    h5 {
        margin: 40px 0 20px 0;
    }
    article {
        padding: 30px;
        border: 1px solid #eaecef;
        border-radius: 10px;
    }
    h2 {
        margin: 0;
        font-size: 2rem;
        margin-bottom: 20px;
    }

    .readmore {
        padding: 5px;
        text-align: right;
    }
</style>