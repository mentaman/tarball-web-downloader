const fs = require("fs");
const fsex = require("fs-extra");
const path = require("path");
const uuidv4 = require('uuid/v4');
const express = require('express')
const kue = require("kue");

const app = express()

const port = process.env.PORT || 8080;

let queue = kue.createQueue({
    prefix: "server",
    redis: {
        host: "redis-10334.c72.eu-west-1-2.ec2.cloud.redislabs.com",
        port: 10334,
        auth: 'CR8ojGUU5LKzWzHMRJJazhOqJlJuzBZ5'
    }
});

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
                kue.Job.get( req.query.id, function( err, job ) {
                    // change job properties
                    if(err) {
                        res.send("error getting your job."+err);
                    } else {
                        console.log("got job", `data: ${JSON.stringify(job.data)} error: ${JSON.stringify(job._error)}`);
                        if(job._error) {
                            res.send({error: job._error});
                            job.remove();
                        } else if(!job.result) {
                            res.send({ready: false, id: job.id});
                        } else {
                            console.log("awesome!", job.result);
                            if(req.query.download) {
                                let {finalPath, tarName} = job.result;
                                res.download(finalPath, tarName, function(err) {
                                    fsex.removeSync(job.data.path);
                                    fsex.removeSync(finalPath);
                                    job.remove();
                                });
                            } else {
                                res.send({ready: true, id: job.id})
                            }
                        }
                    }
                  });
                  return;
            }
            let folder = uuidv4();
            let path =  require('os').tmpdir()+"/tarballs/"+folder;
            let finalPaths = require('os').tmpdir()+"/finals";
            if(!fs.existsSync(`${path}`)) {
                res.send({error: "can't create temp folder.."})
                return;
            }
            if(!fs.existsSync(`${finalPaths}`)) {
                res.send({error: "can't create results folder.."})
                return;
            }
            let finalPath = finalPaths+"/"+folder+".zip";
            fs.mkdirSync(path, { recursive: true });
            fs.mkdirSync(finalPaths, { recursive: true });
            console.log("create job!");
            let packInput = formatInput(req.query.package);
            const downloadJob = queue.create('download', {packInput, path, finalPath});
            downloadJob
                .ttl(30 * 60 * 1000)
                .save((error) => {
                    console.log("save job");
                    if (error) {
                        console.log("save error"+JSON.stringify(error));
                        res.send({error: "save error"+JSON.stringify(error)});
                      return;
                    }
                    downloadJob.on('complete', result => {
                        console.log("completed job");
                    });
                    downloadJob.on('failed', (error) => {
                        console.log("job failed"+JSON.stringify(error));
                        //res.send("damnit: "+JSON.stringify(error));
                    });
                    downloadJob.on('start', () => {
                        console.log("start");
                        res.send({id: downloadJob.id, exists: });
                    });
                  });
        } catch(e) {
            res.send("Couldn't download files");
            console.error(e);
        }
    } else {
        res.sendFile(path.join(__dirname+'/package.html'));
    }
    
})

const server = app.listen(port, () => console.log(`Example app listening on port ${port}!`))
server.setTimeout(60*1000*30);
