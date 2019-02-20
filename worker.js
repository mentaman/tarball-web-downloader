const kue = require("kue");
const fs = require("fs");
const express = require('express')
const archiver = require('archiver');
const util = require('util');
const exec = util.promisify(require('child_process').exec);
const path = require("path");

let queue = kue.createQueue({
    prefix: "server",
    redis: {
        host: "redis-10334.c72.eu-west-1-2.ec2.cloud.redislabs.com",
        port: 10334,
        auth: 'CR8ojGUU5LKzWzHMRJJazhOqJlJuzBZ5'
    }
});
queue.process('download', async (job, done) => {
    try { 
        console.log("process job: ", JSON.stringify(job.data));
        let finalPath = job.data.finalPath;
        fs.mkdirSync(path.dirname(finalPath), { recursive: true });
        fs.mkdirSync(job.data.path, { recursive: true });
        let results = await download(job.data.packInput, job.data.path);
        if(results.failes.length > 0) {
            console.log(JSON.stringify(results.failes));
            done(new Error("Couldn't download packages: "+results.failes.map(fail => `${fail.package.name}${fail.package.version ? "@"+fail.package.version :""} because ${fail.reason}... | `).join(",")));
        } else {
            console.log("zip!", {path: job.data.path, finalPath});
            await zipDirectory(job.data.path, finalPath);
            console.log("send results");
            let date = new Date();
            let tarName = `tarballs-${date.getDate()}_${date.getMonth()}_${date.getFullYear()}.zip`;
            console.log("done send results");
            done(null, {finalPath, tarName})
        }
    } catch(e) {
        console.log(`Something bad happend: ${JSON.stringify(e)} ${e.message}`)
        done(new Error(`Something bad happend: ${JSON.stringify(e)} ${e.message}`));
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
            let downloaderPath = `${__dirname}/node_modules/node-tgz-downloader/bin/download-tgz`;
            
            if(!fs.existsSync(`${downloaderPath}`)) {
                results.failes.push({package, reason: "no downloader"});
                return results;
            }
            if(!fs.existsSync(`${path}`)) {
                results.failes.push({package, reason: `trying to download to a non existing place: (${path})`});
                return results;
            }
            let s = `node "${downloaderPath}" package ${package.name} --directory "${path}"`;
            let {stdout, stderr} = await exec(s, {
                pwd: path, 
                maxBuffer: 1024 * 1000 * 5
            });
            console.log(stdout);
            if(stderr) {
                console.error(stderr);
                results.failes.push({package, reason: stdout+" & "+stderr});
                
            }
            else if(!fs.existsSync(`${path}`)) {
                results.failes.push({package, reason: "disappeared"});
                console.error("not found" + package.name)
            }
            else if(!fs.existsSync(`${path}/${package.name}`)) {
                results.failes.push({package, reason: "didn't download. ---"+s+'---'});
                console.error("not found" + package.name)
            }
        } catch(e) {
            console.error("error downloading" + e)
            results.failes.push({package, reason: "error"+e})
        }
        
    }
    return results;
};