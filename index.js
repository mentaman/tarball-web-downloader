
const {crawler, downloader} = require('node-tgz-downloader');
const fs = require("fs");
const uuidv4 = require('uuid/v4');
const express = require('express')
const archiver = require('archiver');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

let download = async (packages, path) => {
    for(let package of packages) {
        let s = `node "${__dirname}/node_modules/node-tgz-downloader/bin/download-tgz" package ${package.name} --directory "${path}"`;
        await exec(s, {
            pwd: path
        });
        
    }
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
const port = 3000

app.get('/', async (req, res) => {
    if(req.query.package) {
        let folder = uuidv4();
        let path =  __dirname+"/tarballs/"+folder;
        let finalPaths = __dirname+"/finals";
        let finalPath = finalPaths+"/"+folder+".zip";
        fs.mkdirSync(path, { recursive: true });
        fs.mkdirSync(finalPaths, { recursive: true });
        console.log("download!");
        await download(
            req.query.package.split(",").map((pack) => ({
                name: pack, 
                version: undefined
            })), path);
        console.log("zip!");
        await zipDirectory(path, finalPath);
        console.log("send results");
        res.download(finalPath, folder+".zip");
    } else {
        res.send("no package")
    }
    
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))