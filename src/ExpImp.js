/**
 * 離散コサイン変換タイプ2、高速化なし
 */
function dctII(x, N) {
    let X = new Float32Array(N);
    for (let k = 0; k < N; ++k) {
        let sum = 0;
        for (let n = 0; n < N; ++n) {
            sum += x[n] * Math.cos(Math.PI / N * (n + 1 / 2) * k);
        }
        X[k] = sum;
    }
    return X;
}

/**
 * 離散コサイン変換タイプ3、高速化なし
 */
function dctIII(x, N) {
    let X = new Float32Array(N);
    for (let k = 0; k < N; ++k) {
        let sum = 1 / 2 * x[0];
        for (let n = 1; n < N; ++n) {
            sum += x[n] * Math.cos(Math.PI / N * (k + 1 / 2) * n);
        }
        X[k] = sum;
    }
    return X;
}

/**
 * JPEG用の2次元離散コサイン変換
 */
export function dct2D(N, s, S) {
    for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
            let sum = 0;
            for (let x = 0; x < N; x++) {
                for (let y = 0; y < N; y++) {
                    sum += s[x + N * y] *
                        Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
                        Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
                }
            }
            S[u + N * v] = 1 / 4 *
                (u === 0 ? 1 / Math.SQRT2 : 1) *
                (v === 0 ? 1 / Math.SQRT2 : 1) *
                sum;
        }
    }
    return S;
}

/**
 * JPEG用の2次元逆離散コサイン変換
 */
export function idct2D(N, S, s) {
    for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
            let sum = 0;
            for (let u = 0; u < N; u++) {
                for (let v = 0; v < N; v++) {
                    sum += (u === 0 ? 1 / Math.SQRT2 : 1) *
                        (v === 0 ? 1 / Math.SQRT2 : 1) *
                        S[u + N * v] *
                        Math.cos((2 * x + 1) * u * Math.PI / (2 * N)) *
                        Math.cos((2 * y + 1) * v * Math.PI / (2 * N));
                }
            }
            s[x + N * y] = 1 / 4 * sum;
        }
    }
    return s;
}
