
import * as Decoder from "./src/JpegDecoder.js"

let uploadFile;

onload = () => {
    uploadFile = document.getElementById("uploadFile");
    uploadFile.addEventListener("change", onUploadImage);
}

function onUploadImage(event) {
    let files = event.target.files;
    if (files.length != 1) {
        return;
    }
    let file = files[0];
    let image = new Image();
    image.src = URL.createObjectURL(file);

    let fileReader = new FileReader();
    fileReader.onload = (event) => {
        let decoder = new Decoder.JpegDecoder(fileReader.result);
        decoder.decode((type, out) => {
            if (type == "decodeImage") {
                let canvas = document.createElement("canvas");
                canvas.width = out.width;
                canvas.height = out.height;

                let context = canvas.getContext("2d");
                let imageData = context.createImageData(out.width, out.height);
                for (let i = 0; i < out.width * out.height; ++i) {
                    imageData.data[4 * i + 0] = out.pixels[3 * i + 0];
                    imageData.data[4 * i + 1] = out.pixels[3 * i + 1];
                    imageData.data[4 * i + 2] = out.pixels[3 * i + 2];
                    imageData.data[4 * i + 3] = 255;
                }
                context.putImageData(imageData, 0, 0);
                document.body.append(canvas);
            }
        });
    }
    fileReader.readAsArrayBuffer(file);
}
