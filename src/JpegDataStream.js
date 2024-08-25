/**
 * データストリーム用の例外クラス
 */
class JpegDataStreamError extends Error {

    /** コンストラクタ */
    constructor(message) {
        super(message);
    }
}

/**
 * 書き込み用のデータストリームクラス
 */
export class JpegWriteStream {
    // TODO
}

/**
 * JPEGのデータ読み込み用のデータストリームクラス
 */
export class JpegReadStream {

    /** コンストラクタ */
    constructor(buffer, offset = 0) {
        this._view = new DataView(buffer, offset);
        this._off = 0;
        this._remainBits = 0;
        this._remainBitsCount = 0;
    }

    /** ストリームのカーソル位置を取得する */
    get position() {
        return this._off;
    }

    /** ストリームのカーソル位置を設定する */
    set position(position) {
        this._off = position;
    }

    /** 内部に保存している未出力のビット配列を取得する */
    get remainBits() {
        return this._remainBits;
    }

    /** 内部に保存している未出力のビット配列のビット数を取得する */
    get remainBitsCount() {
        return this._remainBitsCount;
    }

    /** ストリームを指定するbyte数スキップする */
    skip(size) {
        this._off += size;
    }

    /** 符号なしの8bitの整数を読み込む */
    readUint8() {
        let value = this._view.getUint8(this._off);
        this._off += 1;
        return value;
    }

    /** 符号なしの16bitの整数を読み込む */
    readUint16() {
        let value = this._view.getUint16(this._off);
        this._off += 2;
        return value;
    }

    /** マーカーを読み込む */
    readMaker() {
        let value = this._view.getUint16(this._off);
        this._off += 2;
        return value;
    }

    /** 符号なしの8bitの整数の配列を読み込む */
    readUint8Array(dst, off, len) {
        len = Math.min(len, this._view.byteLength - this._off);
        for (let i = 0; i < len; ++i) {
            dst[off + i] = this._view.getUint8(this._off);
            this._off += 1;
        }
        return len;
    }

    /** 指定ビット数のデータを読み込む */
    readBits(num) {
        // 0bitの場合
        if (num == 0) {
            return 0;
        }

        // 読み込み要求されているビット数が内部保留のビット数より小さい場合
        if (num <= this._remainBitsCount) {
            let result = this._remainBits >>> (this._remainBitsCount - num);
            this._remainBitsCount -= num;
            this._remainBits &= 0xff >>> (8 - this._remainBitsCount);
            return result;
        }

        // 読み込み要求されているビット数が内部保留のビット数より大きい場合
        let result = this._remainBits;
        num -= this._remainBitsCount;
        this._remainBits = 0;
        this._remainBitsCount = 0;
        while (num >= 8) {
            let bits = this.readUint8();
            if (bits == 0xff) {
                let next = this.readUint8();
                if (next != 0) {
                    throw new JpegDataStreamError("This data stream has been broken.");
                }
            }
            result = (result << 8) | bits;
            num -= 8;
        }
        if (num > 0) {
            this._remainBits = this.readUint8();
            if (this._remainBits == 0xff) {
                let next = this.readUint8();
                if (next != 0) {
                    throw new JpegDataStreamError("This data stream has been broken.");
                }
            }
            this._remainBitsCount = 8 - num;
            result = (result << num) | (this._remainBits >>> this._remainBitsCount);
            this._remainBits &= 0xff >>> (8 - this._remainBitsCount);
        }
        return result;
    }

    /** 内部の未出力のビット配列のステータスをリセットする */
    resetRemainBits() {
        this._remainBits = 0;
        this._remainBitsCount = 0;
    }
}
