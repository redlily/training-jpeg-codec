import {
    APPn,
    APPn_end,
    COM,
    DAC,
    DHP,
    DHT,
    DNL,
    DQT,
    DRI,
    EOI,
    EXP,
    JPGn,
    JPGn_end,
    SOF0,
    SOF1,
    SOF10,
    SOF11,
    SOF13,
    SOF14,
    SOF15,
    SOF2,
    SOF3,
    SOF5,
    SOF6,
    SOF7,
    SOF9,
    SOI,
    SOS,
} from "./JpegMarker.js";
import {JpegReadStream} from "./JpegDataStream.js";
import {middle, reorderZigzagSequence, ycbcrToRgb} from "./JpegCommon.js";
import {
    checkContainsWithMarker,
    checkEquals,
    checkEqualsWithMaker,
    checkRange,
    checkRangeWithMarker
} from "./JpegCheck.js";
import {idct} from "./JpegSignal.js";

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
    /**
     * コンストラクタ
     * @param {string} message メッセージ
     */
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
     * @param {ArrayBuffer} buffer データ
     * @param {number} offset データオフセット
     * @param {number} length データ長
     */
    constructor(buffer, offset = undefined, length = undefined) {
        /** データストリーム */
        this._stream = new JpegReadStream(buffer, offset, length);
        /** フーレムのデータ */
        this._frame = null;
        /** 量子化テーブル */
        this._quantizationTables = {};
        /** ハフマン木 */
        this._huffmanTables = [{}, {}];
        /** リスタートインターバル */
        this._restertInterval = 0;
        /** 出力データ */
        this.out = null;
    }

    /**
     * JPEGのデコードを行う
     * @param {function(string, any)} callback イベントコールバック
     */
    decode(callback) {
        this._callback = callback;

        // イメージ開始
        let soiMarker = this._stream.readUint16();
        if (soiMarker !== SOI) {
            return false;
        }

        while (true) {
            let marker = this._stream.readUint16();
            switch (marker) {
                // イメージ終了
                case EOI:
                    if (isDebuggingEOI) {
                        console.log("EOI");
                    }
                    return true;

                // ベースDCT
                case SOF0:
                // 拡張シーケンシャルDCT、ハフマン符号か
                case SOF1:
                // プログレッシブDCT、ハフマン符号化
                case SOF2:
                // 可逆圧縮、ハフマン符号
                case SOF3:
                // 差分シーケンシャルDCT、ハフマン符号化
                case SOF5:
                // 差分プログレッシブDCT、ハフマン符号化
                case SOF6:
                // 差分可逆圧縮、ハフマン符号化
                case SOF7:
                // シーケンシャルDCT、算術符号化
                case SOF9:
                // プログレッシブDCT、算術符号化
                case SOF10:
                // 可逆圧縮、算術符号化
                case SOF11:
                // 差分シーケンシャルDCT、算術符号化
                case SOF13:
                // 差分プログレッシブDCT、算術符号化
                case SOF14:
                // 差分可逆圧縮、算術符号化
                case SOF15:
                    this._parseSOF(marker);
                    break;

                // スキャン開始
                case SOS:
                    this._parseSOS();
                    break;

                // 量子化テーブル定義
                case DQT:
                    this._parseDQT();
                    break;

                // ハフマンテーブル定義
                case DHT:
                    this._parseDHT();
                    break;

                // 算術符号化条件定義
                case DAC:
                    this._parseDAC();
                    break;

                // リスタートインターバル定義
                case DRI:
                    this._parseDRI();
                    break;

                // コメント
                case COM:
                    this._parseCOM();
                    break;

                // ライン数定義
                case DNL:
                    this._parseDNL();
                    break;

                // 階層プログレス定義
                case DHP:
                    this._parseDHP();
                    break;

                // 拡張リファレンスコンポーネント
                case EXP:
                    this._parseEXP();
                    break;

                default:
                    if (marker >= APPn && marker <= APPn_end) {
                        // 予約済みのアプリケーションセグメント
                        this._parseAPP(marker);
                    } else if (marker >= JPGn && marker <= JPGn_end) {
                        // 予約済みのJPEG拡張
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

    /**
     * フレームの開始セグメントの解析
     */
    _parseSOF(marker) {
        if (marker !== SOF0 && marker !== SOF1 && marker !== SOF2) {
            throw new JpegDecodeError(`Unsupported SOF${marker - SOF0} marker`);
        }

        let segment = {};

        // Lf: フレームヘッダー長 (Frame header length)
        segment.Lf = this._stream.readUint16();

        // P: サンプル制度 (Sample precision)
        segment.P = this._stream.readUint8();
        checkEqualsWithMaker([SOF0], 8, marker, segment.P);
        checkContainsWithMarker([SOF1, SOF2], [8, 12], marker, segment.P);

        // Y: ライン数 (Number of lines)
        segment.Y = this._stream.readUint16();
        checkRange(0, 65535, segment.Y);

        // X: ラインあたりのサンプル数 (Number of samples per line)
        segment.X = this._stream.readUint16();
        checkRange(1, 65535, segment);

        // Nf: フレームのイメージコンポーネント数 (Number of image components in frame)
        segment.Nf = this._stream.readUint8();
        checkRangeWithMarker([SOF0, SOF1], 1, 255, marker, segment.Nf);
        checkEqualsWithMaker([SOF2], 1, 4, marker, segment.Nf);

        segment.components = new Array(segment.Nf);
        for (let i = 0; i < segment.Nf; ++i) {
            let component = {};

            // C_i: コンポーネントの識別子 (Component identifier)
            component.C = this._stream.readUint8();

            let H_V = this._stream.readUint8();

            // H_i: 水平方向のサンプリング数 (Horizontal sampling factor)
            component.H = 0xf & (H_V >> 4);
            checkRange(1, 4, component.H);

            // V_i: 垂直方向のサンプリング数 (Vertical sampling factor)
            component.V = 0xf & H_V;
            checkRange(1, 4, component.V);

            // Tq_i: 量子化テーブル出力セレクター (Quantization table destination selector)
            component.Tq = this._stream.readUint8();
            checkRangeWithMarker([SOF0, SOF1, SOF2], 0, 3, marker, component.Tq);

            segment.components[i] = component;
        }

        if (isDebuggingSOF) {
            console.log(`SOF${marker - SOF0}`);
            console.log(segment);
        }

        this._constructFrameInfo(marker, segment);
        return segment;
    }

    /**
     * フレーム情報の構築
     */
    _constructFrameInfo(marker, segment) {
        // サンプリング要素数の最大値
        let maxSamplingFactorH = 1;
        let maxSamplingFactorV = 1;
        for (let i = 0; i < segment.components.length; ++i) {
            let component = segment.components[i];

            if (maxSamplingFactorH < component.H) {
                maxSamplingFactorH = component.H;
            }
            if (maxSamplingFactorV < component.V) {
                maxSamplingFactorV = component.V;
            }
        }

        let widthMcu = maxSamplingFactorH * 8;
        let heightMcu = maxSamplingFactorV * 8;

        let width = segment.X;
        let height = segment.Y;
        let numMcusH = Math.ceil(width / widthMcu);
        let numMcusV = Math.ceil(height / heightMcu);

        // コンポーネント情報の構築
        let components = new Array(segment.Nf);
        for (let i = 0; i < components.length; ++i) {
            let component = segment.components[i];

            let numUnitsHInMcu = maxSamplingFactorH / component.H;
            let numUnitsVInMcu = maxSamplingFactorV / component.V;

            let numUnitsH = numMcusH * component.H;
            let numUnitsV = numMcusV * component.V;

            let numUnitsHWithoutMcu =
                Math.ceil(width * component.H / maxSamplingFactorH / 8);
            let numUnitsVWithoutMcu =
                Math.ceil(height * component.V / maxSamplingFactorV / 8);

            let units = new Array(numUnitsH * numUnitsV)
            for (let j = 0; j < units.length; ++j) {
                units[j] = new Int16Array(64);
            }

            components[i] = {
                /** コンポーネントID */
                id: component.C,
                /** 水平方向のサンプリング数 */
                samplingFactorH: component.H,
                /** 垂直方向のサンプリング数 */
                samplingFactorV: component.V,
                /** サンプリング数 */
                samplingFactor: component.H * component.V,
                /** MCU内での水平方向のユニット数 */
                numUnitsHInMcu: numUnitsHInMcu,
                /** MCU内での垂直方向ユニット数 */
                numUnitsVInMcu: numUnitsVInMcu,
                /** MCU内でのユニット数 */
                numUnitsInMcu: numUnitsHInMcu * numUnitsVInMcu,
                /** 水平方向のユニット数 */
                numUnitsH: numUnitsH,
                /** 垂直方向のユニット数 */
                numUnitsV: numUnitsV,
                /** ユニット数 */
                numUnits: numUnitsH * numUnitsV,
                /** MCUの制約なしの水平方向のユニット数、非インターリーブ用 */
                numUnitsHWithoutMcu: numUnitsHWithoutMcu,
                /** MCUの制約なしの垂直方向のユニット数、非インターリーブ用 */
                numUnitsVWithoutMcu: numUnitsVWithoutMcu,
                /** MCUの制約なしのユニット数、非インターリーブ用 */
                numUnitsWithoutMcu: numUnitsHWithoutMcu * numUnitsVWithoutMcu,
                /** ユニット配列 */
                units: units,
                /** 量子化テーブルのセレクター */
                qtSelector: component.Tq
            };
        }

        // フレーム情報の構築
        this._frame = {
            /** タイプ */
            type: marker,
            /** イメージの幅 */
            width: width,
            /** イメージの高さ */
            height: height,
            /** 水平方向の最大サンプリング数 */
            maxSamplingFactorH: maxSamplingFactorH,
            /** 垂直方向の最大サンプリング数 */
            maxSamplingFactorV: maxSamplingFactorV,
            /** 水平方向のMCU数 */
            numMcusH: numMcusH,
            /** 垂直方向のMCU数 */
            numMcusV: numMcusV,
            /** 画像内のMCU数 */
            numMcus: numMcusH * numMcusV,
            /** コンポーネント配列 */
            components: components
        }
    }

    /**
     * スキャン開始セグメントの解析
     */
    _parseSOS() {
        let segment = {};
        let frameType = this._frame.type;

        // Ls: スキャンヘッダーデータ長 (Scan header length)
        segment.Ls = this._stream.readUint16();

        // Ns: スキャンのイメージコンポーネント数 (Number of image components in scan)
        segment.Ns = this._stream.readUint8();
        checkRange(1, 4, segment.Ns);

        segment.components = new Array(segment.Ns);
        for (let j = 0; j < segment.Ns; ++j) {
            let component = {};

            // Cs_j: スキャンコンポーネントのセレクター (Scan component selector)
            component.Cs = this._stream.readUint8();
            checkRange(0, 255, component.Cs);

            let Td_Ta = this._stream.readUint8();

            // Td_j: 直流エントロピーコーディングテーブルのセレクター (DC entropy coding table destination selector)
            component.Td = 0xf & (Td_Ta >> 4);
            checkRangeWithMarker([SOF0], 0, 1, frameType, component.Td);
            checkRangeWithMarker([SOF1, SOF2], 0, 3, frameType, component.Td);

            // Ta_j: 交流エントロピーコーディングテーブルのセレクター (AC entropy coding table destination selector)
            component.Ta = 0xf & Td_Ta;
            checkRangeWithMarker([SOF0], 0, 1, frameType, component.Ta);
            checkRangeWithMarker([SOF1, SOF2], 0, 3, frameType, component.Ta);

            segment.components[j] = component;
        }

        // Ss: スペクトルかプリディクターの開始セレクター (Start of spectral or predictor selection)
        segment.Ss = this._stream.readUint8();
        checkEqualsWithMaker([SOF0, SOF1], 0, frameType, segment.Ss);
        checkRangeWithMarker([SOF2], 0, 63, frameType, segment.Ss);

        // Se: スペクトルの終了セレクター (End of spectral selection)
        segment.Se = this._stream.readUint8();
        checkEqualsWithMaker([SOF0, SOF1], 63, frameType, segment.Se);
        checkRangeWithMarker([SOF2], segment.Se, 63, frameType, segment.Se);

        let Ah_Al = this._stream.readUint8();

        // Ah: 逐次近似の上位のビットの位置 (Successive approximation bit position high)
        segment.Ah = 0xf & (Ah_Al >> 4);
        checkEqualsWithMaker([SOF0, SOF1], 0, frameType, segment.Ah);
        checkRangeWithMarker([SOF2], 0, 13, frameType, segment.Ah);

        // Al: 逐次近似の下位のビットの位置もしくはピットの移動値 (Successive approximation bit position low or point transform)
        segment.Al = 0xf & Ah_Al;
        checkEqualsWithMaker([SOF0, SOF1], 0, frameType, segment.Al);
        checkRangeWithMarker([SOF2], 0, 13, frameType, segment.Al);

        if (isDebuggingSOS) {
            console.log("SOS");
            console.log(segment);
        }

        this._decodeScanDataWithHuffmanCoding(segment);
        return segment;
    }

    /**
     * スキャンデータをハフマン符号化を用いてデコード
     */
    _decodeScanDataWithHuffmanCoding(segment) {
        let scanWork = {
            numberOfEndOfBlocks: 0,
            prevDcCoefs: new Float32Array(segment.Ns)
        }

        if (segment.Ns > 1) {
            // インターリーブの場合
            for (let i = 0; i < this._frame.numMcus; ++i) {
                for (let j = 0; j < segment.Ns; ++j) {
                    let scanComponent = segment.components[j];
                    let frameComponent = this._frame.components[scanComponent.Cs - 1];

                    let dcHuffmanTable = this._huffmanTables[0][scanComponent.Td];
                    let acHuffmanTable = this._huffmanTables[1][scanComponent.Ta];

                    for (let k = 0; k < frameComponent.samplingFactor; ++k) {
                        let index = frameComponent.numUnitsH *
                            frameComponent.samplingFactorV * Math.floor(i / this._frame.numMcusH) +
                            frameComponent.samplingFactorH * (i % this._frame.numMcusH) +
                            frameComponent.numUnitsH *
                            Math.floor(k / frameComponent.samplingFactorH) +
                            k % frameComponent.samplingFactorH;
                        this._decodeUnitWithHuffmanCoding(
                            segment,
                            scanWork,
                            dcHuffmanTable,
                            acHuffmanTable,
                            j,
                            frameComponent.units[index]);
                    }
                }
            }
        } else {
            // 非インターリーブの場合
            let scanComponent = segment.components[0];
            let frameComponent = this._frame.components[scanComponent.Cs - 1];

            let dcHuffmanTree = this._huffmanTables[0][scanComponent.Td];
            let acHuffmanTree = this._huffmanTables[1][scanComponent.Ta];

            for (let i = 0;
                 i < frameComponent.numUnitsH *
                 frameComponent.numUnitsVWithoutMcu;
                 ++i) {

                if (i % frameComponent.numUnitsH >
                    frameComponent.numUnitsHWithoutMcu - 1) {
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
     * ユニットデータをハフマン符号化を用いてデコード
     */
    _decodeUnitWithHuffmanCoding(segment, scanWork, dcHuffmanTree, acHuffmanTree, component, unit) {
        let isDebugging = isDebuggingSOS && isDebuggingSOSDetail;

        // ブロックの処理のスキップ
        if (segment.Ah === 0) {
            // シーケンシャル
            if (scanWork.numberOfEndOfBlocks > 0) {
                scanWork.numberOfEndOfBlocks--;
                return;
            }
        } else {
            // 逐次近似
            if (scanWork.numberOfEndOfBlocks > 0) {
                // DC成分
                if (segment.Ss === 0) {
                    unit[0] |= this._stream.readBits(1) << segment.Al;
                }

                // AC成分
                for (let i = Math.max(1, segment.Ss); i <= segment.Se; ++i) {
                    if (unit[i] !== 0) {
                        if (unit[i] > 0) {
                            unit[i] |= this._stream.readBits(1) << segment.Al;
                        } else {
                            unit[i] -= this._stream.readBits(1) << segment.Al;
                        }
                    }
                }
                scanWork.numberOfEndOfBlocks--;
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
                        `huffmanCode=${("0000000000000000" + value.huffmanCode.toString(2)).slice(-value.numCodingBits - 1)}, ` +
                        `RRRR=${value.RRRR}, ` +
                        `SSSS=${value.SSSS}, ` +
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
                if (value.SSSS === 0) {
                    if (value.RRRR < 0xf) {
                        // EOB0 ～ EOB14 (End Of Block), DCTの係数を今回の係数も含め終端まで係数を0で埋める
                        let runLength = (1 << value.RRRR) + this._stream.readBits(value.RRRR);
                        scanWork.numberOfEndOfBlocks = runLength - 1;
                        while (i <= segment.Se) {
                            unit[i++] = 0;
                        }
                        value = `EOB${value.RRRR}`;
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
                    for (let j = 0; j < value.RRRR && i <= segment.Se; ++j) {
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
                        `RRRR=${value.RRRR}, ` +
                        `SSSS=${value.SSSS}, ` +
                        `rawValue=${value.rawValue}, ` +
                        `value=${debugValue}`);
                }
            } else {
                // 逐次近似
                // スタート以降は1ビットずつの読み込み
                let value = this._readValueWithHuffmanCode(acHuffmanTree);
                if (value.SSSS === 0) {
                    if (value.RRRR < 0xf) {
                        // EOB0 ～ EOB14 (End Of Block), DCTの係数を今回の係数も含め終端まで係数を0で埋める
                        let runLength = (1 << value.RRRR) + this._stream.readBits(value.RRRR);
                        scanWork.numberOfEndOfBlocks = runLength - 1;
                        while (i <= segment.Se) {
                            if (unit[i] !== 0) {
                                if (unit[i] > 0) {
                                    unit[i] |= this._stream.readBits(1) << segment.Al;
                                } else {
                                    unit[i] -= this._stream.readBits(1) << segment.Al;
                                }
                            }
                            i++;
                        }
                        break;
                    } else {
                        // ZRL (Zero Run Length), DCTの係数を16個を0で埋め、今回の要素も0として、計16要素を0で埋める
                        for (let j = 0; j < 15 && i <= segment.Se;) {
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
                                break;
                            }
                            i++;
                        }
                    }
                } else if (value.SSSS === 1) {
                    for (let j = 0; j < value.RRRR && i <= segment.Se;) {
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
     * スキャンデータを画像にデコード
     */
    _decodeImageWithScanData() {
        // コンポーネントを個別にピクセルに変換
        let unit = new Float32Array(64);
        let componentInfos = new Array(3)
        for (let i = 0; i < this._frame.components.length; ++i) {
            let component = this._frame.components[i];
            if (component.id < 1 || component.id > 3) continue;

            let pixels = new Int16Array(component.numUnits * 64)
            componentInfos[component.id - 1] = {
                "component": component,
                "pixels": pixels
            }

            let quantizationTable = this._quantizationTables[component.qtSelector];

            for (let j = 0; j < component.units.length; ++j) {
                let xj = (j % component.numUnitsH) * 8;
                let yj = Math.floor(j / component.numUnitsH) * component.numUnitsH * 64;

                // ジグザグシーケンスの並び戻す
                reorderZigzagSequence(unit, component.units[j]);

                // 再量子化
                for (let k = 0; k < 64; ++k) {
                    unit[k] *= quantizationTable[k];
                }

                // 逆離散コサイン変換
                idct(8, unit);

                // 結果を書き出す
                for (let k = 0; k < 64; ++k) {
                    let xk = xj + k % 8;
                    let yk = yj + Math.floor(k / 8) * component.numUnitsH * 8;
                    pixels[xk + yk] = Math.round(unit[k]);
                }
            }
        }

        // 個別にピクセルに変換されたコンポーネントを一つの画像に結合
        let width = this._frame.width;
        let height = this._frame.height;
        let numPixels = width * height;
        let pixels = new Uint8ClampedArray(numPixels * 3);
        let frameWidth = this._frame.numMcusH * this._frame.maxSamplingFactorH * 8;
        let frameHeight = this._frame.numMcusV * this._frame.maxSamplingFactorV * 8;
        for (let i = 0; i < componentInfos.length; ++i) {
            let componentInfo = componentInfos[i];
            if (componentInfo == null) continue;

            let component = componentInfo.component;
            let componentPixels = componentInfo.pixels;
            let componentWidth = component.numUnitsH * 8;
            let componentHeight = component.numUnitsV * 8;
            let offsetX = (frameWidth / componentWidth) / 2 - 0.5;
            let offsetY = (frameHeight / componentHeight) / 2 - 0.5;
            for (let j = 0; j < numPixels; ++j) {
                let x = j % width;
                let y = Math.floor(j / width);

                let componentX = middle(0, componentWidth * (x - offsetX) / frameWidth, componentWidth - 1);
                let componentY = middle(0, componentHeight * (y - offsetY) / frameHeight, componentHeight - 1);

                let xf = Math.floor(componentX);
                let xc = Math.ceil(componentX);
                let xm = componentX - xf;
                let yf = Math.floor(componentY);
                let yc = Math.ceil(componentY);
                let ym = componentY - yf;

                pixels[(x + y * width) * 3 + i] =
                    Math.round(
                        componentPixels[xf + yf * componentWidth] * (1.0 - xm) * (1.0 - ym) +
                        componentPixels[xc + yf * componentWidth] * xm * (1.0 - ym) +
                        componentPixels[xf + yc * componentWidth] * (1.0 - xm) * ym +
                        componentPixels[xc + yc * componentWidth] * xm * ym) + 128;
            }
        }

        for (let i = 0; i < numPixels; ++i) {
            ycbcrToRgb(pixels, i * 3, pixels, i * 3);
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
            checkRange(0, 1, table.P);

            // Tq: 量子化テーブルの登録先の識別子 (Quantization table destination identifier)
            table.T = Pq_Tq & 0x0f;
            checkRange(0, 3, table.T);

            // Qk: 量子化テーブルの要素 (Quantization table element)
            let quantizationTable;
            if (table.P === 0) {
                // 8bitの精度
                let Q = new Uint8Array(64);
                for (let k = 0; k < 64; ++k) {
                    Q[k] = this._stream.readUint8();
                    checkRange(1, 255, Q[k]);
                }
                table.Q = Q;
                quantizationTable = new Uint8Array(64);
            } else if (table.P === 1) {
                // 16bitの精度
                let Q = new Uint16Array(64);
                for (let k = 0; k < 64; ++k) {
                    Q[k] = this._stream.readUint16();
                    checkRange(1, 65535, Q[k]);
                }
                table.Q = Q;
                quantizationTable = new Uint16Array(64);
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
                for (let i = 0; i < segment.tables.length; ++i) {
                    let table = segment.tables[i];

                    let quantizationTable = new Uint16Array(64);
                    reorderZigzagSequence(quantizationTable, table.Q);

                    let output = [];
                    for (let j = 0; j < 64; j += 8) {
                        output.push(Array.from(quantizationTable.slice(j, j + 8)));
                    }

                    console.log(`Quantization table ${table.T}.`);
                    console.table(output);
                }
            }
        }

        return segment;
    }


    /**
     * ハフマンテーブル定義セグメントの解析
     */
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
            checkRange(0, 1, table.Tc);

            // Th: ハフマンテーブルの識別子 (Huffman table destination identifier)
            table.Th = 0xf & Tc_Th;
            checkRange(0, 3, table.Th);

            // L_i: 長さiのハフマンコード数 (Number of Huffman codes of length i)
            table.L = new Uint8Array(16);
            this._stream.readUint8Array(table.L, 0, 16);
            for (let i = 0; i < 16; ++i) {
                checkRange(0, 255, table.L[i]);
            }

            // V_{i, j}: 各ハフマンコードの値 (Value associated with each Huffman code)
            table.V = new Array(16);
            for (let i = 0; i < 16; ++i) {
                let L = table.L[i];
                let V = new Uint8Array(L);
                this._stream.readUint8Array(V, 0, L);
                for (let j = 0; j < L; ++j) {
                    checkRange(0, 255, V[j]);
                }
                table.V[i] = V;

                readSize += L;
            }

            readSize += 17;
            segment.tables.push(table);
        }

        if (isDebuggingDHT) {
            console.log("DHT");
            console.log(segment);
        }

        // ハフマンテーブルをより扱いやすい構造にする
        for (let i = 0; i < segment.tables.length; ++i) {
            let table = segment.tables[i];
            this._huffmanTables[table.Tc][table.Th] = this._decodeHuffmanTables(table);
        }

        return segment;
    }

    /**
     * ハフマンテーブルを取り扱いやすい構造にデコード
     */
    _decodeHuffmanTables(table) {
        let isDebugging = isDebuggingDHT && isDebuggingDHTDetail;
        let debugTable = [];

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
                        RRRR: 0,
                        SSSS: value,
                    };
                    if (isDebugging) {
                        debugTable.push({
                            "bits": j + 1,
                            "code": ("0000000000000000" + code.toString(2)).slice(-j - 1),
                            "SSSS": values[k].SSSS
                        });
                    }
                } else if (table.Tc === 1) {
                    // AC成分用
                    values[k] = {
                        huffmanCode: code,
                        RRRR: 0xf & (value >> 4),
                        SSSS: 0xf & value,
                    };
                    if (isDebugging) {
                        if (values[k].SSSS === 0) {
                            let strValue;
                            if (value === 0x00) {
                                strValue = "EOB or EOB0";
                            } else if (value => 0x10 && value <= 0xe0) {
                                strValue = "EOB" + (value >> 4);
                            } else if (value === 0xf0) {
                                strValue = "ZRL";
                            }
                            debugTable.push({
                                "bits": j + 1,
                                "code": ("0000000000000000" + code.toString(2)).slice(-j - 1),
                                "RRRR": values[k].RRRR,
                                "SSSS": values[k].SSSS,
                                "specialValue": strValue
                            });
                        } else {
                            debugTable.push({
                                "bits": j + 1,
                                "code": ("0000000000000000" + code.toString(2)).slice(-j - 1),
                                "RRRR": values[k].RRRR,
                                "SSSS": values[k].SSSS
                            });
                        }
                    }
                } else {
                    // 未定義
                    throw new JpegDecodeError(`Huffman table have been broken.`);
                }
                code++;
            }
            tree.push(values);
            code <<= 1;
        }

        if (isDebugging) {
            console.log(`Huffman table for ${table.Tc === 0 ? "DC" : "AC"}; ID ${table.Th}.`);
            console.table(debugTable);
        }

        return tree;
    }

    /**
     * ハフマン符号化された値を読み込み
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
        if (element.SSSS > 0) {
            rawValue = this._stream.readBits(element.SSSS);

            // マグニチュードカテゴリによるデコード
            value = rawValue < (1 << (element.SSSS - 1)) ?
                ((-1 << element.SSSS) | rawValue) + 1 : rawValue;
        }

        return {
            /** ハフマンコード */
            huffmanCode: huffmanCode,
            /** ハフマンコードのビット数 */
            numCodingBits: rowIndex + 1,
            /** ランレングス */
            RRRR: element.RRRR,
            /** 追加読み込みビット数 */
            SSSS: element.SSSS,
            /** 未加工の値 */
            rawValue: rawValue,
            /** デコードされた数値 */
            value: value
        };
    }

    /**
     * 算術符号化条件定義セグメントの解析
     * 非サポート、セグメント解析だけ行っている
     */
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

    /**
     * リスタートインターバル定義セグメントの解析
     */
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
     * 非サポート、セグメント解析だけ行っている
     */
    _parseCOM() {
        let segment = {};

        // Lc: コメントセグメント長 (Comment segment length)
        segment.Lc = this._stream.readUint16();

        // Cm: コメントバイト (Comment byte)
        segment.Cm = new Uint8Array(segment.Lc - 2);
        this._stream.readUint8Array(segment.Cm, 0, segment.Lc - 2);

        if (isDebuggingCOM) {
            console.log("COM");
            console.log(segment);
        }

        return segment;
    }

    /**
     * アプリケーションデータセグメントの解析
     * 非サポート、セグメント解析だけ行っている
     */
    _parseAPP(marker) {
        let segment = {};

        // Lp: アプリケーションデータセグメント長 (Application data segment length)
        segment.Lp = this._stream.readUint16();

        // Api: アプリケーションデータバイト (Application data byte)
        segment.Ap = new Uint8Array(segment.Lp - 2);
        this._stream.readUint8Array(segment.Ap, 0, segment.Ap.length);

        if (isDebuggingAPP) {
            console.log(`APP${marker - APPn}`);
            console.log(segment);
        }

        return segment;
    }

    /**
     * ライン数定義セグメントの解析
     * 非サポート、セグメント解析だけ行っている
     */
    _parseDNL() {
        let segment = {};

        // Ld: ライン数定義セグメント長 (Define number of lines segment length)
        segment.Nd = this._stream.readUint16();

        // NL: ライン数 (Number of lines)
        segment.NL = this._stream.readUint16();

        if (isDebuggingDNL) {
            console.log("DNL");
            console.log(segment);
        }

        return segment;
    }

    /**
     * 階層プログレス定義セグメントの解析
     */
    _parseDHP() {
        let segment = {};

        // Lf: フレームヘッダー長 (Frame header length)
        segment.Lf = this._stream.readUint16();

        // P: サンプル制度 (Sample precision)
        segment.P = this._stream.readUint8();

        // Y: ライン数 (Number of lines)
        segment.Y = this._stream.readUint16();

        // X: ラインあたりのサンプル数 (Number of samples per line)
        segment.X = this._stream.readUint16();

        // Nf: フレームのイメージコンポーネント数 (Number of image components in frame)
        segment.Nf = this._stream.readUint8();

        segment.components = new Array(segment.Nf);
        for (let i = 0; i < segment.Nf; ++i) {
            let component = {};

            // C_i: コンポーネントの識別子 (Component identifier)
            component.C = this._stream.readUint8();

            let H_V = this._stream.readUint8();

            // H_i: 水平方向のサンプリング数 (Horizontal sampling factor)
            component.H = 0xf & (H_V >> 4);

            // V_i: 垂直方向のサンプリング数 (Vertical sampling factor)
            component.V = 0xf & H_V;

            // Tq_i: 量子化テーブル出力セレクター (Quantization table destination selector)
            component.Tq = this._stream.readUint8();
            checkEquals(0, component.Tq);

            segment.components[i] = component;
        }

        if (isDebuggingSOF) {
            console.log(`DHP`);
            console.log(segment);
        }

        return segment;
    }

    /**
     * 伸張リファレンスコンポーネントセグメントの解析
     * 非サポート、セグメント解析だけ行っている
     */
    _parseEXP() {
        let segment = {};

        // Le: 拡張リファレンスコンポーネントセグメント長 (Expand reference components segment length)
        segment.Le = this._stream.readUint16();

        let Eh_Ev = this._stream.readUint8();

        // Eh: 水平の拡張 (Expand horizontally)
        segment.Eh = (Eh_Ev & 0xf0) >>> 4;

        // Ev: 垂直の拡張 (Expand vertically)
        segment.Ev = Eh_Ev & 0x0f;

        if (isDebuggingEXP) {
            console.log("EXP");
            console.log(segment);
        }

        return segment;
    }
}
