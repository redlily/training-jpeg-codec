/**
 * JPEGのエンコーダ・デコーダ用の定義をまとめたクラス
 */
export class JpegCodec {

    //
    // Start Of Frame markers, non-differential, Huffman coding.
    // フレームの開始マーカー、非差分、ハフマン符号化
    //

    /** Baseline DCT. ベースラインDCT */
    static get SOF0() {
        return 0xFFC0;
    }

    /** Extended sequential DCT. 拡張シーケンシャルDCT */
    static get SOF1() {
        return 0xFFC1;
    }

    /** Progressive DCT. プログレッシブDCT */
    static get SOF2() {
        return 0xFFC2;
    }

    /** Lossless (sequential). 可逆圧縮*/
    static get SOF3() {
        return 0xFFC3;
    }

    //
    // Start Of Frame markers, differential, Huffman coding.
    // フレームの開始マーカー、差分、ハフマン符号化
    //

    /** Differential sequential DCT. 差分シーケンシャルDCT */
    static get SOF5() {
        return 0xFFC5;
    }

    /** Differential progressive DCT. 差分プログレッシブDCT */
    static get SOF6() {
        return 0xFFC6;
    }

    /** Differential lossless (sequential). 差分可逆圧縮 (シーケンシャル) */
    static get SOF7() {
        return 0xFFC7;
    }

    //
    // Start Of Frame markers, non-differential, arithmetic coding.
    // フレームの開始マーカー、非差分、算術符号化
    //

    /** Reserved for JPEG extensions. 予約済みのJPEG拡張 */
    static get JPG() {
        return 0xFFC8;
    }

    /** Extended sequential DCT. 拡張シーケンシャルDCT */
    static get SOF9() {
        return 0xFFC9;
    }

    /** Progressive DCT. プログレッシブDCT */
    static get SOF10() {
        return 0xFFCA;
    }

    /** Lossless (sequential). 可逆圧縮 */
    static get SOF11() {
        return 0xFFCB;
    }

    //
    // Start Of Frame markers, differential, arithmetic coding.
    // フレームの開始マーカー、差分、算術符号化
    //

    /** Differential sequential DCT. 差分シーケンシャルDCT */
    static get SOF13() {
        return 0xFFCD;
    }

    /** Differential progressive DCT. 差分プログレッシブDCT */
    static get SOF14() {
        return 0xFFCE;
    }

    /** Differential lossless (sequential). 差分可逆圧縮 */
    static get SOF15() {
        return 0xFFCF;
    }

    //
    // Huffman table specification.
    // ハフマンテーブルの仕様
    //

    /** Define Huffman table(s). ハフマンテーブル */
    static get DHT() {
        return 0xFFC4;
    }

    //
    // Arithmetic coding conditioning specification.
    // 算術符号化コンディショニングの仕様
    //

    /** Define arithmetic coding conditioning(s). 算術符号化コンディショニングの定義 */
    static get DAC() {
        return 0xFFCC;
    }

    //
    // Restart interval termination.
    // リスタートインターバルの終端子
    //

    /** Restart with modulo 8 count "n". 0xFFD0 through 0xFFD7 リスタート */
    static get RSTn() {
        return 0xFFD0;
    }

    /** Restart with modulo 8 count "n". 0xFFD0 through 0xFFD7 リスタート */
    static get RSTn_end() {
        return 0xFFD7;
    }

    //
    // Other markers.
    // その他のマーカー
    //

    /** Start of image. 画像の開始 */
    static get SOI() {
        return 0xFFD8;
    }

    /** End of image. 画像の終了 */
    static get EOI() {
        return 0xFFD9;
    }

    /** Start of scan. スキャンの開始 */
    static get SOS() {
        return 0xFFDA;
    }

    /** Define quantization table(s). 量子化テーブルの定義 */
    static get DQT() {
        return 0xFFDB;
    }

    /** Define number of lines. ライン数の定義 */
    static get DNL() {
        return 0xFFDC;
    }

    /** Define restart interval. リスタートインターバルの定義 */
    static get DRI() {
        return 0xFFDD;
    }

    /** Define hierarchical progression. 階層プログレスの定義 */
    static get DHP() {
        return 0xFFDE;
    }

    /** Expand reference components(s). 伸張リファレンスの定義 */
    static get EXP() {
        return 0xFFDF;
    }

    /** Reserved for application segments. 0xFFE0 through 0xFFEF 予約済みのアプリケーションセグメント */
    static get APPn() {
        return 0xFFE0;
    }

    /** Reserved for application segments. 0xFFE0 through 0xFFEF 予約済みのアプリケーションセグメント */
    static get APPn_end() {
        return 0xFFEF;
    }

    /** Reserved for JPEG extensions. 0xFFF0 through 0xFFFD 予約済みのJPEG拡張 */
    static get JPGn() {
        return 0xFFF0;
    }

    /** Reserved for JPEG extensions. 0xFFF0 through 0xFFFD 予約済みのJPEG拡張 */
    static get JPGn_end() {
        return 0xFFFD;
    }

    /** Comment. コメント */
    static get COM() {
        return 0xFFFE;
    }

    //
    // Reserved markers.
    // 予約済みマーカー
    //

    /** For temporary private use in arithmetic coding. 算術符号化で使用する一時的領域 */
    static get TEM() {
        return 0xFF01;
    }

    /** Reserved. 0xFF02 through 0xFFBF 予約済み */
    static get RESn() {
        return 0xFF02;
    }
}
