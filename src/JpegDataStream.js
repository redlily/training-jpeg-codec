/**
 * データストリーム用の例外クラス
 */
class JpegDataStreamError extends Error {
    /**
     * コンストラクタ
     */
    constructor(message) {
        super(message);
    }
}

/**
 * JPEGのデータ書き込み用のデータストリームクラス
 */
export class JpegWriteStream {
    // TODO
}

/**
 * JPEGのデータ読み込み用のデータストリームクラス
 */
export class JpegReadStream {
    /**
     * コンストラクタ
     * @param {ArrayBuffer} buffer データ
     * @param {uint?} offset データオフセット
     * @param {uint?} length データ長
     */
    constructor(buffer, offset = undefined, length = undefined) {
        this._view = new DataView(buffer, offset, length);
        this._off = 0;
        this._remainBits = 0;
        this._remainBitsCount = 0;
    }

    /**
     * ストリームのカーソル位置を取得する
     * @return {uint}
     */
    get position() {
        return this._off;
    }

    /**
     * ストリームのカーソル位置を設定する
     * @param {uint} position
     */
    set position(position) {
        this._off = position;
    }

    /**
     * 内部に保存している未出力のビット配列を取得する
     * @return {uint}
     */
    get remainBits() {
        return this._remainBits;
    }

    /**
     * 内部に保存している未出力のビット配列のビット数を取得する
     * @return {uint}
     */
    get remainBitsCount() {
        return this._remainBitsCount;
    }

    /**
     * ストリームを指定するバイト数スキップする
     * @param {uint} size スキップするバイト数
     */
    skip(size) {
        this._off += size;
    }

    /**
     * 符号なしの8bitの整数を読み込む
     * @return {uint} 読み込んだデータ
     */
    readUint8() {
        let value = this._view.getUint8(this._off);
        this._off += 1;
        return value;
    }

    /**
     * 符号なしの16bitの整数を読み込む
     * @return {uint} 読み込んだデータ
     */
    readUint16() {
        let value = this._view.getUint16(this._off);
        this._off += 2;
        return value;
    }

    /**
     * 符号なしの8bitの整数の配列を読み込む
     * @param {uint[]} dst 出力先
     * @param {uint} off 出力先の配列オフセット
     * @param {uint} len 読み込み長
     */
    readUint8Array(dst, off, len) {
        len = Math.min(len, this._view.byteLength - this._off);
        for (let i = 0; i < len; ++i) {
            dst[off + i] = this._view.getUint8(this._off);
            this._off += 1;
        }
        return len;
    }

    /**
     * 指定長のビット配列を読み込む
     * @param {uint} len 読み込み長
     * @return {uint} 読み込んだデータ
     */
    readBits(len) {
        // 0bitの場合
        if (len === 0) {
            return 0;
        }

        // 読み込み要求されているビット数が内部保留のビット数より小さい場合
        if (len <= this._remainBitsCount) {
            let result = this._remainBits >>> (this._remainBitsCount - len);
            this._remainBitsCount -= len;
            this._remainBits &= 0xff >>> (8 - this._remainBitsCount);
            return result;
        }

        // 読み込み要求されているビット数が内部保留のビット数より大きい場合
        let result = this._remainBits;
        len -= this._remainBitsCount;
        this._remainBits = 0;
        this._remainBitsCount = 0;
        while (len >= 8) {
            let bits = this._readUnit8ForReadingBits();
            result = (result << 8) | bits;
            len -= 8;
        }
        if (len > 0) {
            this._remainBits = this._readUnit8ForReadingBits();
            this._remainBitsCount = 8 - len;
            result = (result << len) | (this._remainBits >>> this._remainBitsCount);
            this._remainBits &= 0xff >>> (8 - this._remainBitsCount);
        }
        return result;
    }

    /**
     * ビットストリーム用に符号なし8bitの整数を読み込み
     */
    _readUnit8ForReadingBits() {
        let bits = this.readUint8();
        if (bits === 0xff) {
            // ビットストリームは読み込んだバイトの値が FF の場合は 00 である必要がある
            let next = this.readUint8();
            if (next !== 0) {
                throw new JpegDataStreamError("This data stream has been broken.");
            }
        }
        return bits;
    }

    /**
     * 内部で保留しているビット配列を破棄する
     */
    resetRemainBits() {
        this._remainBits = 0;
        this._remainBitsCount = 0;
    }
}
