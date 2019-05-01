
let checkEvery: number = 100;
let maxWorking: number = 4;

let workCount: number = 0;

let waiting: Work[] = [];
let working: {[id: string]: Work} = {};
let works: {[id: string]: Work} = {};
let worksNames: {[id: string]: Work[]} = {};

export class Work {
    cleanedStuff: boolean = false;
    status: Status;
    workfunc: (work: Work) => Promise<any>;
    workId: string;
    name: string;
    data: any;
    timeoutAt: Date;
    complete() {
        this.status = "done";
        delete working[this.workId];
    }
    clean() {
        cleanWork(this);
    }
    cleanStuff() {
        this.onCleanStuff();
        this.cleanedStuff = true;
    }
    onCleanStuff() {

    }
}
 
export type Status = "waiting" | "working" | "done" | "cleaned" | "failed";

export function getWorker(id: string): Work {
    return works[id];
}

export function getWorkersByName(name: string): Work[] {
    return worksNames[name] || [];
}

//TODO: expire to clean
//TODO: also clean timeout and not only handly. and cleanStuff there..
//TODO: use cancel token to also cancel the work itself.. 
export function cleanWork(work: Work) {
    if(!works[work.workId]) {
        return;
    }
    if(!work.cleanedStuff) work.cleanStuff();
    console.log("clean");
    work.status = "cleaned";
    
    delete works[work.workId];
    
    worksNames[work.name] = worksNames[work.name].filter(w => w.workId === work.workId);
    if(worksNames[work.name].length === 0) {
        delete worksNames[work.name];
    }

    if(working[work.workId]) delete working[work.workId];
}

export function addToWaiting(name: string, workfunc: (work: Work) => Promise<any>) {
    let workId = workCount++;
    let work = new Work();
    work.workId = workId.toString();
    work.name = name;
    work.workfunc = workfunc;
    work.status = "waiting";
    work.timeoutAt = new Date((new Date().getTime())+1000*60*10);
    work.data = {};
    waiting.push(work);
    works[work.workId] = work;
    if(!worksNames[work.name]) {
        worksNames[work.name] = [];
    }
    worksNames[work.name].push(work);
    return work;
}

setInterval(() => {
    for(let work of Object.values(works)) {
        if(new Date().getTime() > work.timeoutAt.getTime())
        {
            if(!work.cleanedStuff) {
                work.cleanStuff();
            }
            work.clean();
        }
    }
    if(waiting.length > 0) {
        if(Object.keys(working).length < maxWorking) {
            let current: Work = waiting.pop();
            current.status = "working";
            working[current.workId] = current;
            //TODO: run in a try catch. and change status to failed.  both for promise and void
            runWork(current);
        }
    }
}, checkEvery);

async function runWork(work: Work) {
    try {
        console.log("start work!"+work.workId);
        let res = await work.workfunc(work);
        console.log("done work!");
        if(res != undefined) {
            work.data = res;
        }
        work.complete();
    } catch(e) {
        console.log(`worker ${work.workId} failed`, e);
        work.cleanStuff();
        work.status = "failed";
    }
}