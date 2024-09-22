import {JpegDecoder} from "./JpegDecoder.js";

onmessage = (event) => {
    let data = event.data;
    switch (data.type) {
        case "decode":
            new JpegDecoder(data.buffer, data.offset, data.length)
                .decode((type, data) => {
                    postMessage({
                        "type": type,
                        "data": data
                    })
                });
    }
}
