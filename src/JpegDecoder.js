import {idct} from "./JpegSignal.js";
import {ycbcrToRgb, reorderZigzagSequence} from "./JpegCommon.js";
import {JpegReadStream} from "./JpegDataStream.js";
import {JpegMarker} from "./JpegMarker.js";

// デバッグ用のフラグ
const isDebuggingSOF = true;
const isDebuggingSOS = true;
const isDebuggingSOSDetail = false;
const isDebuggingDQT = true;
const isDebuggingDQTDetail = true
const isDebuggingDAC = true;
const isDebuggingDHT = true;
const isDebuggingDHTDetail = true;
const isDebuggingDRI = true;
const isDebuggingCOM = true;
const isDebuggingAPP = true;
const isDebuggingDNL = true;
const isDebuggingEXP = true;
const isDebuggingEOI = true;

/**
 * JPEGデコーダ用の例外クラス
 */
class JpegDecodeError extends Error {

    constructor(message) {
        super(message);
    }
}

/**
 * JPEGのデコーダー
 */
export class JpegDecoder {

    /**
     * コンストラクタ
     */
    constructor(buffer, offset = undefined, length = undefined) {
        /** データストリーム */
        this._stream = new JpegReadStream(buffer, offset, length);
        /** フーレムのデータ */
        this._frame = null;
        /** 量子化テーブル */
        this._quantizationTables = {};
        /** ハフマン木 */
        this._huffmanTrees = [{}, {}];
        /** リセットインターバル */
        this._restertInterval = 0;
        /** 出力データ */
        this.out = null;
    }

    /**
     * フレームの開始セグメントの解析
     */
    _parseSOF(marker) {
        let segment = {};

        // Lf: フレームヘッダー長 (Frame header length)
        segment.Lf = this._stream.readUint16();

        // P: サンプル制度 (Sample precision)
        segment.P = this._stream.readUint8();

        if (marker === JpegMarker.SOF0 && segment.P !== 8) {
            // ベースラインで8bitでない場合
            throw new JpegDecodeError();
        } else if ((marker === JpegMarker.SOF1 || marker === JpegMarker.SOF2) &&
            (segment.P !== 8 && segment.P !== 12)) {
            // 拡張シーケンシャルもしくはプログレッシブで8bitでなく12bitでもない場合
            throw new JpegDecodeError("This frame segment has been broken.");
        }

        // Y: ライン数 (Number of lines)
        segment.Y = this._stream.readUint16();

        // X: ラインあたりのサンプル数 (Number of samples per line)
        segment.X = this._stream.readUint16();

        if (segment.X < 1) {
            // ライン数が1以下の場合
            throw new JpegDecodeError("This frame segment has been broken.");
        }

        // Nf: フレームのイメージコンポーネント数 (Number of image components in frame)
        segment.Nf = this._stream.readUint8();

        if ((marker === JpegMarker.SOF0 || marker === JpegMarker.SOF1) && segment.Nf < 1) {
            // ベースラインもしくは拡張シーケンシャルでコンポーネント数が1以下の場合
            throw new JpegDecodeError("This frame segment has been broken.");
        } else if (marker === JpegMarker.SOF2 && (segment.Nf < 1 || segment.Nf > 4)) {
            // プログレッシブでコンポーネント数が1～4の範囲に収まっていない場合
            throw new JpegDecodeError("This frame segment has been broken.");
        }

        segment.components = new Array(segment.Nf);
        for (let i = 0; i < segment.Nf; ++i) {
            let component = {};

            // C_i: コンポーネントの識別子 (Component identifier)
            component.C = this._stream.readUint8();

            let H_V = this._stream.readUint8();

            // H_i: 水平方向のサンプリング数 (Horizontal sampling factor)
            component.H = 0xf & (H_V >> 4);

            if (component.H < 1 || component.H > 4) {
                // 水平方向のサンプリング数が1～4の範囲に収まっていない場合
                throw new JpegDecodeError("This frame segment has been broken.");
            }

            // V_i: 垂直方向のサンプリング数 (Vertical sampling factor)
            component.V = 0xf & H_V;

            if (component.V < 1 || component.V > 4) {
                // 垂直方向のサンプリング数が1～4の範囲に収まっていない場合
                throw new JpegDecodeError("This frame segment has been broken.");
            }

            // Tq_i: 量子化テーブル出力セレクター (Quantization table destination selector)
            component.Tq = this._stream.readUint8();
            if ((JpegMarker.SOF0 || JpegMarker.SOF1 || JpegMarker.SOF2) && component.Tq > 3) {
                // 量子化テーブルのセレクターが～3の範囲に収まっていない場合
                throw new JpegDecodeError("This frame segment has been broken.")
            }

            segment.components[i] = component;
        }

        if (isDebuggingSOF) {
            console.log(`SOF${marker - JpegMarker.SOF0}`);
            console.log(segment);
        }

        this._constructFrameInfo(segment);
        return segment;
    }

    /**
     * フレーム情報の構築
     */
    _constructFrameInfo(segment) {
        // サンプリング要素数の最大値
        let maxHorizontalSamplingFactor = 1;
        let maxVerticalSamplingFactor = 1;
        for (let i = 0; i < segment.components.length; ++i) {
            let component = segment.components[i];

            if (maxHorizontalSamplingFactor < component.H) {
                maxHorizontalSamplingFactor = component.H;
            }
            if (maxVerticalSamplingFactor < component.V) {
                maxVerticalSamplingFactor = component.V;
            }
        }

        let widthMcu = maxHorizontalSamplingFactor * 8;
        let heightMcu = maxVerticalSamplingFactor * 8;

        let width = segment.X;
        let height = segment.Y;

        let numHorizontalMcusInImage = Math.ceil(width / widthMcu);
        let numVerticalMcusInImage = Math.ceil(height / heightMcu);

        // コンポーネント情報の構築
        let components = new Array(segment.Nf);
        for (let i = 0; i < components.length; ++i) {
            let component = segment.components[i];

            let widthUnitInMcu = maxHorizontalSamplingFactor / component.H;
            let heightUnitInMcu = maxVerticalSamplingFactor / component.V;

            let numHorizontalUnitsInComponent = numHorizontalMcusInImage * component.H;
            let numVerticalUnitsInComponent = numVerticalMcusInImage * component.V;

            let numHorizontalUnitsInComponentWithoutMcu = Math.ceil(width * component.H / maxHorizontalSamplingFactor / 8);
            let numVerticalUnitsInComponentWithoutMcu = Math.ceil(height * component.V / maxVerticalSamplingFactor / 8);

            let units = new Array(numHorizontalUnitsInComponent * numVerticalUnitsInComponent)
            for (let j = 0; j < units.length; ++j) {
                units[j] = new Int16Array(64);
            }

            components[i] = {
                /** コンポーネントID */
                componentId: component.C,
                /** 水平方向のサンプリング数 */
                horizontalSamplingFactor: component.H,
                /** 垂直方向のサンプリング数 */
                verticalSamplingFactor: component.V,
                /** サンプリング数 */
                samplingFactor: component.H * component.V,
                /** MCU内でのユニット幅 */
                widthUnitInMcu: widthUnitInMcu,
                /** MCU内でのユニット高さ */
                heightUnitInMcu: heightUnitInMcu,
                /** MCU内でのユニットサイズ */
                sizeUnitInMcu: widthUnitInMcu * heightUnitInMcu,
                /** コンポーネント内の水平方向のユニット数 */
                numHorizontalUnitsInComponent: numHorizontalUnitsInComponent,
                /** コンポーネント内の垂直方向のユニット数 */
                numVerticalUnitsInComponent: numVerticalUnitsInComponent,
                /** コンポーネント内の水平方向の制約なしのユニット数、非インターリーブ用 */
                numHorizontalUnitsInComponentWithoutMcu: numHorizontalUnitsInComponentWithoutMcu,
                /** コンポーネント内のMCU制約なしの水平方向のユニット数、非インターリーブ用 */
                numVerticalUnitsInComponentWithoutMcu: numVerticalUnitsInComponentWithoutMcu,
                /** コンポーネント内のMCUの制約なしのユニット数、非インターリーブ用 */
                numUnitsInComponentWithoutMcu: numHorizontalUnitsInComponentWithoutMcu * numVerticalUnitsInComponentWithoutMcu,
                /** 量子化テーブルのセレクター */
                qtSelector: component.Tq,
                /** ユニット配列 */
                units: units
            };
        }

        // フレーム情報の構築
        this._frame = {
            /** イメージの幅 */
            width: width,
            /** イメージの高さ */
            height: height,
            /** 画像内の水平方向のMCU数 */
            numHorizontalMcusInImage: numHorizontalMcusInImage,
            /** 画像内の垂直方向のMCU数 */
            numVerticalMcusInImage: numVerticalMcusInImage,
            /** 画像内のMCU数 */
            numMcusInImage: numHorizontalMcusInImage * numVerticalMcusInImage,
            /** コンポーネント配列 */
            components: components
        }
    }

    /**
     * スキャン開始セグメントの解析
     */
    _parseSOS() {
        let segment = {};

        // Ls: スキャンヘッダーデータ長 (Scan header length)
        segment.Ls = this._stream.readUint16();

        // Ns: スキャンのイメージコンポーネント数 (Number of image components in scan)
        segment.Ns = this._stream.readUint8();

        if (segment.Ns < 1 || segment.Ns > 4) {
            throw new JpegDecodeError("This scan segment has been broken.");
        }

        segment.components = new Array(segment.Ns);
        for (let j = 0; j < segment.Ns; ++j) {
            let component = {};

            // Cs_j: スキャンコンポーネントのセレクター (Scan component selector)
            component.Cs = this._stream.readUint8();

            let Td_Ta = this._stream.readUint8();

            // Td_j: 直流エントロピーコーディングテーブルのセレクター (DC entropy coding table destination selector)
            component.Td = 0xf & (Td_Ta >> 4);

            // Ta_j: 交流エントロピーコーディングテーブルのセレクター (AC entropy coding table destination selector)
            component.Ta = 0xf & Td_Ta;

            segment.components[j] = component;
        }

        // Ss: スペクトルかプリディクターの開始セレクター (Start of spectral or predictor selection)
        segment.Ss = this._stream.readUint8();

        // Se: スペクトルの終了セレクター (End of spectral selection)
        segment.Se = this._stream.readUint8();

        let Ah_Al = this._stream.readUint8();

        // Ah: 逐次近似の上位のビットの位置 (Successive approximation bit position high)
        segment.Ah = 0xf & (Ah_Al >> 4);

        // Al: 逐次近似の下位のビットの位置もしくはピットの移動値 (Successive approximation bit position low or point transform)
        segment.Al = 0xf & Ah_Al;

        if (isDebuggingSOS) {
            console.log("SOS");
            console.log(segment);
        }

        this._decodeScanDataWithHuffmanCoding(segment);
        return segment;
    }

    /**
     * スキャンデータをハフマン符号化を使用してデコードする。
     */
    _decodeScanDataWithHuffmanCoding(segment) {
        let isDebugging = isDebuggingSOS && isDebuggingSOSDetail;

        let scanWork = {
            numberOfEndOfBlock: 0,
            prevDcCoefs: new Float32Array(segment.Ns)
        }

        if (segment.Ns > 1) {
            // インターリーブの場合
            for (let i = 0; i < this._frame.numMcusInImage; ++i) {
                for (let j = 0; j < segment.Ns; ++j) {
                    let scanComponent = segment.components[j];
                    let frameComponent = this._frame.components[scanComponent.Cs - 1];

                    let dcHuffmanTree = this._huffmanTrees[0][scanComponent.Td];
                    let acHuffmanTree = this._huffmanTrees[1][scanComponent.Ta];

                    for (let k = 0; k < frameComponent.samplingFactor; ++k) {
                        let index = frameComponent.numHorizontalUnitsInComponent *
                            frameComponent.verticalSamplingFactor * Math.floor(i / this._frame.numHorizontalMcusInImage) +
                            frameComponent.horizontalSamplingFactor * (i % this._frame.numHorizontalMcusInImage) +
                            frameComponent.numHorizontalUnitsInComponent *
                            Math.floor(k / frameComponent.horizontalSamplingFactor) +
                            k % frameComponent.horizontalSamplingFactor;
                        try {
                            this._decodeUnitWithHuffmanCoding(
                                segment,
                                scanWork,
                                dcHuffmanTree,
                                acHuffmanTree,
                                j,
                                frameComponent.units[index]);
                        } catch (e) {
                            throw e;
                        }
                    }
                }
            }
        } else {
            // 非インターリーブの場合
            let scanComponent = segment.components[0];
            let frameComponent = this._frame.components[scanComponent.Cs - 1];

            let dcHuffmanTree = this._huffmanTrees[0][scanComponent.Td];
            let acHuffmanTree = this._huffmanTrees[1][scanComponent.Ta];

            for (let i = 0;
                 i < frameComponent.numHorizontalUnitsInComponent *
                 frameComponent.numVerticalUnitsInComponentWithoutMcu;
                 ++i) {

                if (i % frameComponent.numHorizontalUnitsInComponent >
                    frameComponent.numHorizontalUnitsInComponentWithoutMcu - 1) {
                    continue;
                }
                this._decodeUnitWithHuffmanCoding(
                    segment,
                    scanWork,
                    dcHuffmanTree,
                    acHuffmanTree,
                    0,
                    frameComponent.units[i]);
            }
        }

        this._stream.resetRemainBits();
        this._decodeImageWithScanData();
    }

    /**
     * ユニットデータをハフマン符号化を使用してデコードする。
     */
    _decodeUnitWithHuffmanCoding(segment, scanWork, dcHuffmanTree, acHuffmanTree, component, unit) {
        let isDebugging = isDebuggingSOS && isDebuggingSOSDetail;

        // ブロックの処理のスキップ
        if (segment.Ah === 0) {
            // シーケンシャル
            if (scanWork.numberOfEndOfBlock > 0) {
                scanWork.numberOfEndOfBlock--;
                return;
            }
        } else {
            // 逐次近似
            if (scanWork.numberOfEndOfBlock > 0) {
                for (let l = segment.Ss; l <= segment.Se; ++l) {
                    if (unit[l] !== 0) {
                        unit[l] |= this._stream.readBits(1) << segment.Al;
                    }
                }
                scanWork.numberOfEndOfBlock--;
                return;
            }
        }

        // DC成分のハフマン符号のデコード
        if (segment.Ss === 0) {
            if (segment.Ah === 0) {
                // シーケンシャル、逐次近似または最初の読み込み
                let value = this._readValueWithHuffmanCode(dcHuffmanTree);
                scanWork.prevDcCoefs[component] = (unit[0] = scanWork.prevDcCoefs[component] + (value.value << segment.Al));

                if (isDebugging) {
                    console.log(
                        `0, ` +
                        `huffmanCode=${("0000000000000000" + value.huffmanCode.toString(2))
                            .slice(-value.numCodingBits - 1)}, ` +
                        `runLength=${value.runLength}, ` +
                        `additionalBits=${value.additionalBits}, ` +
                        `rawValue=${value.rawValue}, ` +
                        `value=${value.value}`);
                }
            } else {
                // 逐次近似
                // スタート以降は1ビットずつの読み込み
                unit[0] |= this._stream.readBits(1) << segment.Al;
            }
        }

        // AC成分のハフマン符号のデコード
        for (let i = Math.max(segment.Ss, 1); i <= segment.Se; ++i) {
            if (segment.Ah === 0) {
                // シーケンシャルはたは逐次近似の最初の読み込み
                let value = this._readValueWithHuffmanCode(acHuffmanTree);
                let debugValue;
                if (value.additionalBits === 0) {
                    if (value.runLength < 0xf) {
                        // EOB0 ～ EOB14 (End Of Block), DCTの係数を今回の係数も含め終端まで係数を0で埋める
                        let runLength = (1 << value.runLength) + this._stream.readBits(value.runLength);
                        scanWork.numberOfEndOfBlock = runLength - 1;
                        while (i <= segment.Se) {
                            unit[i++] = 0;
                        }
                        value = `EOB${value.runLength}`;
                    } else {
                        // ZRL (Zero Run Length), DCTの係数を16個を0で埋め、今回の要素も0として、計16要素を0で埋める
                        for (let j = 0; j < 15 && i <= segment.Se; ++j) {
                            unit[i++] = 0;
                        }
                        unit[i] = 0;
                        value = "ZRL";
                    }
                } else {
                    // COMPOSITE VALUES, DCTの係数にランレングスの指定の数だけ0で埋め、その後に取り出した値を係数として代入
                    for (let j = 0; j < value.runLength && i <= segment.Se; ++j) {
                        unit[i++] = 0;
                    }
                    unit[i] = value.value << segment.Al;
                    debugValue = value.value;
                }

                if (isDebugging) {
                    console.log(
                        `${i}, ` +
                        `huffmanCode=${("0000000000000000" + value.huffmanCode.toString(2))
                            .slice(-value.numCodingBits - 1)}, ` +
                        `runLength=${value.runLength}, ` +
                        `additionalBits=${value.additionalBits}, ` +
                        `rawValue=${value.rawValue}, ` +
                        `value=${debugValue}`);
                }
            } else {
                // 逐次近似
                // スタート以降は1ビットずつの読み込み
                let value = this._readValueWithHuffmanCode(acHuffmanTree);
                if (value.additionalBits === 0) {
                    if (value.runLength < 0xf) {
                        // EOB0 ～ EOB14 (End Of Block), DCTの係数を今回の係数も含め終端まで係数を0で埋める
                        let runLength = (1 << value.runLength) + this._stream.readBits(value.runLength);
                        scanWork.numberOfEndOfBlock = runLength - 1;
                        while (i <= segment.Se) {
                            if (unit[i] !== 0) {
                                unit[i] |= this._stream.readBits(1) << segment.Al;
                            }
                            i++;
                        }
                        break;
                    } else {
                        // ZRL (Zero Run Length), DCTの係数を16個を0で埋め、今回の要素も0として、計16要素を0で埋める
                        for (let j = 0; j < 15 && i <= segment.Se;) {
                            if (unit[i] !== 0) {
                                unit[i] |= this._stream.readBits(1) << segment.Al;
                            } else {
                                j++;
                            }
                            i++;
                        }
                        while (i <= segment.Se) {
                            if (unit[i] !== 0) {
                                unit[i] |= this._stream.readBits(1) << segment.Al;
                            } else {
                                break;
                            }
                            i++;
                        }
                    }
                } else if (value.additionalBits === 1) {
                    for (let j = 0; j < value.runLength && i <= segment.Se;) {
                        if (unit[i] !== 0) {
                            if (unit[i] > 0) {
                                unit[i] |= this._stream.readBits(1) << segment.Al;
                            } else {
                                unit[i] -= this._stream.readBits(1) << segment.Al;
                            }
                        } else {
                            j++;
                        }
                        i++;
                    }
                    while (i <= segment.Se) {
                        if (unit[i] !== 0) {
                            if (unit[i] > 0) {
                                unit[i] |= this._stream.readBits(1) << segment.Al;
                            } else {
                                unit[i] -= this._stream.readBits(1) << segment.Al;
                            }
                        } else {
                            unit[i] = value.value << segment.Al;
                            break;
                        }
                        i++;
                    }
                } else {
                    throw new JpegDecodeError("This scan had been broken.");
                }
            }
        }
    }

    /**
     * スキャンデータを画像にデコードする。
     */
    _decodeImageWithScanData() {
        let width = this._frame.width;
        let height = this._frame.height;

        let pixels = new Float32Array(width * height * 3);
        let unit = new Float32Array(64);

        for (let i = 0; i < this._frame.components.length; ++i) {
            let component = this._frame.components[i];
            if (component.componentId < 1 || component.componentId > 3) {
                continue;
            }

            let quantizationTable = this._quantizationTables[component.qtSelector];

            for (let j = 0; j < component.units.length; ++j) {
                let xi = 8 * component.widthUnitInMcu *
                    (j % component.numHorizontalUnitsInComponent);
                let yi = width * 8 * component.heightUnitInMcu *
                    Math.floor(j / component.numHorizontalUnitsInComponent);

                // 境界面処理
                if (xi >= width) {
                    continue;
                } else if (yi >= pixels.length) {
                    break;
                }

                // ジグザグシーケンスの並び戻す
                reorderZigzagSequence(unit, component.units[j]);

                // 標本化
                for (let k = 0; k < 64; ++k) {
                    unit[k] *= quantizationTable[k];
                }

                // 逆離散コサイン変換
                idct(8, unit);

                // ユニットをキャンバスに書き込み
                for (let k = 0; k < component.sizeUnitInMcu; ++k) {
                    let xj = k % component.widthUnitInMcu;
                    let yj = width * Math.floor(k / component.heightUnitInMcu);

                    for (let m = 0; m < 64; ++m) {
                        let xk = xi + xj + component.widthUnitInMcu * (m % 8);
                        let yk = yi + yj + width * component.heightUnitInMcu * Math.floor(m / 8);

                        // 境界面処理
                        if (xk >= width) {
                            continue;
                        } else if (yk >= pixels.length) {
                            break;
                        }

                        let index = 3 * (xk + yk) + (component.componentId - 1);
                        pixels[index] = unit[m];
                    }
                }
            }
        }

        // 色空間変換
        for (let i = 0; i < pixels.length; i += 3) {
            ycbcrToRgb(pixels, i, pixels, i);
        }

        this.out = {
            width: this._frame.width,
            height: this._frame.height,
            pixels: pixels
        };

        if (this._callback) {
            this._callback("decodeImage", this.out);
        }
    }

    /**
     * 量子化テーブル定義セグメントの解析
     */
    _parseDQT() {
        let segment = {};

        // Lq: 量子化テーブル定義のデータ長 (Quantization table definition length)
        segment.Lq = this._stream.readUint16();

        segment.tables = [];
        for (let readSize = 2; readSize < segment.Lq;) {
            let table = {};

            let Pq_Tq = this._stream.readUint8();

            // Pq: 量子化テーブルの要素の精度 (Quantization table element precision)
            table.P = (Pq_Tq & 0xf0) >>> 4;

            let quantizationTable;
            if (table.P === 0) {
                // 8bitの精度
                table.Q = new Uint8Array(64);
                quantizationTable = new Uint8Array(64);
            } else if (table.P === 1) {
                // 16bitの精度
                table.Q = new Uint16Array(64);
                quantizationTable = new Uint16Array(64);
            } else {
                // 8bitでも16bitでもない場合
                throw new JpegDecodeError();
            }

            // Tq: 量子化テーブルの登録先の識別子 (Quantization table destination identifier)
            table.T = Pq_Tq & 0x0f;

            // Qk: 量子化テーブルの要素 (Quantization table element)
            if (table.P === 0) {
                for (let k = 0; k < 64; ++k) {
                    table.Q[k] = this._stream.readUint8();
                }
            } else if (table.P === 1) {
                for (let k = 0; k < 64; ++k) {
                    table.Q[k] = this._stream.readUint16();
                }
            }

            reorderZigzagSequence(quantizationTable, table.Q);
            this._quantizationTables[table.T] = quantizationTable;

            readSize += 65 + 64 * table.P;

            segment.tables.push(table);
        }

        if (isDebuggingDQT) {
            console.log("DQT");
            console.log(segment);

            if (isDebuggingDQTDetail) {
                let table = segment.tables[0];
                console.log(`Quantization table for ${table.T === 0 ? "DC" : "AC"}.`);

                let quantizationTable = new Uint16Array(64);
                reorderZigzagSequence(quantizationTable, table.Q);

                let output = [];
                for (let i = 0; i < 64; i += 8) {
                    output.push(Array.from(quantizationTable.slice(i, i + 8)));
                }
                console.table(output);
            }
        }

        return segment;
    }

    /**
     * ハフマンテーブル定義セグメントの解析
     */
    _parseDHT() {
        let isDebugging = isDebuggingDHT && isDebuggingDHTDetail;

        let segment = {};

        // Lh: ハフマンテーブル定義長 (Huffman table definition length)
        segment.Lh = this._stream.readUint16();

        segment.tables = [];
        for (let readSize = 2; readSize < segment.Lh;) {
            let table = {};

            let Tc_Th = this._stream.readUint8();

            // Tc: テーブルクラス (Table class)
            table.Tc = 0xf & (Tc_Th >> 4);

            if (table.Tc !== 0 && table.Tc !== 1) {
                // テーブルクラスが直流でも交流でもない
                throw new JpegDecodeError();
            }

            // Th: ハフマンテーブルの識別子 (Huffman table destination identifier)
            table.Th = 0xf & Tc_Th;

            if (table.Th < 0 || table.Th > 3) {
                throw new JpegDecodeError()
            }

            // L_i: 長さiのハフマンコード数 (Number of Huffman codes of length i)
            table.L = new Array(16);

            this._stream.readUint8Array(table.L, 0, 16);

            // V_{i, j}: 各ハフマンコードの値 (Value associated with each Huffman code)
            table.V = new Array(16);

            for (let i = 0; i < 16; ++i) {
                let L = table.L[i];
                this._stream.readUint8Array(table.V[i] = new Array(L), 0, L);
                readSize += L;
            }

            readSize += 17;

            segment.tables.push(table);
        }

        if (isDebuggingDHT) {
            console.log("DHT");
            console.log(segment);
        }

        // テーブルをより扱いやすい構造にする
        for (let i = 0; i < segment.tables.length; ++i) {
            let table = segment.tables[i];
            this._huffmanTrees[table.Tc][table.Th] = this._decodeHuffmanTables(table);
        }

        return segment;
    }

    /**
     * ハフマンテーブルをツリーにデコードする
     */
    _decodeHuffmanTables(table) {
        let isDebugging = isDebuggingDHT && isDebuggingDHTDetail;
        if (isDebugging) {
            console.log(`Huffman table for ${table.Tc === 0 ? "DC" : "AC"}; ID ${table.Th}.`);
        }

        let tree = [];
        let code = 0;
        for (let j = 0; j < table.V.length; ++j) {
            let v = table.V[j];
            let values = new Array(v.length);
            for (let k = 0; k < v.length; ++k) {
                let value = v[k];
                if (table.Tc === 0) {
                    // DC成分用
                    values[k] = {
                        huffmanCode: code,
                        runLength: 0,
                        additionalBits: value,
                    };
                    if (isDebugging) {
                        console.log(
                            `bits=${j + 1}, ` +
                            `code=${("0000000000000000" + code.toString(2)).slice(-j - 1)}, ` +
                            `additionalBits=${value}`);
                    }
                } else if (table.Tc === 1) {
                    // AC成分用
                    values[k] = {
                        huffmanCode: code,
                        runLength: 0xf & (value >> 4),
                        additionalBits: 0xf & value,
                    };
                    if (isDebugging) {
                        if (values[k].additionalBits === 0) {
                            let strValue;
                            if (value === 0x00) {
                                strValue = "EOB or EOB0";
                            } else if (value => 0x10 && value <= 0xe0) {
                                strValue = "EOB" + (value >> 4);
                            } else if (value === 0xf0) {
                                strValue = "ZRL";
                            }
                            console.log(
                                `bits=${j + 1}, ` +
                                `code=${("0000000000000000" + code.toString(2)).slice(-j - 1)}, ` +
                                `runLength=${values[k].runLength}, ` +
                                `additionalBits=${values[k].additionalBits} (${strValue})`);
                        } else {
                            console.log(
                                `bits=${j + 1} ` +
                                `code=${("0000000000000000" + code.toString(2)).slice(-j - 1)}, ` +
                                `runLength=${values[k].runLength}, ` +
                                `additionalBits=${values[k].additionalBits}`);
                        }
                    }
                } else {
                    // 未定義
                    throw new JpegDecodeError(`Huffman table have been broken at ${k}.`);
                }
                code++;
            }
            tree.push(values);
            code <<= 1;
        }

        return tree;
    }

    /**
     * ハフマン符号化された値を読み込む
     */
    _readValueWithHuffmanCode(huffmanTree) {
        // ハフマンコードを検索
        let element = null;
        let huffmanCode = 0;
        let rowIndex = 0;
        searchElement: for (; rowIndex < huffmanTree.length; ++rowIndex) {
            huffmanCode = (huffmanCode << 1) | this._stream.readBits(1);
            for (let i = 0; i < huffmanTree[rowIndex].length; ++i) {
                if (huffmanTree[rowIndex][i].huffmanCode === huffmanCode) {
                    element = huffmanTree[rowIndex][i];
                    break searchElement;
                }
            }
        }
        if (element === null) {
            throw new JpegDecodeError("Not found huffman code in the table.");
        }

        // 値を読み込む
        let rawValue = 0;
        let value = 0;
        if (element.additionalBits > 0) {
            rawValue = this._stream.readBits(element.additionalBits);

            // マグニチュードカテゴリによるデコード
            value = rawValue < (1 << (element.additionalBits - 1)) ?
                ((-1 << element.additionalBits) | rawValue) + 1 : rawValue;
        }

        return {
            /** ハフマンコード */
            huffmanCode: huffmanCode,
            /** ハフマンコードのビット数 */
            numCodingBits: rowIndex + 1,
            /** ランレングス */
            runLength: element.runLength,
            /** 追加読み込みビット数 */
            additionalBits: element.additionalBits,
            /** 未加工の値 */
            rawValue: rawValue,
            /** デコードされた数値 */
            value: value
        };
    }

    /** 算術符号化条件定義セグメントの解析 */
    _parseDAC() {
        let segment = {};

        // La: (Arithmetic coding conditioning definition length)
        segment.La = this._stream.readUint16();

        let readSize = 2;
        while (readSize < segment.La) {
            let element = {};
            segment.table.push(element);

            let Tc_Tb = this._stream.readUint8();

            // Tc: (Table class)
            element.Tc = (Tc_Tb & 0xf0) >>> 4;

            // Tb: (Arithmetic coding conditioning table destination identifier)
            element.Tb = Tc_Tb & 0x0f;

            // Cs: (Conditioning table value)
            element.Cs = this._stream.readUint8();

            readSize += 2;
        }

        if (isDebuggingDAC) {
            console.log("DAC");
            console.log(segment);
        }

        return segment;
    }

    /** リスタートインターバル定義セグメントの解析 */
    _parseDRI() {
        let segment = {};

        // Lr: リスタートインターバルのセグメント長 (Define restart interval segment length)
        segment.Lr = this._stream.readUint16();

        // Ri: リスタートインターバル (Restart interval)
        segment.Ri = this._stream.readUint16();

        this._restertInterval = segment.Ri;

        if (isDebuggingDRI) {
            console.log("DRI");
            console.log(segment);
        }

        return segment;
    }

    /**
     * コメントセグメントの解析
     */
    _parseCOM() {
        let segment = {};

        // Lc: コメントセグメント長 (Comment segment length)
        segment.Lc = this._stream.readUint16();

        // Cm: コメントバイト (Comment byte)
        let readSize = this._stream.readUint8Array(segment.Cm = new Uint8Array(segment.Lc - 2), 0, segment.Lc - 2);
        if (readSize !== segment.Cm.length) {
            throw new JpegDecodeError("This comment segment has been broken.");
        }

        if (isDebuggingCOM) {
            console.log("COM");
            console.log(segment);
        }

        return segment;
    }

    /**
     * アプリケーションデータセグメントの解析
     */
    _parseAPP(marker) {
        let segment = {};

        // Lp: アプリケーションデータセグメント長 (Application data segment length)
        segment.Lp = this._stream.readUint16();
        if (segment.Lp < 2) {
            throw new JpegDecodeError();
        }

        // Api: アプリケーションデータバイト (Application data byte)
        segment.Ap = new Uint8Array(segment.Lp - 2);
        let readSize = this._stream.readUint8Array(segment.Ap, 0, segment.Ap.length);
        if (readSize !== segment.Ap.length) {
            throw new JpegDecodeError("This application segment has been broken.");
        }

        if (isDebuggingAPP) {
            console.log(`APP${marker - JpegMarker.APPn}`);
            console.log(segment);
        }

        return segment;
    }

    /**
     * ライン数定義セグメントの解析
     */
    _parseDNL() {
        let segment = {};

        // Ld: (Define number of lines segment length)
        segment.Nd = this._stream.readUint16();
        if (segment.Nd !== 4) {
            throw new JpegDecodeError();
        }

        // NL: (Number of lines)
        segment.NL = this._stream.readUint16();

        if (isDebuggingDNL) {
            console.log("DNL");
            console.log(segment);
        }

        return segment;
    }

    /**
     * 伸張リファレンスコンポーネントセグメントの解析
     */
    _parseEXP() {
        let segment = {};

        // Le: (Expand reference components segment length)
        segment.Le = this._stream.readUint16();
        if (segment.Le !== 3) {
            throw new JpegDecodeError();
        }

        // Eh: (Expand horizontally)
        let Eh_Ev = this._stream.readUint8();
        segment.Eh = (Eh_Ev & 0xf0) >>> 4;

        // Ev: (Expand vertically)
        segment.Ev = Eh_Ev & 0x0f;

        if (isDebuggingEXP) {
            console.log("EXP");
            console.log(segment);
        }

        return segment;
    }

    /**
     * JPEGのデコードを行う
     */
    decode(callback) {
        this._callback = callback;

        // SOI: イメージ開始マーカー
        let soiMarker = this._stream.readUint16();
        if (soiMarker !== JpegMarker.SOI) {
            return false;
        }

        while (true) {
            let marker = this._stream.readUint16();
            switch (marker) {
                // SOFマーカー

                // SOF0: ベースDCT (Baseline DCT)
                case JpegMarker.SOF0:
                // SOF1: 拡張シーケンシャルDCT、ハフマン符号 (Extended sequential DCT, Huffman coding)
                case JpegMarker.SOF1:
                // SOF2: プログレッシブDCT、ハフマン符号 (Progressive DCT, Huffman coding)
                case JpegMarker.SOF2:
                    this._parseSOF(marker);
                    break;

                // SOF3: 可逆圧縮 (シーケンシャル)、ハフマン符号 (Lossless (sequential), Huffman coding)
                case JpegMarker.SOF3:

                // SOFマーカー (非対応)

                // SOF9: 拡張シーケンシャルDCT、算術符号 (Extended sequential DCT, arithmetic coding)
                case JpegMarker.SOF9:
                // SOF10: プログレッシブDCT、算術符号 (Progressive DCT, arithmetic coding)
                case JpegMarker.SOF10:
                // SOF11: 可逆圧縮、算術符号 (Lossless (sequential), arithmetic coding)
                case JpegMarker.SOF11:

                // 拡張用SOF

                // Differential sequential DCT
                case JpegMarker.SOF5:
                // Differential progressive DCT
                case JpegMarker.SOF6:
                // Differential lossless (sequential)
                case JpegMarker.SOF7:
                // Differential sequential DCT
                case JpegMarker.SOF13:
                // Differential progressive DCT
                case JpegMarker.SOF14:
                // Differential lossless (sequential)
                case JpegMarker.SOF15:
                    throw new JpegDecodeError(`Unsupported SOF${marker - JpegMarker.SOF0} marker`);

                // SOS: Start of scan marker
                case JpegMarker.SOS:
                    this._parseSOS();
                    break;

                // DQT: 量子化テーブル (Define quantization table marker)
                case JpegMarker.DQT:
                    this._parseDQT();
                    break;

                // DHT: ハフマンテーブル (Define Huffman table marker)
                case JpegMarker.DHT:
                    this._parseDHT();
                    break;

                // DAC: Define arithmetic coding conditioning marker
                case JpegMarker.DAC:
                    this._parseDAC();
                    break;

                // DRI: リスタートマーカー (Define restart interval marker)
                case JpegMarker.DRI:
                    this._parseDRI();
                    break;

                // COM: コメントマーカ (Comment marker)
                case JpegMarker.COM:
                    this._parseCOM();
                    break;

                // DNL: (Define number of lines marker)
                case JpegMarker.DNL:
                    this._parseDNL();
                    break;

                // DHP: (hierarchical progression marker)
                case JpegMarker.DHP:
                    this._parseSOF(marker);
                    break;

                // EXP: (Expand reference components marker)
                case JpegMarker.EXP:
                    this._parseEXP();
                    break;

                // EOI: エンドマーカ (End of image)
                case JpegMarker.EOI:
                    if (isDebuggingEOI) {
                        console.log("EOI");
                    }
                    return true;

                default:
                    if (marker >= JpegMarker.APPn && marker <= JpegMarker.APPn_end) {
                        // APPn: アプリケーションデータマーカー
                        this._parseAPP(marker);
                    } else if (marker >= JpegMarker.JPGn && marker <= JpegMarker.JPGn_end) {
                        // JPGn: JPEG拡張マーカー
                        this._stream.skip(this._stream.readUint16() - 2);
                        console.info(`Unsupported JPEG extension marker: ${marker.toString(16)}`);
                    } else if ((marker & 0xff00) !== 0xff00) {
                        // 不明、未実装マーカー
                        this._stream.skip(this._stream.readUint16() - 2);
                        console.info(`Unknown marker: ${marker.toString(16)}`);
                    } else {
                        // マーカーでない
                        console.info(`Not marker: ${marker.toString(16)}`);
                        return false;
                    }
            }
        }
    }
}
