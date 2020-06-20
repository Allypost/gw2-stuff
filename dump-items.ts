#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net=api.guildwars2.com --unstable

import {
  itemsFileName,
  itemsMapFileName,
  arrayChunk,
  log,
  Gw2Api,
  logOverride,
  AtomicCounter,
  AtomicUInt32Array,
  sleep,
  WorkerMessage,
  WorkerMessageTypeWorker,
  WorkerMessageTypeHost,
  Gw2Item,
  Gw2ItemMap,
} from "./includes/helpers.ts";

const itemIds: number[] = await Gw2Api.get("/items", []);
const itemIdChunks = arrayChunk(itemIds, 200);
const workerThreads = Math.min(16, itemIdChunks.length);
const pollRate = 10; // ms
const itemsData: { [key: number]: Gw2Item[] } = {};

const itemIdChunkIndex = new AtomicCounter();
const itemsDataIndex = new AtomicCounter();
const workersReady = new AtomicUInt32Array(workerThreads);
const workersDone = new AtomicUInt32Array(workerThreads);

const workerUrl = new URL("./workers/dump-items.worker.ts", import.meta.url).href;
const workers = Array(workerThreads)
  .fill(0)
  .map(
    (_, i) =>
      new Worker(workerUrl, {
        type: "module",
        deno: true,
        name: i.toString().padStart(String(workerThreads).length, "0"),
      })
  );

const postMessage = (worker: Worker, message: WorkerMessage) => {
  return worker.postMessage(message);
};

const getNextItemIdChunkUrl = (chunkIndex?: number): string | null => {
  if (chunkIndex === undefined) {
    if (itemIdChunkIndex.value >= itemIdChunks.length) {
      return null;
    }

    chunkIndex = itemIdChunkIndex.increment();
  }

  if (false === chunkIndex in itemIdChunks) {
    return null;
  }

  return `/items?ids=${itemIdChunks[chunkIndex].join(",")}`;
};

const allWorkersDone = (): boolean => workersDone.sum() >= workers.length;

const allWorkersReady = (): boolean => workersReady.sum() >= workers.length;

const workerProcessNextItem = (workerId: number): number | undefined => {
  const url = getNextItemIdChunkUrl();

  if (!url) {
    return workersDone.set(workerId, 1);
  }

  postMessage(workers[workerId], {
    type: WorkerMessageTypeHost.FETCH,
    data: url,
  });
};

const handleWorkerMessage = async ({ id, type, data }: WorkerMessage) => {
  const workerLog = (...args: any) => log(`[Worker ${id}]`, ...args);

  switch (type) {
    case WorkerMessageTypeWorker.STATUS:
      {
        const { id, ready } = data;

        workersReady.set(id, Number(ready));
      }
      break;

    case WorkerMessageTypeWorker.DATA:
      {
        const index = itemsDataIndex.increment();
        itemsData[index] = data;

        await sleep(300);

        if (itemsData[index] !== data) {
          log("ERROR", index, "\n\n");
        }

        workerProcessNextItem(Number(id));
      }
      break;

    default:
      workerLog("Unknown message", { type, data });
  }
};

const prettyPrintSeconds = (seconds: number) => {
  const res = [];

  const secs = Math.ceil(seconds);
  if (secs > 0) {
    res.unshift(`${secs % 60}s`);
  }

  const mins = Math.floor(seconds / 60);
  if (mins > 0) {
    res.unshift(`${mins % 60}m`);
  }

  const hours = Math.floor(mins / 60);
  if (hours > 0) {
    res.unshift(`${hours % 60}m`);
  }

  return res.join(", ");
};

workers.forEach((worker, workerId) => {
  worker.onmessage = (evt: MessageEvent): void => {
    handleWorkerMessage(evt.data);
  };

  // Initial batch
  postMessage(worker, {
    type: WorkerMessageTypeHost.FETCH,
    data: getNextItemIdChunkUrl(workerId),
  });
});

log("Waiting for workers to be ready...");
while (!allWorkersReady()) {
  const ready = workersReady.sum();
  const total = workerThreads;

  logOverride(`Waiting for workers to be ready... (${ready}/${total})`);
  await sleep(pollRate);
}
logOverride("Workers ready");

log("Fetching item pages: Preparing...");
const startTime = Date.now();
let remainingTimeString = "Calculating...";
let lastMeasureTime = Date.now();
while (!allWorkersDone()) {
  const total = itemIdChunks.length;
  const done = itemIdChunkIndex.value;
  const remaining = total - done;

  const percent = Math.floor((done / total) * 100 * 100) / 100;

  const elapsedSeconds = (Date.now() - startTime) / 1000;
  const deltaSeconds = (Date.now() - lastMeasureTime) / 1000;

  // Only update remaining time once a second max
  if (deltaSeconds >= 1 && done > 0 && remaining > 0) {
    // v = x / t
    const speed = done / elapsedSeconds; // items/s
    const remainingTimeSeconds = remaining / speed; // t = x / v

    remainingTimeString = prettyPrintSeconds(remainingTimeSeconds);

    lastMeasureTime = Date.now();
  }

  if (remaining === 0) {
    remainingTimeString = "Processing...";
  }

  const percentString = percent.toFixed(2).padStart(3 + 1 + 2);
  const doneString = String(done).padStart(String(total).length);
  const elapsedString = prettyPrintSeconds(elapsedSeconds);

  logOverride(
    `Fetching item pages: ${doneString}/${total} (${percentString}%) | ETA ${remainingTimeString} | Elapsed ${elapsedString}`
  );

  await sleep(pollRate);
}
const totalTime = (Date.now() - startTime) / 1000;
logOverride(`Fetched item pages in ${prettyPrintSeconds(totalTime)}`);

log("Processing data...");
const itemsList = Array.from(new Set(Object.values(itemsData).flat())).sort(
  (a: any, b: any) => a.id - b.id
);
const itemsMap: Gw2ItemMap = Object.fromEntries(
  itemsList.map((item: any) => [item.id, item])
);
logOverride("Processed data");

log("Writing data...");
Deno.writeTextFileSync(itemsFileName, JSON.stringify(itemsList));
Deno.writeTextFileSync(itemsMapFileName, JSON.stringify(itemsMap));
logOverride("Done writing");

log("Shutting down workers...");
workers.forEach((worker) => {
  worker.terminate();
});
logOverride("Workers shut down");

log("Done!");
Deno.exit(0);
