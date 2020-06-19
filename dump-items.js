#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net=api.guildwars2.com --unstable

import {
  itemsFileName,
  itemsMapFileName,
  arrayChunk,
  log,
  fileTextAppender,
  getApi,
  logOverride,
  AtomicUintCounter,
  AtomicUInt32Array,
} from "./helpers.ts";

const itemIds = await getApi("/items", []);
const itemIdChunks = arrayChunk(itemIds, 200);
const workerThreads = Math.min(8, itemIdChunks.length);
const pollRate = 10; // ms

const workerUrl = new URL("dump-items.worker.js", import.meta.url).href;

const workers = Array(workerThreads)
  .fill(0)
  .map(
    (_, i) =>
      new Worker(workerUrl, {
        type: "module",
        deno: true,
        name: `Worker ${i}`,
      })
  );

const itemIdChunkIndex = new AtomicUintCounter();
const workersDone = new AtomicUInt32Array(workerThreads);

const getNextItemIdChunkUrl = (i = null) => {
  if (i === null) {
    i = itemIdChunkIndex.increment();
  }

  return `/items?ids=${itemIdChunks[i].join(",")}`;
};

const allWorkersDone = () => {
  if (itemIdChunkIndex.value >= itemIdChunks.length) {
    return true;
  }

  return workersDone.sum() >= workers.length;
};

const workerProcessNextItem = (workerId) => {
  if (itemIdChunkIndex.value >= itemIdChunks.length - 1) {
    return workersDone.set(workerId, 1);
  }

  const i = itemIdChunkIndex.increment();

  workers[workerId].postMessage(`/items?ids=${itemIdChunks[i].join(",")}`);
};

workers.forEach((worker, workerId) => {
  worker.addEventListener("message", async ({ data }) => {
    workerProcessNextItem(workerId);
  });

  // Initial batch
  const chunk = getNextItemIdChunkUrl(workerId);
  worker.postMessage(chunk);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

log("Fetching item pages: Preparing...");
while (!allWorkersDone()) {
  const total = itemIdChunks.length;
  const done = itemIdChunkIndex.value;

  const percent = Math.floor((done / total) * 100 * 100) / 100;

  logOverride(
    `Fetching item pages: ${percent.toFixed(2).padStart(3 + 1 + 2)}%`
  );

  await sleep(pollRate);
}
logOverride(`Fetched item pages`);

//

//

//

//

Deno.exit(0);

Deno.createSync(itemsFileName);

const file = Deno.openSync(itemsFileName, { read: true, write: true });
const appendToFile = fileTextAppender(file);

appendToFile("[\n");

log("Fetching item pages...");
let i = 0;
for await (const itemIdList of itemIdChunks) {
  logOverride(`Fetching page ${++i}/${itemIdChunks.length}...`);
  const data = await getApi(`/items?ids=${itemIdList.join(",")}`);
  const dataString = JSON.stringify(data);

  appendToFile(dataString);
  appendToFile("\n,");
}
logOverride(`Fetched item pages`);

file.seekSync(-1, Deno.SeekMode.Current);
appendToFile("\n]");
file.close();

log("Flattening items list...");
const flatItemList = JSON.parse(Deno.readTextFileSync(itemsFileName)).flat();
logOverride(`Flattened items list`);

log("Writing items file...");
Deno.writeTextFileSync(itemsFileName, JSON.stringify(flatItemList));
logOverride(`Wrote items file`);

log("Generating item map...");
const itemMap = Object.fromEntries(flatItemList.map((item) => [item.id, item]));
logOverride(`Generated item map`);

log("Writing item map file...");
Deno.writeTextFileSync(itemsMapFileName, JSON.stringify(itemMap));
logOverride(`Wrote item map file`);
