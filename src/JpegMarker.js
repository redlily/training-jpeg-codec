/**
 * JPEGのマーカーの定義をまとめたクラス
 */

// Start Of Frame markers, non-differential, Huffman coding. フレームの開始マーカー、非差分、ハフマン符号化

/** Baseline DCT. ベースラインDCT */
export let SOF0 = 0xFFC0;
/** Extended sequential DCT. 拡張シーケンシャルDCT、ハフマン符号化 */
export let SOF1 = 0xFFC1;
/** Progressive DCT. プログレッシブDCT、ハフマン符号化 */
export let SOF2 = 0xFFC2;
/** Lossless (sequential). 可逆圧縮 (シーケンシャル)、ハフマン符号化 */
export let SOF3 = 0xFFC3;

// Start Of Frame markers, differential, Huffman coding. フレームの開始マーカー、差分、ハフマン符号化

/** Differential sequential DCT. 差分シーケンシャルDCT、ハフマン符号化 */
export let SOF5 = 0xFFC5;
/** Differential progressive DCT. 差分プログレッシブDCT、ハフマン符号化 */
export let SOF6 = 0xFFC6;
/** Differential lossless (sequential). 差分可逆圧縮 (シーケンシャル)、ハフマン符号化 */
export let SOF7 = 0xFFC7;

// Start Of Frame markers, non-differential, arithmetic coding. フーレムの開始マーカー、非差分、算術符号化

/** Reserved for JPEG extensions. 予約済みのJPEG拡張、算術符号化 */
export let JPG = 0xFFC8;
/** Extended sequential DCT. 拡張シーケンシャルDCT、算術符号化 */
export let SOF9 = 0xFFC9;
/** Progressive DCT. プログレッシブDCT、算術符号化 */
export let SOF10 = 0xFFCA;
/** Lossless (sequential). 可逆圧縮 (シーケンシャル)、算術符号化 */
export let SOF11 = 0xFFCB;

// Start Of Frame markers, differential, arithmetic coding. フレームの開始マーカー、差分、算術符号化

/** Differential sequential DCT. 差分シーケンシャルDCT、算術符号化 */
export let SOF13 = 0xFFCD;
/** Differential progressive DCT. 差分プログレッシブDCT、算術符号化 */
export let SOF14 = 0xFFCE;
/** Differential lossless (sequential). 差分可逆圧縮 (シーケンシャル)、算術符号化 */
export let SOF15 = 0xFFCF;

// Huffman table specification. ハフマンテーブルの仕様

/** Define Huffman table(s). ハフマンテーブルの定義 */
export let DHT = 0xFFC4;

// Arithmetic coding conditioning specification. 算術符号化の仕様

/** Define arithmetic coding conditioning(s). 算術符号化条件の定義 */
export let DAC = 0xFFCC;

// Restart interval termination. リスタートインターバル終端

/** Restart with modulo 8 count "n". 0xFFD0 through 0xFFD7 リスタート */
export let RSTn = 0xFFD0;
/** Restart with modulo 8 count "n". 0xFFD0 through 0xFFD7 リスタート */
export let RSTn_end = 0xFFD7;

// Other markers. その他マーカー

/** Start of image. 画像の開始 */
export let SOI = 0xFFD8;
/** End of image. 画像の終了 */
export let EOI = 0xFFD9;
/** Start of scan. スキャンの開始 */
export let SOS = 0xFFDA;
/** Define quantization table(s). 量子化テーブル定義 */
export let DQT = 0xFFDB;
/** Define number of lines. ライン数 */
export let DNL = 0xFFDC;
/** Define restart interval. リスタートインターバルの定義 */
export let DRI = 0xFFDD;
/** Define hierarchical progression. 階層プログレスの定義 */
export let DHP = 0xFFDE;
/** Expand reference components(s). 伸張リファレンスコンポーネント */
export let EXP = 0xFFDF;
/** Reserved for application segments. 0xFFE0 through 0xFFEF 予約済みのアプリケーションセグメント */
export let APPn = 0xFFE0;
/** Reserved for application segments. 0xFFE0 through 0xFFEF 予約済みのアプリケーションセグメント */
export let APPn_end = 0xFFEF;
/** Reserved for JPEG extensions. 0xFFF0 through 0xFFFD 予約済みのJPEG拡張 */
export let JPGn = 0xFFF0;
/** Reserved for JPEG extensions. 0xFFF0 through 0xFFFD 予約済みのJPEG拡張 */
export let JPGn_end = 0xFFFD;
/** Comment. コメント */
export let COM = 0xFFFE;

// Reserved markers. 予約マーカー

/** For temporary private use in arithmetic coding. 算術符号化で使用する一時的領域 */
export let TEM = 0xFF01;
/** Reserved. 0xFF02 through 0xFFBF 予約済み */
export let RESn = 0xFF02;
