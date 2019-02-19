const fs = require("fs");
const fsex = require("fs-extra");
const path = require("path");
const uuidv4 = require('uuid/v4');
const express = require('express')
const archiver = require('archiver');
const kue = require("kue");

const app = express()

const port = process.env.PORT || 8080;

let queue = kue.createQueue({
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

            const downloadJob = queue.create('download', {packInput, path});
            downloadJob
                .removeOnComplete(true)
                .save((error) => {
                    if (error) {
                        res.send("damnit, save error. "+JSON.stringify(error));
                      return;
                    }
                    downloadJob.on('complete', result => {
                        let {finalPath, tarName} = result;
                        res.download(finalPath, tarName, function(err) {
                            fsex.removeSync(path);
                            fsex.removeSync(finalPath);
                        });
                    });
                    downloadJob.on('failed', (error) => {
                      res.send("damnit: "+JSON.stringify(error));
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
