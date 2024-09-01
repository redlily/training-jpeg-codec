# JPEGを自力ででコードする

## 概要

この記事では静止画像のデータ圧縮のフォーマットの一つであるJPEGをの仕様書 ([ITU T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)) を元にその論理や構造、仕組みを分かりやすくかみ砕いて解説しつつJavaScriptを用いつつも標準APIや外部ライブラリを用いず自力でJPEGデータをデコードする事を目指します。

解説はJPEGのデコードの処理の解説が中心になりますがデコード処理のほうが様々なデータ構成のJPEGデータを取り扱う必要がありエンコードと比べ、よりJPEGの仕様を網羅的に理解する必要あるのでエンコードを中心として解説するより有用な解説が出来ると考えこの記事ではデコードを中心として解説を構成しています。

また、これを読んだ方々がJPEGのエンコーダーを自作しようとした際、デコード処理の逆の手順を踏めば容易にエンコーダーを作成できると考えています。

### この記事での目標

この記事では読まれる方々が次の事が出来るようになる事を目標として掲げます。

- JPEGの基本的な仕組みやアルゴリズム、データ構造を理解する。
- JavaScriptを用いて言語の標準API (Imageクラス等のデコード処理) や外部ライブラリに頼らずJEPGのデコードの実装を行えるようになる。

### 解説内容

この記事で解説する内容の一覧はこちらになります。

- 論理、アルゴリズム
  - 色空間変換
  - 画像分割
  - 周波数変換
  - 量子化、標本化
  - ジグザグシーケンス
  - 転送方法
- データ構造、処理
  - セグメント
  - ビットストリーム
  - ハフマン符号化

## JPEGの概要

まずは世界に広く普及している静止画像のデータ圧縮フォーマットであるJPEGがどういったものかの概要を解説したいと思います。JPEGは Joint Photographic Experts Group の頭文字をとったものになり、日本語訳として写真専門家合同委員となります。

このJPEGは国際標準化機構 (ISO: International Organization for Standardization) 、国際電気標準会議 (IEC: International Electrotechnical Commission) 、国際電気通信連盟 (ITU: International Telecommunication Union) 等の団体にて規格化されています。

圧縮の種類として圧縮後のデータは圧縮前のデータに完全に戻す事が出来ず圧縮率にもよりますが元データと比べ劣化してしまう **非可逆圧縮** の画像フォーマットとなります。ただし多少の劣化を許容することで非常に高い圧縮率を誇るフォーマットとなり画質をある程度保ちながら概ね1/8程度に圧縮することができます。 (可逆圧縮であるPNGは画像の内容によりますが写真なら1/2～2/3程度)

### JPEGのエンコード、デコードの流れ

JPEGデータのエンコード、デコードの大まかな流れとしてはエンコード時は画像全体に対して色空間の変換を行います。そして、その画像を8×8のサイズの画像に分割します。それら分割された、それぞれの画像に対し周波数変換 (離散コサイン変換) を行い、その後、その周波数データに対し量子化を行います。

ここまでで画像データに対する変換処理が完了します。そのデータに対し転送順を決定します。そして、そのデータ列に対しエントロピー符号化 (ハフマン符号化) 行います。その後、符号化されたデータと合わせメタデータを仕様に沿って構造化を行い出力を行えばJPEGデータのエンコードは完了となります。

デコードに関してはこれまでの手順の逆順を行えばJPEGデータを画像に戻す事が出来ます。

[画像]

1. 色空間変換 (RGBからYCbCrへの変換)
2. 画像分割
3. 周波数変換 (離散コサイン変換)
4. 量子化
5. データ転送順処理
6. エントロピー符号化 (ハフマン符号化)

デコード

[画像]

1. エントロピー復号化 (ハフマン復号化)
2. データ受信順処理
3. 標本化
4. 周波数変換 (逆離散コサイン変換)
5. 画像結合
6. 色空間変換 (YCbCrからRGBへの変換)

### 色空間変換

コンピュータ上で色空間を扱う場合、光の三原色である赤 (R) 、緑 (G) 、青 (B) の3色の色を混ぜ合わせる事により任意の色を表現する加算混合であるRGBカラーモデルやPhotoshopなどの印刷を前提としたツールの場合はシアン (C)、マゼンタ (M)、イエロー (Y)、ブラック (K) の4色の色を混ぜ合わせる事により任意の色を表現する減法混合であるCMYKカラーモデルが存在しますがJPEGではこれらの形式とは異なる色空間を使用します。

[画像]

JPEGではYCbCrと呼ばれる色空間が使用されています。要素としては輝度 (Y) 、Cb 青から輝度を差し引いた値 (B - Y) に定数を掛けた値、Cr 赤から輝度を差し引いた値 (R - Y) に定数を掛けた値で任意の色を表現するカラーモデルとなります。

[画像]

コンピュータ上で使用される画像データの色空間の形式は概ねRGBカラーモデルになるので下記にRGBからYCbCrへの変換とYCbCrからRGBへの変換方法を下記に示します。

RGBからYCbCrに変換

[画像]

```math
\begin{aligned}
Y &= 0.299 R + 0.587 G + 0.114 B \\
Cb &= - 0.1687 R - 0.3313 G + 0.5 B + 128 \\
Cr &= 0.5 R - 0.4187 G - 0.0813 B + 128
\end{aligned}
```

```JavaScript
function rgbToYcbcr(dst, dstOff, src, srcOff) {
    let r = src[srcOff];
    let g = src[srcOff + 1];
    let b = src[srcOff + 2];
    dst[dstOff] = 0.299 * r + 0.587 * g + 0.114 * b; // Y
    dst[dstOff + 1] = -0.1687 * r - 0.3313 * g + 0.5 * b + 128; // Cb
    dst[dstOff + 2] = 0.5 * r - 0.4187 * g - 0.0813 * b + 128; // Cr
}
```

YCbCrからRGBに変換

[画像]

```math
\begin{aligned}
R &= Y + 1.402 (Cr - 128) \\
G &= Y - 0.34414 (Cb - 128) - 0.71414 (Cr - 128) \\
B &= Y + 1.772 (Cb - 128)
\end{aligned}
```

```JavaScript
function ycbcrToRgb(dst, dstOff, src, srcOff) {
    let y = src[srcOff] + 128;
    let cb = src[srcOff + 1] + 128;
    let cr = src[srcOff + 2] + 128;
    dst[dstOff] = y + 1.402 * (cr - 128); // R
    dst[dstOff + 1] = y - 0.34414 * (cb - 128) - 0.71414 * (cr - 128); // G
    dst[dstOff + 2] = y + 1.772 * (cb - 128); // B
}
```

#### 色成分間引きによる容量削減

### 画像分割

#### 最小符号化単位 : MCU (Minimum Coded Unit)

### 周波数変換

#### 離散コサイン変換

#### 2次元の離散コサイン変換

#### 離散コサイン変換の高速化











### ビットデータストリームの実装

JPEGのデータはセグメントのメタデータは基本的に16bit, 8bit単位で読み書きを行います。しかしエントロピー符号化されたデータに関してはデータ容量の効率を重視したものになりビット単位でのデータアクセスが求められます。

そこでデータ解析に先立ってJPEGのビットデータストリームの解説を行いたいと思います。

## JPEGのエンコード、デコードに必要なアルゴリズム

この章ではJPEGのエンコード、デコードに必要な基礎的なアルゴリズムの実装に関する解説を行います。また具体的なJPEGのデータ構造に根差したエンコード、デコードの処理方法に関しては次の章で解説を行います。

解説する項目としては色空間変換、画像分割、周波数解析、






### 色空間変換

JPEGでは8

RGBからYCbCrへの変換

```JavaScript

```

```JavaScript
```






### 画像分割

#### 特定の色成分の引き延ばし

### 量子化

量子化

```math
Sq_{vu} = round \left( \frac{S_{vu}}{Q_{vu}} \right)
```

標本化

```math
R_{vu} = Sq_{vu} × Q_{vu}
```

### 直流成分の差分エンコード

```math
DIFF = DC_{i} - PRED
```

### ジグザグシーケンス

### 周波数変換

#### JPEGにおける離散コサイン変換

JPEGでは8×8の要素に対して離散コサイン変換を行うことになりそれに必要な具体的な数式と実装は下記の通りになります。

離散コサイン変換 (8×8の2次元版)

式：

```math
S_{vu} = \frac{1}{4} \, C_u \, C_v \, \sum_{x=0}^7 \, \sum_{y=0}^7 \, s_{yx} \, cos \frac{(2x+1)uπ}{16} \, cos \frac{(2y+1)vπ}{16}
```

実装：

```JavaScript
function dct(S) {
    // TODO
}
```

逆離散コサイン変換 (8×8の2次元版)

式：

```math
s_{yx} = \frac{1}{4} \, \sum_{u=0}^{7} \, \sum_{v=0}^{7} \, C_u \, C_v S_{vu} \, cos \frac{(2x+1)uπ}{16} \, cos \frac{(2y+1)vπ}{16}
```

実装：

```JavaScript
function idct(s) {
    // TODO
}
```

#### 離散コサイン変換の高速化

JPEGの仕様書に書かれている離散コサイン変換をそのまま実行すると低速なので下記のBYEONG GI LEE氏考案の高速化アルゴリズムを導入します。

[A New Algorithm to Compute the Discrete Cosine Transform - BYEONG GI LEE](https://www.nayuki.io/res/fast-discrete-cosine-transform-algorithms/lee-new-algo-discrete-cosine-transform.pdf)

こちらのアルゴリズムの概要としてはサンプル数、NにたいしてO(N^2)のオーダーで必要な計算量をデータの前処理と後処理を行うことで半分のサンプル数の離散コサイン変換を二回行うことでO(2(N-1)^2)のオーダーの計算量に抑えることができます。さらにこれを再帰的に行うことで最終的にO(N log N)のオーダーまで計算量を削減できるアルゴリズムとなっています。

画像 -> DCTの再帰処理の様子

またこちらのアルゴリズムは1次のサンプルに対しての離散コサイン変換なのでそれを2次元のサンプルに適用できるように拡張を行います。具体的な実装に関しては長くなるのでサンプルプログラムのほうをご参照ください。

リンク -> サンプルプログラム、2次元版の離散コサイン変換ユーティリティ

### ハフマン符号化

### データの転送準

#### ベースライン

#### プログレッシブ

##### シーケンシャル

##### 逐次近似 (Successive Approximation)

まずはプログレッシブ転送の一つである逐次近似 (Successive Approximation) ですがまともな和訳が出てこないのSuccessive Approximationの訳が逐次近似で正しいかどうかわからないということをここで断っておきます。 (汗) 、有識者がいらっしゃいましたらご指摘頂けたら幸いです。

## JPEG小話

ここで箸休めとしてあまり知られていないJPEGの仕様に関してあまり知られていないものを仕様書から読み解きたいと思います。

### 実は仕様としては存在する可逆圧縮JPEG

一般的には非可逆圧縮の形式として認知されているJPEGですが、こちら筆者が[JPEGの仕様書](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)を読んでいると仕様として可逆圧縮のオプションがあるらしいです。

下記、仕様書の引用

```text
4.2 Lossy and lossless compression

This Specification specifies two classes of encoding and decoding processes, lossy and lossless processes. Those based on
the discrete cosine transform (DCT) are lossy, thereby allowing substantial compression to be achieved while producing a
reconstructed image with high visual fidelity to the encoder’s source image.

...
```

要約：JPEGには非可逆、可逆圧縮の2種類の仕様が用意されていて離散コサイン変換 (DCT) をベースとして圧縮を行います。

当記事では可逆圧縮まで取り扱うと内容が重くなるので解説やサンプルプログラムでの実装は省略させて頂きたいと思います。

## JPEGのデータ構造

この章では前々章で解説したJPEGのエンコード、デコードに必要な基礎的なアルゴリズムの解説を元に、よりJPEGのデータ構造に根差したのエンコード、デコードに必要な具体的な構造や実装に言及した解説を行います。

### 基本的なデータ構造

### JPEGデコーダーの実装



#### ジグザグシーケンスユーティリティ

```JavaScript
/** ジグザグシーケンスの配列インデックス */
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

/** 8*8の正方行列をジグザグに並べる */
export function orderZigzagSequence(dst, src) {
    for (let i = 0; i < 64; ++i) {
        dst[zigzagSequenceIndices[i]] = src[i];
    }
}

/** ジグザグに並べられた配列を8*8の正方行列に並べなおす */
export function reorderZigzagSequence(dst, src) {
    for (let i = 0; i < 64; ++i) {
        dst[i] = src[zigzagSequenceIndices[i]];
    }
}
```

#### 周波数変換ユーティリティ

```JavaScript
/**
 * 8*8の正方行列の高速離散コサイン変換
 * 中身はJPEG用に調整したB.G.Lee型の高速DCTタイプII
 * @oaran n 正方行列の一辺の要素数
 * @param x n*nの正方行列
 */
export function dct(n, x = 8) { ... }

/**
 * 8*8正方行列の高速逆離散コサイン変換
 * 中身はJPEG用に調整したB.G.Lee型の高速DCTタイプIII
 * @oaran n 正方行列の一辺の要素数
 * @param x n*nの正方行列
 */
export function idct(n, x = 8) { ... }
```

#### データストリームクラス

```JavaScript
/**
 * JPEGのデータ読み込み用のデータストリームクラス
 */
export class JpegReadStream {

    /** コンストラクタ */
    constructor(buffer, offset = 0) {}
    
    /** ストリームのカーソル位置を取得する */
    get position() {}

    /** ストリームのカーソル位置を設定する */
    set position(position) {}

    /** 保存しているビット配列を取得する */
    get remainBits() {}

    /** 保存しているビット配列のビット数を取得する */
    get remainBitsCount() {}

    /** 内部に保存している未出力のビット配列を取得する */
    get remainBits() {}

    /** 内部に保存している未出力のビット配列のビット数を取得する */
    get remainBitsCount() {}

    /** ストリームを指定するbyte数スキップする */
    skip(size) {}

    /** 符号なしの8bitの整数を読み込む */
    readUint8() {}

    /** 符号なしの16bitの整数を読み込む */
    readUint16() {}

    /** マーカーを読み込む */
    readMaker() {}

    /** 符号なしの8bitの整数の配列を読み込む */
    readUint8Array(dst, off, len) {}

    /** 指定ビット数のデータを読み込む */
    readBits(num) {}

    /** 内部で未出力のビット配列のステータスをリセットする */
    resetRemainBits() {}
}
```

#### マーカー定義

```JavaScript
/**
 * JPEGのマーカーの定義をまとめたクラス
 */
export class JpegMarker {

    // フレームの開始マーカー、非差分、ハフマン符号化

    /** ベースラインDCT */
    static get SOF0() { return 0xFFC0; }

    /** 拡張シーケンシャルDCT */
    static get SOF1() { return 0xFFC1; }

    /** プログレッシブDCT */
    static get SOF2() { return 0xFFC2; }

    /** 可逆圧縮*/
    static get SOF3() { return 0xFFC3; }

    // フレームの開始マーカー、差分、ハフマン符号化

    /** 差分シーケンシャルDCT */
    static get SOF5() { return 0xFFC5; }

    /** 差分プログレッシブDCT */
    static get SOF6() { return 0xFFC6; }

    /** 差分可逆圧縮 (シーケンシャル) */
    static get SOF7() { return 0xFFC7; }

    // フレームの開始マーカー、非差分、算術符号化

    /** 予約済みのJPEG拡張 */
    static get JPG() { return 0xFFC8; }

    /** 拡張シーケンシャルDCT */
    static get SOF9() { return 0xFFC9; }

    /** プログレッシブDCT */
    static get SOF10() { return 0xFFCA; }

    /** 可逆圧縮 */
    static get SOF11() { return 0xFFCB; }

    // フレームの開始マーカー、差分、算術符号化

    /** 差分シーケンシャルDCT */
    static get SOF13() { return 0xFFCD; }

    /** 差分プログレッシブDCT */
    static get SOF14() {
        return 0xFFCE;
    }

    /** 差分可逆圧縮 */
    static get SOF15() {
        return 0xFFCF;
    }

    // ハフマンテーブルの仕様

    /** ハフマンテーブル */
    static get DHT() { return 0xFFC4; }

    // 算術符号化コンディショニングの仕様

    /** 算術符号化コンディショニングの定義 */
    static get DAC() {
        return 0xFFCC;
    }

    // リスタートインターバルの終端子

    /** リスタート */
    static get RSTn() { return 0xFFD0; }

    /** リスタート */
    static get RSTn_end() { return 0xFFD7; }

    // その他のマーカー

    /** 画像の開始 */
    static get SOI() {
        return 0xFFD8;
    }

    /** 画像の終了 */
    static get EOI() { return 0xFFD9; }

    /** スキャンの開始 */
    static get SOS() { return 0xFFDA; }

    /** 量子化テーブルの定義 */
    static get DQT() { return 0xFFDB; }

    /** ライン数の定義 */
    static get DNL() { return 0xFFDC; }

    /** リスタートインターバルの定義 */
    static get DRI() { return 0xFFDD; }

    /** 階層プログレスの定義 */
    static get DHP() { return 0xFFDE; }

    /** 伸張リファレンスの定義 */
    static get EXP() { return 0xFFDF; }

    /** 予約済みのアプリケーションセグメント */
    static get APPn() { return 0xFFE0; }

    /** 予約済みのアプリケーションセグメント */
    static get APPn_end() { return 0xFFEF; }

    /** 予約済みのJPEG拡張 */
    static get JPGn() { return 0xFFF0; }

    /** 予約済みのJPEG拡張 */
    static get JPGn_end() { return 0xFFFD; }

    /** コメント */
    static get COM() { return 0xFFFE; }

    // 予約済みマーカー

    /** 算術符号化で使用する一時的領域 */
    static get TEM() { return 0xFF01; }

    /** 予約済み */
    static get RESn() { return 0xFF02; }
}

```

### ジグザグシーケンス (Zig-zag sequence)

### サンプル精度 (Sample precision)

### マルチコンポーネントコントロール (Multiple-compoment consorol)

### インターリーブマルチコンポーネント (Interleaving multiple components)

### 最小コード単位 (MCU: Minimum coded unit)

### 直流成分差分エンコード (Differential DC encoding)

### ハイレベルシンタックス

#### スタートイメージマーカー (SOI)

#### エンドイメージマーカー (EOI)

#### リスターティング (RSTm)

### フレームヘッダーシンタックス

|パラメータ|サイズ (bit)|ベースライン|拡張シーケンシャル|プログレッシブ|説明|
|:--------|:----------|:--|:--|:--|:--|
|Lf|16|8 + 3 × Nf|〃|〃|フレームヘッダー長|
|P|8|8|8,12|8,12|サンプル精度 (ビット数)|
|Y|16|0～65535|〃|〃|ライン数 (縦のサイズ)|
|X|16|1～65535|〃|〃|ラインあたりのサンプル数 (横のサイズ)|
|Nf|8|1～255|1～255|1～4|フレームのコンポーネント数|
|C_i|8|0～255|〃|〃|コンポーネント識別子|
|H_i|4|1～4|〃|〃|水平方向のサンプリング|
|V_i|4|1～4|〃|〃|垂直方向のサンプリング|
|Tq_i|8|0～3|〃|〃|量子化テーブルセレクター|

### フレーム開始セグメント

### 


### スキャン開始セグメント

### 量子化テーブル定義セグメント

### ハフマンテーブル定義セグメント

### 算術符号化条件定義セグメント

### リスタートインターバルセグメント

### コメントセグメント

### アプリケーションデータセグメント

### ライン数定義セグメント

### 拡張リファレンスコンポーネントセグメント

### エンドマーカー

### 予約済み、未使用セグメント

#### SOFマーカー

- SOF3
  - ハフマン符号化を用いた可逆圧縮用のセグメント定義です。
- SOF9
  - 算術演算符号化を用いた非可逆圧縮形式で且つシーケンシャルDCTでのデーター転送に対応したセグメント定義です。算術演算符号化は仕様上、定義はされているものの特許の問題があるので未実装のセグメントとなります。
- SOF10
  - 算術演算符号化を用いた非可逆圧縮形式で且つプログレッシブDCTでのデーター転送に対応したセグメント定義です。算術演算符号化は仕様上、定義はされているものの特許の問題があるので未実装のセグメントとなります。
- SOF11
  - 算術演算符号化んを用いた可逆圧縮用のセグメントセグメント定義です。算術演算符号化は仕様上、定義はされているものの特許の問題があるので未実装のセグメントとなります。

## サンプルプログラム

## あとがき

## 参考

- [JPEG - Wikipedia](https://ja.wikipedia.org/wiki/JPEG)
- [ITU T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)
- [JPEG File Interchange Format Version 1.02](https://www.w3.org/Graphics/JPEG/jfif3.pdf)
- [離散コサイン変換 - Wikipedia](https://ja.wikipedia.org/wiki/%E9%9B%A2%E6%95%A3%E3%82%B3%E3%82%B5%E3%82%A4%E3%83%B3%E5%A4%89%E6%8F%9B)
