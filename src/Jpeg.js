const worker = new Worker("./src/JpegWorker.js", { type: "module" });

export function decode(buffer, offset, length, callback) {
    return new Promise((resolve, reject) => {
        worker.postMessage({
            "type": "decode",
            "buffer": buffer,
            "offset": offset,
            "length": length
        });
        worker.onmessage = (event) => {
            if (event.data.type === "end") {
                resolve();
            } else {
                callback(event.data.type, event.data.data);
            }
        }
        worker.onerror = (event) => {
            reject(new Error(`Decode error: ${event.message}`));
        }
    });
}
