import {
  WorkerMessageTypeWorker,
  WorkerMessage,
  WorkerMessageTypeHost,
  log,
  Gw2Api,
  sleep,
} from "../includes/helpers.ts";

// @ts-ignore: Unknown property name (exists on `Worker`s)
const id = Number.parseInt(self.name);

const postMessage = (msg: WorkerMessage) => self.postMessage({ ...msg, id });

postMessage({
  type: WorkerMessageTypeWorker.STATUS,
  data: {
    id,
    ready: true,
  },
});

const handleMessage = async ({ type, data }: WorkerMessage) => {
  switch (type) {
    case WorkerMessageTypeHost.FETCH:
      {
        postMessage({
          type: WorkerMessageTypeWorker.DATA,
          data: await Gw2Api.get(data),
        });
      }
      break;
    default:
      log("|> UNKNOWN MESSAGE", { type, data });
      break;
  }
};

self.onmessage = async (msg) => {
  const message: WorkerMessage = msg.data;

  await handleMessage(message);
};
