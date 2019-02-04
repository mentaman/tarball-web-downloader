const fs = require("fs");
const fsex = require("fs-extra");
const path = require("path");
const uuidv4 = require('uuid/v4');
const express = require('express')
const archiver = require('archiver');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

let download = async (packages, path) => {
    let results = {failes: []};
    for(let package of packages) {
        try {
            let s = `node "${__dirname}/node_modules/node-tgz-downloader/bin/download-tgz" package ${package.name} --directory "${path}"`;
            let {stdout, stderr} = await exec(s, {
                pwd: path
            });
            console.log(stdout);
            if(stderr) {
                console.error(stderr);
                results.failes.push(package);
            }
            else if(!fs.existsSync(`${path}/${package.name}`)) {
                results.failes.push(package);
            }
        } catch(e) {
            results.failes.push(package)
        }
        
    }
    return results;
};

async function main() {
    let folder = uuidv4();
    let path =  __dirname+"/tarballs/"+folder;
    let finalPath = __dirname+"/finals";
    fs.mkdirSync(path, { recursive: true });
    fs.mkdirSync(finalPath, { recursive: true });
    await download("smallest", undefined, path);
    await zipDirectory(path, finalPath+"/"+folder+".zip");
;}

function zipDirectory(source, out) {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(out);
  
    return new Promise((resolve, reject) => {
      archive
        .directory(source, false)
        .on('error', err => reject(err))
        .pipe(stream)
      ;
  
      stream.on('close', () => resolve());
      archive.finalize();
    });
  }

const app = express()
const port = process.env.PORT || 8080;

function formatInput(input) {
    return input.split(",").map((pack) => {
        let packsplit = pack.split("@");
        return ({
            name: packsplit[0], 
            version: packsplit.length > 1 ? packsplit[1] : undefined
        })
    })
}

app.get('/', async (req, res) => {
    if(req.query.package) {
        try {
            let folder = uuidv4();
            let path =  __dirname+"/tarballs/"+folder;
            let finalPaths = __dirname+"/finals";
            let finalPath = finalPaths+"/"+folder+".zip";
            fs.mkdirSync(path, { recursive: true });
            fs.mkdirSync(finalPaths, { recursive: true });
            console.log("download!");
            let packInput = formatInput(req.query.package);
            let results = await download(
                packInput, path);
            if(results.failes.length > 0) {
                console.log(JSON.stringify(results.failes));
                res.send("Couldn't download packages: "+results.failes.map(package => `${package.name}${package.version ? "@"+package.version :""}`).join(","));
            } else {
                console.log("zip!");
                await zipDirectory(path, finalPath);
                console.log("send results");
                let date = new Date();
                res.download(finalPath, `tarballs-${date.getDate()}_${date.getMonth()}_${date.getFullYear()}.zip`, function(err) {
                    fsex.removeSync(path);
                    fsex.removeSync(finalPath);
                });
               
            }
        } catch(e) {
            res.send("Couldn't download files");
            console.error(e);
        }
    } else {
        res.sendFile(path.join(__dirname+'/package.html'));
    }
    
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))