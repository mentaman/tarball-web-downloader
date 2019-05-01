import { getWorker, cleanWork, addToWaiting, Work } from './background-work';
const fs = require("fs");
const fsex = require("fs-extra");
const path = require("path");
const uuidv4 = require('uuid/v4');
const express = require('express')

const archiver = require('archiver');
const app = express()

const util = require('util');
const exec = util.promisify(require('child_process').exec);

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



app.get('/', async (req, res, next) => {
    if(req.query.package || req.query.id) {
        try {
            if(req.query.id) {
                console.log("search job!");
                let work = getWorker(req.query.id);
                if(work) {
                    if(work.status === "failed" || work.status === "cleaned") {
                        res.send({error: work.status});
                        return;
                    }
                    else if(work.status === "waiting" || work.status === "working") {
                        res.send({ready: false, id: work.workId});
                        return;
                    }
                    else if(work.status === "done") {
                        if(req.query.download)
                        {
                            let {finalPath, tarName} = work.data;
                            res.download(finalPath, tarName, function(err) {
                                console.log("download- data", work.data);
                                fsex.removeSync(work.data.path);
                                fsex.removeSync(finalPath);
                                cleanWork(work);
                            });
                            return;
                        }
                        else
                        {
                            res.send({ready: true, id: work.workId});
                            return;
                        }
                    }
                    console.log("got job");
                } else {
                    res.send({error: "notfound"});
                    return;
                }
            }
            let folder: string = uuidv4();
            let tarballsPath: string =  path.resolve(__dirname+"/tarballs/"+folder);
            let finalPaths: string = path.resolve(__dirname+"/finals");
            let finalPath: string = finalPaths+"/"+folder+".zip";
            fs.mkdirSync(tarballsPath, { recursive: true });
            fs.writeFileSync(tarballsPath+"/readme.txt", "cool", "utf-8");
            fs.mkdirSync(finalPaths, { recursive: true });
            fs.writeFileSync(finalPaths+"/readme.txt", "great", "utf-8");
            if(!fs.existsSync(`${tarballsPath}`)) {
                res.send({error: "can't create temp folder.."})
                return;
            }
            if(!fs.existsSync(`${finalPaths}`)) {
                res.send({error: "can't create results folder.."})
                return;
            }
            console.log("create job!");
            let packInput = formatInput(req.query.package);
            const downloadJob = addToWaiting("package",async (work: Work) => {
                let results = await download(packInput, tarballsPath);
                if(results.failes.length > 0) {
                    throw new Error("Couldn't download packages: "+results.failes.map(fail => `${fail.package.name}${fail.package.version ? "@"+fail.package.version :""} because ${fail.reason}... | `).join(","));
                } else {
                    console.log("zip!", {path: tarballsPath, finalPath});
                    await zipDirectory(tarballsPath, finalPath);
                    console.log("send results");
                    let date = new Date();
                    let tarName = `tarballs-${date.getDate()}_${date.getMonth()}_${date.getFullYear()}.zip`;
                    console.log("done send results");
                    //return {finalPath, tarName};
                }
            });
            downloadJob.data =  {packInput, path: tarballsPath, finalPath};
            res.send({id: downloadJob.workId}); 
            //queue.create('download', {packInput, path: tarballsPath, finalPath});
        } catch(e) {
            res.send("Couldn't download files");
            console.error(e);
        }
    } else {
        res.sendFile(path.join(__dirname+'/package.html'));
    }
    
})



function zipDirectory(source: string, out: string) {
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
  
let download = async (packages: any[], path: string) => {
    let results = {failes: []};
    for(let pack of packages) {
        try {
            let downloaderPath = `${__dirname}/node_modules/node-tgz-downloader/bin/download-tgz`;
            if(!fs.existsSync(`${downloaderPath}`)) {
                results.failes.push({package: pack, reason: "no downloader"});
                return results;
            }
            if(!fs.existsSync(`${path}`)) {
                results.failes.push({package: pack, reason: `trying to download to a non existing place: (${path})`});
                return results;
            }
            let s = `node "${downloaderPath}" package ${pack.name} --directory "${path}"`;
            let {stdout, stderr} = await exec(s, {
                pwd: path, 
                maxBuffer: 1024 * 1000 * 5
            });
            console.log(stdout);
            if(stderr) {
                console.error(stderr);
                results.failes.push({package: pack, reason: stdout+" & "+stderr});
                
            }
            else if(!fs.existsSync(`${path}`)) {
                results.failes.push({package: pack, reason: "disappeared"});
                console.error("not found" + pack.name)
            }
            else if(!fs.existsSync(`${path}/${pack.name}`)) {
                results.failes.push({package: pack, reason: "didn't download. ---"+s+'---'});
                console.error("not found" + pack.name)
            }
        } catch(e) {
            console.error("error downloading" + e)
            results.failes.push({package: pack, reason: "error"+e})
        }
        
    }
    return results;
};

const server = app.listen(port, () => console.log(`Example app listening on port ${port}!`))
server.setTimeout(60*1000*30);
