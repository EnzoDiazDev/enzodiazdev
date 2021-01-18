const {get} = require("axios").default;
const {readFile, writeFile} = require("fs/promises");

async function main(){
    /**
     * @type {{
     *  title:string,
     *  link:string,
     *  description:string
     * }}
     */
    const lastpost = await get("https://api.rss2json.com/v1/api.json?rss_url=https://medium.com/feed/@enzodiazdev")
        .then(({data}) => data.items.shift());

    const template = await readFile("./scripts/lastpost.md", { encoding: "utf-8" });
    const with_title = template.replace("title", lastpost.title);
    const with_content = with_title.replace("content", lastpost.description.replace(/\n/g,"").slice(0, 550).trim() + "...");
    const table = with_content.replace("link", lastpost.link);

    const readme = await readFile("./README.md", { encoding: "utf-8" });
    const new_readme = readme.replace(/<!--lpstart--->[\s\S]*<!--lpend--->/, `<!--lpstart--->\n${table}\n<!--lpend--->`);

    await writeFile("./README.md", new_readme);
}

main();
