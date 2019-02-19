import kue from 'kue';
const fs = require("fs");
const express = require('express')
const archiver = require('archiver');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

let queue = kue.createQueue({
});

queue.process('download', async (job, done) => {
    try { 
        let results = await download(job.data.packages, job.data.path);

        if(results.failes.length > 0) {
            console.log(JSON.stringify(results.failes));
            done(new Error("Couldn't download packages: "+results.failes.map(package => `${package.name}${package.version ? "@"+package.version :""}`).join(",")));
        } else {
            console.log("zip!");
            await zipDirectory(path, finalPath);
            console.log("send results");
            let date = new Date();
            let tarName = `tarballs-${date.getDate()}_${date.getMonth()}_${date.getFullYear()}.zip`;
            done(null, {finalPath, tarName})
        }
    } catch(e) {
        done(new Error("Something bad happend"));
    }
  });



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
  
let download = async (packages, path) => {
    let results = {failes: []};
    for(let package of packages) {
        try {
            let s = `node "${__dirname}/node_modules/node-tgz-downloader/bin/download-tgz" package ${package.name} --directory "${path}"`;
            let {stdout, stderr} = await exec(s, {
                pwd: path, 
                maxBuffer: 1024 * 1000 * 5
            });
            console.log(stdout);
            if(stderr) {
                console.error(stderr);
                results.failes.push(package);
                
            }
            else if(!fs.existsSync(`${path}/${package.name}`)) {
                results.failes.push(package);
                console.error("not found" + package.name)
            }
        } catch(e) {
            console.error("error downloading" + e)
            results.failes.push(package)
        }
        
    }
    return results;
};