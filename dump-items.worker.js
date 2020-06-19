const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const log = (...args) => console.log(`|> [${self.name}]`, ...args);

log("Started");

self.onmessage = async ({ data: url }) => {
  const ms = Math.random() * 800;

  await sleep(ms);

  self.postMessage(url);
};
