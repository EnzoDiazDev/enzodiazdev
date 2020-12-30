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
    await run("npm run build");
    await run("git add .");
    await run("git commit -am \"autodeploy\"");
    await run("git push origin main");
}

main();
