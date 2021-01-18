const {exec} = require("child_process");

function run(command){
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout) => {
            if(error) reject(error);
            resolve(stdout);
        });
    });
}

async function main(){
    await run("npm run build")
        .then(console.log)
        .catch(console.error);

    await run("git add .")
        .then(console.log)
        .catch(console.error);

    await run("git commit -am \"autodeploy\"")
        .then(console.log)
        .catch(console.error);

    await run("git push origin main")
        .then(console.log)
        .catch(console.error);

}

main();
