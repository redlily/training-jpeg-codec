/**
 * JPEGのマーカーの定義をまとめたクラス
 */
export class JpegMarker {
    //
    // 画像の開始/終了マーカー
    //

    /** Start of image. 画像の開始 */
    static get SOI() {
        return 0xFFD8;
    }

    /** End of image. 画像の終了 */
    static get EOI() {
        return 0xFFD9;
    }

    //
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
    // エントロピー符号化
    //

    /** Define Huffman table(s). ハフマンテーブル */
    static get DHT() {
        return 0xFFC4;
    }

    /** Define arithmetic coding conditioning(s). 算術符号化コンディショニングの定義 */
    static get DAC() {
        return 0xFFCC;
    }

    //
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
    // テーブル/その他のマーカー
    //

    /** Start of scan. スキャンの開始 */
    static get SOS() {
        return 0xFFDA;
    }

    /** Define number of lines. ライン数 */
    static get DNL() {
        return 0xFFDC;
    }

    /** Expand reference components(s). 伸張リファレンスコンポーネント */
    static get EXP() {
        return 0xFFDF;
    }

    /** Define quantization table(s). 量子化テーブル定義 */
    static get DQT() {
        return 0xFFDB;
    }

    /** Define hierarchical progression. 階層プログレス定義 */
    static get DHP() {
        return 0xFFDE;
    }

    /** Define restart interval. リスタートインターバルの定義 */
    static get DRI() {
        return 0xFFDD;
    }

    /** Comment. コメント */
    static get COM() {
        return 0xFFFE;
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

    //
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
