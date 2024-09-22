import * as Decoder from "./src/JpegDecoder.js";
import {ycbcrToRgb, rgbToYcbcr, reorderZigzagSequence} from "./src/JpegCommon.js";
import {dct, idct} from "./src/JpegSignal.js";
import {dct2D, idct2D} from "./src/ExpImp.js";

let uploadFile;
let previousCanvas = null;

let img;

function rgbToCmyk(r, g, b) {
    // RGBを0〜1に正規化
    let rPrime = r / 255;
    let gPrime = g / 255;
    let bPrime = b / 255;

    // K（ブラック）の計算
    let k = 1 - Math.max(rPrime, gPrime, bPrime);

    // すべてが0の場合（完全な黒）なら、C, M, Yも0にする
    if (k === 1) {
        return {c: 0, m: 0, y: 0, k: 100};
    }

    // C（シアン）, M（マゼンタ）, Y（イエロー）の計算
    let c = (1 - rPrime - k) / (1 - k);
    let m = (1 - gPrime - k) / (1 - k);
    let y = (1 - bPrime - k) / (1 - k);

    // 0〜1の範囲を0〜100に変換
    return {
        c: Math.round(c * 100),
        m: Math.round(m * 100),
        y: Math.round(y * 100),
        k: Math.round(k * 100)
    };
}

function cmykToRgb(c, m, y, k) {
    // CMYKを0〜1の範囲に正規化
    c = c / 100;
    m = m / 100;
    y = y / 100;
    k = k / 100;

    // RGBの計算
    let r = 255 * (1 - c) * (1 - k);
    let g = 255 * (1 - m) * (1 - k);
    let b = 255 * (1 - y) * (1 - k);

    // 結果を四捨五入して整数にする
    return {
        r: Math.round(r),
        g: Math.round(g),
        b: Math.round(b)
    };
}

function grayToHeatmap(v) {
    let value = v / 255;

    let r = 0;
    if (value > 0.5) {
        if (value < 0.75) {
            r = (value - 0.5) * 4.0;
        } else {
            r = 1.0;
        }
    }

    let g = 1.0;
    if (value < 0.25) {
        g = value * 4.0;
    } else if (value > 0.750) {
        g = 1 - ((value - 0.75) * 4.0);
    }

    let b = 0;
    if (value < 0.25) {
        b = 1.0;
    } else if (value < 0.5) {
        b = 1 - ((value - 0.25) * 4);
    }

    return [r * 255, g * 255, b * 255];  // RGBA
}

let qt = [
    9, 6, 5, 9, 13, 22, 28, 33,
    6, 6, 8, 10, 14, 31, 32, 30,
    8, 7, 9, 13, 22, 31, 37, 30,
    8, 9, 12, 16, 28, 47, 43, 33,
    10, 12, 20, 30, 37, 59, 56, 42,
    13, 19, 30, 35, 44, 56, 61, 50,
    26, 35, 42, 47, 56, 65, 65, 55,
    39, 50, 51, 53, 60, 54, 56, 53
];

onload = () => {
    uploadFile = document.getElementById("uploadFile");
    uploadFile.addEventListener("change", onUploadImage);

    img = new Image();
    img.onload = function () {
        document.body.append(img);

        let canvas = document.createElement("canvas");
        let context = canvas.getContext("2d");

        canvas.width = img.width;
        canvas.height = img.height;
        context.drawImage(img, 0, 0);

        let inputData = context.getImageData(0, 0, img.width, img.height);
        let outputData = context.createImageData(img.width, img.height);
        let pixels = new Float32Array(img.width * img.height * 3);
        let ys = new Float32Array(img.width * img.height);
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                rgbToYcbcr(pixels, 3 * (x + img.width * y), inputData.data, 4 * (x + img.width * y));
                ys[x + img.width * y] = pixels[3 * (x + img.width * y)];
                pixels[3 * (x + img.width * y)] -= 128;
                pixels[3 * (x + img.width * y) + 1] -= 128;
                pixels[3 * (x + img.width * y) + 2] -= 128;
                ycbcrToRgb(outputData.data, 4 * (x + img.width * y), pixels, 3 * (x + img.width * y));
                // outputData.data[4 * (x + img.width * y)] = 0;
                // outputData.data[4 * (x + img.width * y) + 1] = 0;
                // outputData.data[4 * (x + img.width * y) + 2] = 0;

                // let cmyk = rgbToCmyk(
                //     inputData.data[4 * (x + img.width * y)],
                //     inputData.data[4 * (x + img.width * y) + 1],
                //     inputData.data[4 * (x + img.width * y) + 2]);
                // let rgb = cmykToRgb(
                //     cmyk.c,
                //     0,///cmyk.m,
                //     0,//cmyk.y,
                //     0//cmyk.k
                // )

                // outputData.data[4 * (x + img.width * y)] = rgb.r;
                // outputData.data[4 * (x + img.width * y) + 1] = rgb.g;
                // outputData.data[4 * (x + img.width * y) + 2] = rgb.b;

                outputData.data[4 * (x + img.width * y) + 3] = 255;
            }
        }

        dct(img.width, ys);

        let max = 0;
        for (let i = 0; i < ys.length; ++i) {
            if (max < Math.abs(ys[i])) {
                max = Math.abs(ys[i]);
            }
        }

        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                // let rgb = grayToHeatmap(Math.abs(ys[x + img.width * y]) / max / qt[x + img.width * y] * 255);
                let rgb = grayToHeatmap(qt[x + img.width * y] / 65 * 255);
                outputData.data[4 * (x + img.width * y)] = rgb[0];
                outputData.data[4 * (x + img.width * y) + 1] = rgb[1];
                outputData.data[4 * (x + img.width * y) + 2] = rgb[2];
                outputData.data[4 * (x + img.width * y) + 3] = 255;
            }
        }

        context.putImageData(outputData, 0, 0);
        document.body.append(canvas);
    }
    img.src = "./assets/work/unit_image.png";
}

function onUploadImage(event) {
    let files = event.target.files;
    if (files.length !== 1) {
        return;
    }
    let file = files[0];
    let image = new Image();
    image.src = URL.createObjectURL(file);

    let fileReader = new FileReader();

    fileReader.onload = (event) => {
         let decoder = new Decoder.JpegDecoder(fileReader.result);
        decoder.decode((type, out) => {
            if (type === "decodeImage") {
                let canvas = document.createElement("canvas");
                canvas.width = out.width;
                canvas.height = out.height;
                // canvas.style.width = '100%'

                let context = canvas.getContext("2d");
                let imageData = context.createImageData(out.width, out.height);
                for (let i = 0; i < out.width * out.height; ++i) {
                    imageData.data[4 * i] = Math.min(out.pixels[3 * i], 255);
                    imageData.data[4 * i + 1] = Math.min(out.pixels[3 * i + 1], 255);
                    imageData.data[4 * i + 2] = Math.min(out.pixels[3 * i + 2], 255);
                    imageData.data[4 * i + 3] = 255;
                }
                context.putImageData(imageData, 0, 0);
                if (previousCanvas != null) {
                    previousCanvas.remove();
                }
                document.body.append(canvas);
                previousCanvas = canvas;
            }
        });
    }
    fileReader.readAsArrayBuffer(file);
}
