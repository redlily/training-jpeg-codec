import * as Common from "./JpegCommon.js";
import * as Signal from "./JpegSignal.js";
import * as Stream from "./JpegDataStream.js";
import * as Maker from "./JpegMarker.js";
import {JpegMarker} from "./JpegMarker.js";

// デバッグ用のフラグ
const isDebuggingSOF = true;
const isDebuggingSOS = true;
const isDebuggingSOSDetail = false;
const isDebuggingDQT = true;
const isDebuggingDAC = true;
const isDebuggingDHT = true;
const isDebuggingDHTDetail = false;
const isDebuggingDRI = true;
const isDebuggingCOM = true;
const isDebuggingAPP = true;
const isDebuggingDNL = true;
const isDebuggingEXP = true;
const isDebuggingEOI = true;

let aaa = 0;

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

    constructor(buffer, offset) {
        /** データストリーム */
        this._stream = new Stream.JpegReadStream(buffer, offset, length);
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

    /** フレームの開始セグメントの解析 */
    _parseSOF(marker) {
        let segment = {};

        // Lf: フレームヘッダー長 (Frame header length)
        segment.Lf = this._stream.readUint16();

        // P: サンプル制度 (Sample precision)
        segment.P = this._stream.readUint8();

        if ((marker === Maker.JpegMarker.SOF0 && segment.P !== 8) ||
            ((marker === Maker.JpegMarker.SOF1 || marker === Maker.JpegMarker.SOF2) &&
                (segment.P !== 8 && segment.P !== 12))) {
            // ベースラインで8bitでない場合
            // 拡張シーケンシャルもしくはプログレッシブで8bitか12bitでない場合
            throw new JpegDecodeError();
        }

        // Y: ライン数 (Number of lines)
        segment.Y = this._stream.readUint16();

        // X: ラインあたりのサンプル数 (Number of samples per line)
        segment.X = this._stream.readUint16();

        if (segment.X < 1) {
            // ライン数が1以下の場合
            throw new JpegDecodeError();
        }

        // Nf: フレームのイメージコンポーネント数 (Number of image components in frame)
        segment.Nf = this._stream.readUint8();

        if (((marker === Maker.JpegMarker.SOF0 || marker === Maker.JpegMarker.SOF1) && segment.Nf < 1) ||
            (marker === Maker.JpegMarker.SOF2 && (segment.Nf < 1 || segment.Nf > 4))) {
            // ベースラインもしくは拡張シーケンシャルでコンポーネント数が1-255の範囲に収まってない場合
            // プログレッシブでコンポーネントの数が1-4の範囲に収まってない場合
            throw new JpegDecodeError();
        }

        let maxNumUnitH = 0;
        let maxNumUnitV = 0;

        segment.components = new Array(segment.Nf);
        for (let i = 0; i < segment.Nf; ++i) {
            let component = {};

            // C_i: コンポーネントの識別子 (Component identifier)
            component.C = this._stream.readUint8();

            let H_V = this._stream.readUint8();

            // H_i: 水平方向のサンプリング要素数 (Horizontal sampling factor)
            component.H = 0xf & (H_V >> 4);

            if (component.H < 1 || component.H > 4) {
                // 水平方向のサンプリング要素数が1-4の範囲に収まっていない場合
                throw new JpegDecodeError();
            }
            if (component.H > maxNumUnitH) {
                maxNumUnitH = component.H;
            }

            // V_i: 垂直方向のサンプリング要素数 (Vertical sampling factor)
            component.V = 0xf & H_V;

            if (component.V < 1 || component.V > 4) {
                // 垂直方向のサンプリング要素数が1-4の範囲に収まっていない場合
                throw new JpegDecodeError();
            }
            if (component.V > maxNumUnitV) {
                maxNumUnitV = component.V;
            }

            // Tq_i: 量子化テーブルのセレクター (Quantization table destination selector)
            component.Tq = this._stream.readUint8();
            if ((Maker.JpegMarker.SOF0 || Maker.JpegMarker.SOF1 || Maker.JpegMarker.SOF2) && component.Tq > 3) {
                // 量子化テーブルのセレクターが0-3の範囲に収まっていない場合
                throw new JpegDecodeError()
            }

            segment.components[i] = component;
        }

        if (isDebuggingSOF) {
            console.log(`SOF${marker - Maker.JpegMarker.SOF0}`);
            console.log(segment);
        }

        let imageWidth = segment.X;
        let imageHeight = segment.Y;

        // MCUに含まれるユニットの最大数
        let maxNumUnitsInMcu = maxNumUnitH * maxNumUnitV;

        // MCUの寸法
        let mcuWidth = 8 * maxNumUnitH;
        let mcuHeight = 8 * maxNumUnitV;

        // イメージに含まれるMCUの個数
        let numMcuH = Math.ceil(imageWidth / mcuWidth);
        let numMcuV = Math.ceil(imageHeight / mcuHeight);
        let numMcusInImage = numMcuH * numMcuV;

        // 各コンポーネントの設定
        let components = new Array(segment.Nf);
        for (let i = 0; i < components.length; ++i) {
            let component = segment.components[i];

            let id = component.C;
            let numUnitH = component.H;
            let numUnitV = component.V;
            let numUnitsInMcu = numUnitH * numUnitV;
            let qt = component.Tq;

            let blocks = new Array(numMcusInImage * numUnitsInMcu);
            for (let j = 0; j < blocks.length; ++j) {
                blocks[j] = new Int16Array(64);
            }

            components[i] = {
                /** コンポーネントID */
                id: id,
                /** 水平方向のユニットする */
                numUnitH: numUnitH,
                /** 垂直方向のユニット数 */
                numUnitV: numUnitV,
                /** MCUに含まれるユニットの数 */
                numUnitsInMcu: numUnitsInMcu,
                /** 量子化テーブルのセレクター */
                qtSelector: qt,
                /** ブロック */
                blocks: blocks
            };
        }

        this._frame = {
            /** イメージの幅 */
            width: imageWidth,
            /** イメージの高さ */
            height: imageHeight,
            /** 水平方向のMCUのユニットの最大数 */
            maxNumUnitH: maxNumUnitH,
            /** 垂直方向のMCUのユニットの最大数 */
            maxNumUnitV: maxNumUnitV,
            /** MCUに含まれるユニットの最大数 */
            maxNumUnitsInMcu: maxNumUnitsInMcu,
            /** MCUの幅 */
            mcuWidth: mcuWidth,
            /** MCUの高さ */
            mcuHeight: mcuHeight,
            /** イメージに含まれる水平方向のMCU数 */
            numMcuH: numMcuH,
            /** イメージに含まれる垂直方向のMCU数 */
            numMcuV: numMcuV,
            /** イメージに含まれるMCU数 */
            numMcusInImage: numMcusInImage,
            /** コンポーネント配列 */
            components: components
        }

        return segment;
    }

    /** スキャン開始セグメントの解析 */
    _parseSOS() {
        let segment = {};

        // Ls: スキャンヘッダーデータ長 (Scan header length)
        segment.Ls = this._stream.readUint16();

        // Ns: スキャンのイメージコンポーネント数 (Number of image components in scan)
        segment.Ns = this._stream.readUint8();

        if (segment.Ns < 1 || segment.Ns > 4) {
            throw new JpegDecodeError();
        }

        segment.components = new Array(segment.Ns);
        for (let j = 0; j < segment.Ns; ++j) {
            let component = {};

            // Csj: スキャンコンポーネントのセレクター (Scan component selector)
            component.Cs = this._stream.readUint8();

            let Td_Ta = this._stream.readUint8();

            // Tdj: 直流エントロピーコーディングテーブルのセレクター (DC entropy coding table destination selector)
            component.Td = 0xf & (Td_Ta >> 4);

            // Taj: 交流エントロピーコーディングテーブルのセレクター (AC entropy coding table destination selector)
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

        this._decodeScanDataByHuffmanCoding(segment);

        return segment;
    }

    /** 量子化テーブル定義セグメントの解析 */
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

            Common.reorderZigzagSequence(quantizationTable, table.Q);
            this._quantizationTables[table.T] = quantizationTable;

            readSize += 65 + 64 * table.P;

            segment.tables.push(table);
        }

        if (isDebuggingDQT) {
            console.log("DQT");
            console.log(segment);
        }

        return segment;
    }

    /** ハフマンテーブル定義セグメントの解析 */
    _parseDHT() {
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

            // Li: 長さiのハフマンコード数 (Number of Huffman codes of length i)
            table.L = new Array(16);

            this._stream.readUint8Array(table.L, 0, 16);

            // Vi,j: 各ハフマンコードの値 (Value associated with each Huffman code)
            table.V = new Array(16);

            for (let i = 0; i < 16; ++i) {
                let L = table.L[i];
                this._stream.readUint8Array(table.V[i] = new Array(L), 0, L);
                readSize += L;
            }

            readSize += 17;

            segment.tables.push(table);
        }

        for (let table of segment.tables) {
            this._huffmanTrees[table.Tc][table.Th] = this._decodeHuffmanTables(table);
        }

        if (isDebuggingDHT) {
            console.log("DHT");
            console.log(segment);
        }

        return segment;
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

    /** コメントセグメントの解析 */
    _parseCOM() {
        let segment = {};

        // Lc: コメントセグメント長 (Comment segment length)
        segment.Lc = this._stream.readUint16();

        // Cm: コメントバイト (Comment byte)
        let readSize = this._stream.readUint8Array(segment.Cm = new Uint8Array(segment.Lc - 2), 0, segment.Lc - 2);
        if (readSize !== segment.Cm.length) {
            throw new JpegDecodeError();
        }

        if (isDebuggingCOM) {
            console.log("COM");
            console.log(segment);
        }

        return segment;
    }

    /** アプリケーションデータセグメントの解析 */
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
            throw new JpegDecodeError();
        }

        if (isDebuggingAPP) {
            console.log(`APP${marker - Maker.JpegMarker.APPn}`);
            console.log(segment);
        }

        return segment;
    }

    /** ライン数定義セグメントの解析 */
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

    /** 伸張リファレンスコンポーネントセグメントの解析 */
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

    /** ハフマンテーブルをツリーにデコードする */
    _decodeHuffmanTables(table) {
        let isDebugging = isDebuggingDHT && isDebuggingDHTDetail;

        let tree = [];
        let code = 0;
        for (let j = 0; j < table.V.length; ++j) {
            let v = table.V[j];
            if (v.length === 0) {
                tree.push({
                    maxHuffmanCode: 0,
                    values: null
                });
            } else {
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
                                    `code=${("0000000000000000" + code.toString(2)).slice(-j - 1)}, ` +
                                    `runLength=${values[k].runLength}, ` +
                                    `additionalBits=${values[k].additionalBits} (${strValue})`);
                            } else {
                                console.log(
                                    `code=${("0000000000000000" + code.toString(2)).slice(-j - 1)}, ` +
                                    `runLength=${values[k].runLength}, ` +
                                    `additionalBits=${values[k].additionalBits}`);
                            }
                        }
                    } else {
                        // 未定義
                        throw new JpegDecodeError();
                    }
                    code++;
                }
                tree.push({
                    maxHuffmanCode: code,
                    values: values
                });
            }
            code <<= 1;
        }

        return tree;
    }

    /** ハフマン符号化された値を読み込む */
    _readValueWithHuffmanCode(huffmanTree) {
        // ハフマンコードを検索
        let bitsCount = 0;
        let huffmanCode = this._stream.readBits(1);
        while (huffmanCode >= huffmanTree[bitsCount].maxHuffmanCode) {
            huffmanCode = (huffmanCode << 1) | this._stream.readBits(1);
            bitsCount++;
            if (bitsCount >= huffmanTree.length) {
                throw new JpegDecodeError("This huffman table have been broken.");
            }
        }
        let values = huffmanTree[bitsCount].values;
        if (huffmanCode >= values.maxHuffmanCode || values.length === 0) {
            throw new JpegDecodeError("Not found huffman code in the table.");
        }

        // 値を読み込む
        let rawValue = 0;
        let value = 0;
        let element = values[huffmanCode - values[0].huffmanCode];
        if (element.additionalBits > 0) {
            rawValue = this._stream.readBits(element.additionalBits);
            value = rawValue < (1 << (element.additionalBits - 1)) ?
                ((-1 << element.additionalBits) | rawValue) + 1 : rawValue;
        }

        return {
            huffmanCode: huffmanCode,
            numCodeBits: bitsCount,
            runLength: element.runLength,
            additionalBits: element.additionalBits,
            rawValue: rawValue,
            value: value
        };
    }

    /** スキャンデータをハフマン符号化を使用してデコードする */
    _decodeScanDataByHuffmanCoding(segment) {
        let isDebugging = isDebuggingSOS && isDebuggingSOSDetail;

        if (isDebugging) {
            console.log(`mcuSize=[${this._frame.mcuWidth}, ${this._frame.mcuHeight}]`);
        }

        let components = segment.components;
        let huffmanTrees = this._huffmanTrees;

        // スキャンデータのデコード
        let numberOfEndOfBlocks = 0;
        let prevDcCoefs = new Float32Array(segment.Ns);

        for (let i = 0; i < this._frame.numMcusInImage; ++i) {
            for (let j = 0; j < segment.Ns; ++j) {
                let component = components[j];

                let frameComponent = this._frame.components[component.Cs - 1];
                let dcHuffmanTree = huffmanTrees[0][component.Td];
                let acHuffmanTree = huffmanTrees[1][component.Ta];

                for (let k = 0; k < frameComponent.numUnitsInMcu; ++k) {
                    if (isDebugging) {
                        console.log(`MCU[${i}] C[${j}, ${k}]`);
                    }

                    let block = frameComponent.blocks[i * frameComponent.numUnitsInMcu + k];

                    // ブロックの処理のスキップ
                    if (segment.Ah === 0) {
                        // シーケンシャル
                        if (numberOfEndOfBlocks > 0) {
                            numberOfEndOfBlocks--;
                            continue;
                        }
                    } else {
                        // 逐次近似
                        if (numberOfEndOfBlocks > 0) {
                            for (let l = segment.Ss; l <= segment.Se; ++l) {
                                if (block[l] !== 0) {
                                    block[l] |= this._stream.readBits(1) << segment.Al;
                                }
                            }
                            numberOfEndOfBlocks--;
                            continue;
                        }
                    }

                    // DC成分のハフマン符号のデコード
                    if (segment.Ss === 0) {
                        if (segment.Ah === 0) {
                            // シーケンシャル
                            let value = this._readValueWithHuffmanCode(dcHuffmanTree);
                            prevDcCoefs[j] = (block[0] = prevDcCoefs[j] + (value.value << segment.Al));

                            if (isDebugging) {
                                console.log(
                                    `0, ` +
                                    `huffmanCode=${("0000000000000000" + value.huffmanCode.toString(2))
                                        .slice(-value.numCodeBits - 1)}, ` +
                                    `runLength=${value.runLength}, ` +
                                    `additionalBits=${value.additionalBits}, ` +
                                    `rawValue=${value.rawValue}, ` +
                                    `value=${value.value}`);
                            }
                        } else {
                            // 逐次近似
                            block[0] |= this._stream.readBits(1) << segment.Al;
                        }
                    }

                    // AC成分のハフマン符号のデコード
                    for (let l = Math.max(segment.Ss, 1); l <= segment.Se; ++l) {
                        if (segment.Ah === 0) {
                            // シーケンシャル
                            let value = this._readValueWithHuffmanCode(acHuffmanTree);
                            let debugValue;
                            if (value.additionalBits === 0) {
                                if (value.runLength < 0xf) {
                                    // EOB0 ～ EOB14 (End Of Block), DCTの係数を今回の係数も含め終端まで係数を0で埋める
                                    let runLength = (1 << value.runLength) + this._stream.readBits(value.runLength);
                                    numberOfEndOfBlocks = runLength - 1;
                                    while (l <= segment.Se) {
                                        block[l++] = 0;
                                    }
                                    value = `EOB${value.runLength}`;
                                } else {
                                    // ZRL (Zero Run Length), DCTの係数を16個を0で埋め、今回の要素も0として、計16要素を0で埋める
                                    for (let m = 0; m < 15 && l <= segment.Se; ++m) {
                                        block[l++] = 0;
                                    }
                                    block[l] = 0;
                                    value = "ZRL";
                                }
                            } else {
                                // COMPOSITE VALUES, DCTの係数にランレングスの指定の数だけ0で埋め、その後に取り出した値を係数として代入
                                for (let m = 0; m < value.runLength && l <= segment.Se; ++m) {
                                    block[l++] = 0;
                                }
                                block[l] = value.value << segment.Al;
                                debugValue = value.value;
                            }

                            if (isDebugging) {
                                console.log(
                                    `${l}, ` +
                                    `huffmanCode=${("0000000000000000" + value.huffmanCode.toString(2))
                                        .slice(-value.numCodeBits - 1)}, ` +
                                    `runLength=${value.runLength}, ` +
                                    `additionalBits=${value.additionalBits}, ` +
                                    `rawValue=${value.rawValue}, ` +
                                    `value=${debugValue}`);
                            }
                        } else {
                            // 逐次近似
                            let value = this._readValueWithHuffmanCode(acHuffmanTree);
                            if (value.additionalBits === 0) {
                                if (value.runLength < 0xf) {
                                    // EOB0 ～ EOB14 (End Of Block), DCTの係数を今回の係数も含め終端まで係数を0で埋める
                                    let runLength = (1 << value.runLength) + this._stream.readBits(value.runLength);
                                    numberOfEndOfBlocks = runLength - 1;
                                    while (l <= segment.Se) {
                                        if (block[l] !== 0) {
                                            block[l] |= this._stream.readBits(1) << segment.Al;
                                        }
                                        l++;
                                    }
                                    break;
                                } else {
                                    // ZRL (Zero Run Length), DCTの係数を16個を0で埋め、今回の要素も0として、計16要素を0で埋める
                                    for (let m = 0; m < 15 && l <= segment.Se;) {
                                        if (block[l] !== 0) {
                                            block[l] |= this._stream.readBits(1) << segment.Al;
                                        } else {
                                            m++;
                                        }
                                        l++;
                                    }
                                    while (l <= segment.Se) {
                                        if (block[l] !== 0) {
                                            block[l] |= this._stream.readBits(1) << segment.Al;
                                        } else {
                                            break;
                                        }
                                        l++;
                                    }
                                }
                            } else if (value.additionalBits === 1) {
                                for (let m = 0; m < value.runLength && l <= segment.Se;) {
                                    if (block[l] !== 0) {
                                        if (block[l] > 0) {
                                            block[l] |= this._stream.readBits(1) << segment.Al;
                                        } else {
                                            block[l] -= this._stream.readBits(1) << segment.Al;
                                        }
                                    } else {
                                        m++;
                                    }
                                    l++;
                                }
                                while (l <= segment.Se) {
                                    if (block[l] !== 0) {
                                        if (block[l] > 0) {
                                            block[l] |= this._stream.readBits(1) << segment.Al;
                                        } else {
                                            block[l] -= this._stream.readBits(1) << segment.Al;
                                        }
                                    } else {
                                        block[l] = value.value << segment.Al;
                                        break;
                                    }
                                    l++;
                                }
                            } else {
                                throw new JpegDecodeError("This spect had been broken.");
                            }
                        }
                    }
                }
            }
        }

        this._stream.resetRemainBits();

        if (aaa === 0) {
            this._decodeImageWithScanData();
        }
        aaa++;
    }

    /** スキャンデータを画像にデコードする */
    _decodeImageWithScanData() {
        let width = this._frame.width;
        let height = this._frame.height;
        let pixels = new Uint8ClampedArray(width * height * 3);

        let maxNumUnitH = this._frame.maxNumUnitH;
        let maxNumUnitV = this._frame.maxNumUnitV;
        let maxNumUnitsInMcu = this._frame.maxNumUnitsInMcu;
        let mcuWidth = this._frame.mcuWidth;
        let mcuHeight = this._frame.mcuHeight;
        let numMcuH = this._frame.numMcuH;
        let numMcusInImage = this._frame.numMcusInImage;

        let components = this._frame.components;
        let quantizationTables = new Array(components.length);
        for (let i = 0; i < quantizationTables.length; ++i) {
            quantizationTables[i] = this._quantizationTables[components[i].qtSelector];
        }

        let mcuPixels = new Float32Array(mcuWidth * mcuHeight * 3);
        let matrices = new Array(this._frame.components.length);
        for (let i = 0; i < matrices.length; ++i) {
            matrices[i] = new Float32Array(64);
        }

        for (let i = 0; i < numMcusInImage; ++i) {
            let x = i % numMcuH;
            let y = Math.floor(i / numMcuH);

            for (let j = 0; j < components.length; ++j) {
                let component = components[j];
                let componentId = component.id;

                let quantizationTable = quantizationTables[j];

                let numUnitH = component.numUnitH;
                let numUnitV = component.numUnitV;
                let numUnitsInMcu = component.numUnitsInMcu;

                let matrix = matrices[j];

                for (let k = 0; k < numUnitsInMcu; ++k) {
                    let block = component.blocks[i * numUnitsInMcu + k];

                    // ジグザグシーケンスの並び戻す
                    Common.reorderZigzagSequence(matrix, block);

                    // DC成分の処理
                    matrix[0] = matrix[0] * quantizationTable[0];

                    // AC成分の処理
                    for (let l = 1; l < 64; ++l) {
                        matrix[l] *= quantizationTable[l];
                    }

                    // 逆離散コサイン変換を行う
                    Signal.idct(8, matrix);

                    // ユニットの内容をMCU単位の画像に書き込む
                    if (componentId >= 1 && componentId <= 3) {
                        let startIndex =
                            3 * (
                                (mcuWidth * ((k / numUnitH) | 0) << 3) +
                                ((k % numUnitH) << 3)
                            ) + componentId - 1;
                        for (let l = 0; l < 64; ++l) {
                            let h = l >> 3;
                            let v = l & 0x7;
                            let value = matrix[(v << 3) + h];
                            let currentIndex =
                                startIndex +
                                3 * (
                                    mcuWidth * v * maxNumUnitV / numUnitV +
                                    h * maxNumUnitH / numUnitH
                                );
                            for (let m = 0, mEnd = maxNumUnitsInMcu / numUnitsInMcu; m < mEnd; ++m) {
                                let elementIndex =
                                    currentIndex +
                                    3 * (
                                        mcuWidth * ((m / (maxNumUnitH / numUnitH)) | 0) +
                                        m % (maxNumUnitH / numUnitH)
                                    );
                                mcuPixels[elementIndex] = value;
                            }
                        }
                    }
                }
            }

            // MCU単位の画像をYCbCrからRGBに変換
            for (let j = 0; j < mcuWidth * mcuHeight; ++j) {
                Common.convertYcbcrToRgb(mcuPixels, 3 * j, mcuPixels, 3 * j);
            }

            // MCU単位の画像を出力画像に書き込み
            for (let v = 0; v < mcuHeight && mcuHeight * y + v < height; ++v) {
                for (let h = 0; h < mcuWidth && mcuWidth * x + h < width; ++h) {
                    let mcuIndex = 3 * (mcuWidth * v + h);
                    let imageIndex = 3 * (width * (mcuHeight * y + v) + (mcuWidth * x + h));
                    pixels[imageIndex] = mcuPixels[mcuIndex];
                    pixels[imageIndex + 1] = mcuPixels[mcuIndex + 1];
                    pixels[imageIndex + 2] = mcuPixels[mcuIndex + 2];
                }
            }
        }

        this.out = {
            width: width,
            height: height,
            pixels: pixels
        };

        if (this._callback) {
            this._callback("decodeImage", this.out);
        }
    }

    /** JPEGのデコードを行う */
    decode(callback) {
        this._callback = callback;

        // SOI: イメージ開始マーカー
        let soiMarker = this._stream.readMaker();
        if (soiMarker !== Maker.JpegMarker.SOI) {
            return false;
        }

        while (true) {
            let marker = this._stream.readMaker();
            switch (marker) {
                // SOFマーカー

                // SOF0: ベースDCT (Baseline DCT)
                case Maker.JpegMarker.SOF0:
                // SOF1: 拡張シーケンシャルDCT、ハフマン符号 (Extended sequential DCT, Huffman coding)
                case Maker.JpegMarker.SOF1:
                // SOF2: プログレッシブDCT、ハフマン符号 (Progressive DCT, Huffman coding)
                case Maker.JpegMarker.SOF2:
                    this._parseSOF(marker);
                    break;

                // SOF3: 可逆圧縮 (シーケンシャル)、ハフマン符号 (Lossless (sequential), Huffman coding)
                case Maker.JpegMarker.SOF3:
                    throw new JpegDecodeError(`Unsupported SOF marker: ${marker.toString(16)}`);

                // SOFマーカー (非対応)

                // SOF9: 拡張シーケンシャルDCT、算術符号 (Extended sequential DCT, arithmetic coding)
                case Maker.JpegMarker.SOF9:
                // SOF10: プログレッシブDCT、算術符号 (Progressive DCT, arithmetic coding)
                case Maker.JpegMarker.SOF10:
                // SOF11: 可逆圧縮、算術符号 (Lossless (sequential), arithmetic coding)
                case Maker.JpegMarker.SOF11:
                    throw new JpegDecodeError(`Unsupported SOF marker: ${marker.toString(16)}`);

                // 拡張用SOF

                // Differential sequential DCT
                case Maker.JpegMarker.SOF5:
                // Differential progressive DCT
                case Maker.JpegMarker.SOF6:
                // Differential lossless (sequential)
                case Maker.JpegMarker.SOF7:
                // Differential sequential DCT
                case Maker.JpegMarker.SOF13:
                // Differential progressive DCT
                case Maker.JpegMarker.SOF14:
                // Differential lossless (sequential)
                case Maker.JpegMarker.SOF15:
                    throw new JpegDecodeError(`Unsupported Expansion SOF marker: ${marker.toString(16)}`);

                // SOS: Start of scan marker
                case Maker.JpegMarker.SOS:
                    this._parseSOS();
                    break;

                // DQT: Define quantization table marker
                case Maker.JpegMarker.DQT:
                    this._parseDQT();
                    break;

                // DHT: Define Huffman table marker
                case Maker.JpegMarker.DHT:
                    this._parseDHT();
                    break;

                // DAC: Define arithmetic coding conditioning marker
                case Maker.JpegMarker.DAC:
                    this._parseDAC();
                    break;

                // DRI: Define restart interval marker
                case Maker.JpegMarker.DRI:
                    this._parseDRI();
                    break;

                // COM: コメントマーカ (Comment marker)
                case Maker.JpegMarker.COM:
                    this._parseCOM();
                    break;

                // DNL: (Define number of lines marker)
                case Maker.JpegMarker.DNL:
                    this._parseDNL();
                    break;

                // DHP: (hierarchical progression marker)
                case Maker.JpegMarker.DHP:
                    this._parseSOF(marker);
                    break;

                // EXP: (Expand reference components marker)
                case Maker.JpegMarker.EXP:
                    this._parseEXP();
                    break;

                // EOI: エンドマーカ (End of image)
                case Maker.JpegMarker.EOI:
                    if (isDebuggingEOI) {
                        console.log("EOI");
                    }
                    return true;

                default:
                    if (marker >= Maker.JpegMarker.APPn && marker <= Maker.JpegMarker.APPn_end) {
                        // APPn: アプリケーションデータマーカー
                        this._parseAPP(marker);
                    } else if (marker >= Maker.JpegMarker.JPGn && marker <= Maker.JpegMarker.JPGn_end) {
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
