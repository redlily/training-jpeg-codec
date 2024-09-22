/**
 * RGBをYCbCrに変換する
 * @param dst 出力先
 * @param dstOff 出力先の配列オフセット
 * @param src 入力元
 * @param srcOff 入力元の配列オフセット
 */
export function rgbToYcbcr(dst, dstOff, src, srcOff) {
    let r = src[srcOff];
    let g = src[srcOff + 1];
    let b = src[srcOff + 2];
    dst[dstOff] = 0.299 * r + 0.587 * g + 0.114 * b; // Y
    dst[dstOff + 1] = -0.1687 * r - 0.3313 * g + 0.5 * b + 128; // Cb
    dst[dstOff + 2] = 0.5 * r - 0.4187 * g - 0.0813 * b + 128; // Cr
}

/**
 * YCbCrをRGBに変換する
 * @param dst 出力先
 * @param dstOff 出力先の配列オフセット
 * @param src 入力元
 * @param srcOff 入力元の配列オフセット
 */
export function ycbcrToRgb(dst, dstOff, src, srcOff) {
    let y = src[srcOff] + 128;
    let cb = src[srcOff + 1] + 128;
    let cr = src[srcOff + 2] + 128;
    dst[dstOff] = y + 1.402 * (cr - 128); // R
    dst[dstOff + 1] = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // G
    dst[dstOff + 2] = y + 1.772 * (cb - 128); // B
}

/**
 * ジグザグシーケンスの配列インデックス
 */
const zigzagSequenceIndices = [
    0, 1, 5, 6, 14, 15, 27, 28,
    2, 4, 7, 13, 16, 26, 29, 42,
    3, 8, 12, 17, 25, 30, 41, 43,
    9, 11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60,
    21, 34, 37, 47, 50, 56, 59, 61,
    35, 36, 48, 49, 57, 58, 62, 63
];

/**
 * 8*8の正方行列をジグザグに並べる
 * @param dst 出力先
 * @param src 入力元
 */
export function orderZigzagSequence(dst, src) {
    for (let i = 0; i < 64; ++i) {
        dst[zigzagSequenceIndices[i]] = src[i];
    }
}

/**
 * ジグザグに並べられた配列を8*8の正方行列に並べなおす
 * @param dst 出力先
 * @param src 入力元
 */
export function reorderZigzagSequence(dst, src) {
    for (let i = 0; i < 64; ++i) {
        dst[i] = src[zigzagSequenceIndices[i]];
    }
}
