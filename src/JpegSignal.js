/**
 * 正の整数に対し2の対数を整数で返す
 */
function log2ui(n) {
    n |= n >>> 1;
    n |= n >>> 2;
    n |= n >>> 4;
    n |= n >>> 8;
    n |= n >>> 16;
    n = (n & 0x55555555) + (n >> 1 & 0x55555555);
    n = (n & 0x33333333) + (n >> 2 & 0x33333333);
    n = (n & 0x0f0f0f0f) + (n >> 4 & 0x0f0f0f0f);
    n = (n & 0x00ff00ff) + (n >> 8 & 0x00ff00ff);
    return (n & 0x0000ffff) + (n >> 16 & 0x0000ffff) - 1;
}

/**
 * 要素を入れ替える
 */
function swap(v, a, b) {
    let t = v[a];
    v[a] = v[b];
    v[b] = t;
}

/**
 * 要素の2次元配列の並び替え
 */
function swapElements2d(n, x) {
    let nl = log2ui(n);
    let nn = 1 << (nl << 1);

    let nh = n >> 1;
    let nh1 = nh + 1;
    let nq = n >> 2;

    let nnh = nh << nl;
    let nnh1 = nh1 << nl;
    let nnq = nq << nl;
    let n2 = n << 1;

    // 横方向
    for (let i = 0, j = 0; i < nh; i += 2) {
        for (let k = 0; k < nn; k += n) {
            let i0 = k + i;
            let j0 = k + j;
            swap(x, i0 + nh, j0 + 1);
            if (i < j) {
                swap(x, i0 + nh1, j0 + nh1);
                swap(x, i0, j0);
            }
        }

        // ビットオーダを反転した変数としてインクリメント
        for (let k = nq; (j ^= k) < k; k >>= 1) {
        }
    }

    // 縦方向
    for (let i = 0, j = 0; i < nnh; i += n2) {
        for (let k = 0; k < n; ++k) {
            swap(x, i + nnh + k, j + n + k);
            if (i < j) {
                swap(x, i + nnh1 + k, j + nnh1 + k);
                swap(x, i + k, j + k);
            }
        }

        // ビットオーダを反転した変数としてインクリメント
        for (let k = nnq; (j ^= k) < k; k >>= 1) {
        }
    }
}

/**
 * 8*8の正方行列の高速離散コサイン変換
 * 中身はJPEG用に調整したB.G.Lee型の高速DCTタイプII
 * @param {uint} n 正方行列の一辺の要素数
 * @param {number[]|Float32Array|Float64Array} x n*nの正方行列
 */
export function dct(n, x) {
    let nl = log2ui(n);
    let nn = n << nl;

    // バタフライ演算
    let rad = Math.PI / (n << 1);
    for (let m = n, mh = m >> 1; 1 < m; m = mh, mh >>= 1) {
        let nm = m << nl;
        for (let i = 0, ni = 0; i < mh; ++i, ni += n) {
            let cs = 2.0 * Math.cos(rad * ((i << 1) + 1));

            // 横方向
            for (let h = 0; h < n; ++h) {
                let off = n * h;
                for (let j = i, k = (m - 1) - i; j < n; j += m, k += m) {
                    let x0 = x[off + j];
                    let x1 = x[off + k];
                    x[off + j] = x0 + x1;
                    x[off + k] = (x0 - x1) * cs;
                }
            }

            // 縦方向
            for (let v = 0; v < n; ++v) {
                for (let j = ni, k = (nm - n) - ni; j < nn; j += nm, k += nm) {
                    let x0 = x[j + v];
                    let x1 = x[k + v];
                    x[j + v] = x0 + x1;
                    x[k + v] = (x0 - x1) * cs;
                }
            }
        }

        rad *= 2.0;
    }

    // データの入れ替え
    swapElements2d(n, x);

    // 差分方程式
    for (let m = n, mh = m >> 1, mq = mh >> 1; 2 < m; m = mh, mh = mq, mq >>= 1) {
        let nm = m << nl;
        let nmh = mh << nl;
        for (let i = mq + mh, ni = n * i; i < m; ++i, ni += n) {
            // 横方向
            for (let h = 0; h < nn; h += n) {
                let xt = (x[h + i] = -x[h + i] - x[h + i - mh]);
                for (let j = i + mh; j < n; j += m) {
                    let k = j + mh;
                    xt = (x[h + j] -= xt);
                    xt = (x[h + k] = -x[h + k] - xt);
                }
            }

            // 縦方向
            for (let v = 0; v < n; ++v) {
                let i0 = ni + v;
                let xt = (x[i0] = -x[i0] - x[ni - nmh + v]);
                for (let j = ni + nmh; j < nn; j += nm) {
                    let k = j + nmh + v;
                    xt = (x[j + v] -= xt);
                    xt = (x[k] = -x[k] - xt);
                }
            }
        }
    }

    // スケーリング
    x[0] *= 0.25 * 0.5;
    for (let i = 1; i < n; ++i) {
        x[i] *= 0.25 * 0.70710678118;
    }
    for (let i = n; i < nn;) {
        x[i++] *= 0.25 * 0.70710678118;
        for (let j = i + n; i < j; ++i) {
            x[i] *= 0.25;
        }
    }
}

/**
 * 8*8正方行列の高速逆離散コサイン変換
 * 中身はJPEG用に調整したB.G.Lee型の高速DCTタイプIII
 * @param {uint} n 正方行列の一辺の要素数
 * @param {number[]|Float32Array|Float64Array} x n*nの正方行列
 */
export function idct(n, x) {
    let nl = log2ui(n);
    let nn = n << nl;

    // 周波数係数のスケーリング
    x[0] *= 0.5;
    for (let i = 1, j = n; i < n; ++i, j += n) {
        x[i] *= 0.70710678118;
        x[j] *= 0.70710678118;
    }

    // 差分方程式
    for (let m = 4, mh = 2, mq = 1; m <= n; mq = mh, mh = m, m <<= 1) {
        let nm = m << nl;
        let nmh = mh << nl;
        for (let i = n - mq, ni = i << nl; i < n; ++i, ni += n) {
            // 横方向
            let j = i;
            while (m < j) {
                let k = j - mh;
                let l = k - mh;
                for (let h = 0; h < nn; h += n) {
                    x[h + j] = -x[h + j] - x[h + k];
                    x[h + k] += x[h + l];
                }
                j = l;
            }
            for (let h = 0; h < nn; h += n) {
                x[h + j] = -x[h + j] - x[h + j - mh];
            }

            // 縦方向
            j = ni;
            while (nm < j) {
                let k = j - nmh;
                let l = k - nmh;
                for (let v = 0; v < n; ++v) {
                    x[j + v] = -x[j + v] - x[k + v];
                    x[k + v] += x[l + v];
                }
                j = l;
            }
            for (let v = 0; v < n; ++v) {
                x[j + v] = -x[j + v] - x[j - nmh + v];
            }
        }
    }

    // データの入れ替え
    swapElements2d(n, x);

    // バタフライ演算
    let rad = Math.PI / 2.0;
    for (let m = 2, mh = 1; m <= n; mh = m, m <<= 1) {
        let nm = m << nl;
        rad *= 0.5;
        for (let i = 0, ni = 0; i < mh; ++i, ni += n) {
            let cs = 2.0 * Math.cos(rad * ((i << 1) + 1));

            // 横方向
            for (let j = i, k = (m - 1) - i; j < n; j += m, k += m) {
                for (let h = 0; h < n; ++h) {
                    let off = h << nl;
                    let x0 = x[off + j];
                    let x1 = x[off + k] / cs;
                    x[off + j] = x0 + x1;
                    x[off + k] = x0 - x1;
                }
            }

            // 縦方向
            for (let j = ni, k = (nm - n) - ni; j < nn; j += nm, k += nm) {
                for (let v = 0; v < n; ++v) {
                    let x0 = x[j + v];
                    let x1 = x[k + v] / cs;
                    x[j + v] = x0 + x1;
                    x[k + v] = x0 - x1;
                }
            }
        }
    }

    // サンプリング値のスケーリング
    for (let i = 0; i < nn; ++i) {
        x[i] *= 0.25;
    }
}
