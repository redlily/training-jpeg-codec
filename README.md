# 自力でJPEGをJavaScriptでコードする

## 概要

この記事では静止画像のデータ圧縮フォーマットの一つで有るJPEGの仕様書 ([ITU T.81]((https://www.w3.org/Graphics/JPEG/itu-t81.pdf))) を参考にその論理やアルゴリズム、そしてデータ構造をなるだけ噛み砕いて解説していきたいと思います。

また、この記事では **JavaScirptを用いて標準APIや外部ライブラリに頼ることなくJPEGファイルをデコードするサンプルプログラム** を用意していますので、そちらを用いた具体的な実装に関しても解説を行います。

解説内容に関してはデコード処理を中心に行っています。これはデコーダはエンコーダと比べJPEGの仕様を全体的に把握する必要があり、より深く仕様を学べるのではないかとの考えがあります。

### JPEGの概要

まずはJPEGの概要に関して軽くおさらいしたいと思います。

JPEGは世間で広く普及している静止画像のデータ圧縮フォーマットとなっており、名前の由来は **Joint Photographic Experts Group** の頭文字を取ったものになります。

このJPEGの仕様は **国際標準化機構 (ISO: International Organization for Standardization)** 、 **国際電気標準会議 (IEC: International Electrotechnical Commission)** 、**国際電気通信連盟 (ITU: International Telecommunication Union)** 等の複数の団体にて規格化されています。

このJPEGのデータ圧縮技術には人間の生理学的な特性を利用して人の目には感じにくい情報を削り圧縮前のデータには完全に戻らないものの大きく圧縮率を向上させる **非可逆圧縮** と、あまり知られていないのですが圧縮前のデータに完全に戻すことの出来る **非可逆圧縮** の2つのモードがサポートされています。

### この記事での目標

この記事では読まれる方が次の事が出来るようになる事を目標として記事を構成しています。


- JPEGの基本的な論理やアルゴリズム、データ構造等の仕様を理解する。
- 任意のプログラミング言語を用い、自らの実装により、言語標準のAPIや外部ライブラリに頼ることなくJPEGのデコーダの実装を行えるようになる。

### お品書き

この記事で解説する内容は下記の一覧となります。

- 論理、アルゴリズム
  - エンコード、デコードの全体的な流れ
  - 色空間変換 (RGB ⇔ YCbCrの相互変換)
  - 色彩情報の間引き
  - 画像分割 (Unit, MCU)
  - 周波数変換 (2次元離散コサイン変換)
  - 直流差分変換
  - 量子化
  - データの転送方法 (ベースライン、プログレッシブ)
  - 符号化 (ハフマン量子化)
- データ構造、処理
  - セグメント
  - 量子化テーブル
  - ハフマン符号化テーブル
  - ビットストリーム
  - 画像化

また、この記事では下記のJPEGの仕様に関しては解説をスキップします。

- 可逆圧縮
  - 差分パルス符号変調とエントロピー符号化による簡素な圧縮アルゴリズムであり、またJPEGの一般的な圧縮モードでないため。
- 算術符号化
  - 過去の特許問題により算術符号化によるエントロピー符号化を実装しているエンコーダ、デコーダが少なくハフマン符号化が標準となりほとんど使用されていないため。

## 論理、アルゴリズム

この章ではJPEGのエンコーダ、デコーダの具体的な実装というよりかはJPEGで使用されている論理やアルゴリズムを中心に解説を行います。

### JPEGのエンコード、デコードの流れ

JPEGのエンコードとデコードの大まかな流れを説明します。



まずエンコードは画像全体に対しユニットと呼ばれる8️×8の処理単位に画像を分割します。そして、その分割された画像それぞれに対し、色空間変換 (RGBからYCbCrへの変換) 、周波数変換 (離散コサイン変換) 、量子化と前処理を行い、それらのデータに対しエントロピー符号化 (ハフマン符号化) を行いデータ化を行います。

まずはエンコード時は画像全体対し **ユニット (Unit) 、最小符号化単位 (MCU) 単位に画像を分割** して **色空間変換 (RGBからYCbCrへの変換)** を行います。そして圧縮率によっては、ここで **色彩情報の間引き (Cb, Cr成分の間引き)** を行います。そして、その分割された画像それぞれに対し **周波数変換 (2次元離散コサイン変換)** 、 **量子化** を施し **エントロピー符号化** を行いデータ化します。

そしてデコード時はデータに対し **エントロピー復号化** を行い、 **再量子化** 、 **周波数変換 (2次元逆コサイン変換)** を施し、そして必要に応じて、ここで **色彩情報の引伸し (Cb, Cr成分の引伸し)** を行い **ユニット (Unit) 、最小符号化単位 (MCU) 単位の画像を結合** して1枚の画像に戻します。

#### エンコード

<img src="./assets/エンコードの大まかな流れ.png">

1. 画像分割 (Unit単位、またはMCU単位)
1. 色空間変換 (RGBからYCbCrへの変換) 、色彩情報の間引き
1. 周波数解析 (離散コサイン変換)
1. 量子化
1. エントロピー符号化 (ハフマン符号化)

#### デコード

<img src="./assets/デコードの大まかな流れ.png">

1. エントロピー復号化 (ハフマン復号化)
1. 再量子化
1. 周波数解析 (逆離散コサイン変換)
1. 色彩情報の引伸し、色空間変換 (YCbCrからRGBへの変換)
1. 画像結合 (Unit単位、またはMCU単位)

### 色空間変換

コンピュータ上では色情報を扱う場合、**赤 (R) 、緑 (G) 、青 (B)** の3つの色を任意の割合で加算合成することで任意の色を表現できる **RGBカラーモデル** と呼ばれる色空間が使用されています。他にも印刷物を前提として色情報を扱う場合、 **シアン (C) 、マゼンタ (M) 、イエロー (Y) 、ブラック (K)** の4つの色を任意の割合で混ぜて任意の色を表現できる **CMYKカラーモデル** と呼ばれる色空間が使用されています。

<img src="./assets/RGB, CMYKの分解.png">

JPEGでは、これらのものとは異なるカラーモデルが使用されています。それは **YCbCr** と呼ばれるカラーモデルが使用されていて、これは **輝度 (Y) 、青から輝度をを差し引いた値 (B - Y) に定数を掛けた値 (Cb) 、赤から輝度を差し引いた値 (R - Y) に定数を掛けた値 (Cr)** の3つの要素を合成することで任意の色を表現できる色空間が採用されています。

<img src="./assets/YCbCrの分解.png">

JPEGでは何故、YCbCrカラーモデルが採用されているのかというと人の目には **輝度 (Y) の変化には敏感で色彩 (Cb, Cr) の変化には鈍感** という特性があります。詳細に関しては後で解説しますが、これを利用して **色彩情報の解像度を落としたり (色彩情報の間引き)** 、また人の目は **低い周波数の変化には敏感で高い周波数の変化には鈍感** という特性があり、これを利用して **色彩情報の高周波数成分に対し量子化のより情報量を削る変換することで圧縮率を高める** 事により大幅に情報量を削り圧縮率を飛躍的に上げることが出来るため、JPEGではこのカラーモデルが※標準で採用されています。

※YCbCr以外のカラーモデルもJPEGの拡張仕様ではサポートされているようですが標準仕様では割愛させていただきます。

RGBからYCbCrに変換

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

人の目には輝度 (Y) の変化には敏感で色彩 (Cb, Cr) の変化に鈍感という特性があります。JPEGデータの圧縮率を高める方法の1つとして、この特性を利用する仕組みがJPEGのデータ構造の仕様として用意されています。その方法としては画像はY, Cb, Crの要素のコンポーネントに分割されそれぞれに対し圧縮処理が行われるのですが、Yの要素のコンポーネントの解像度はそのままにし、単純にCb, Crの要素のコンポーネントの解像度を落とすことにより容量を削減するものになります。

より具体的な方法としてはCb, Crの要素のコンポーネントに対し水平方向もしくは垂直方向、または水平方向、垂直方向両方の解像度を1/2に落とし圧縮率を上げることが出来ます。

<img src="./assets/色の間引き.png">

実は、この間引きの比率には名前がついています。色の間引きを全く行わないものを4:4:4、Cb, Crの要素のコンポーネントの水平方向の解像度を1/2にするものを4:2:2、Cb, Crの要素のコンポーネントの水平、垂直方向の両方の解像度を1/2にするものを4:2:0、Cb, Crの要素のコンポーネントの水平方向の解像度を1/4にするものを4:1:1と呼びます。

### 画像分割

JPEGではYCbCr形式の画像全体を各要素のコンポーネント毎に8×8の画像に分割し、空らの分割された各コンポーネントに対し個別に周波数解析、量子化、エントロピー符号化を行います。この8×8のサイズの画像を **ユニット (Unit)** と呼びます。

さらにCb, Crの要素のコンポーネントの解像度を間引いた際にYの要素のコンポーネントとサイズが不一致になるので整合性を取るために16×8, 8×16, 16×16といったサイズに画像を分割する事があります。これを **最小符号化単位 (MCU)** と呼びます。

また画像全体を特定のサイズで分割するということは画像の縦横のサイズは分割するブロックのサイズの倍数である必要があります。しかし実際に処理する画像がブロックのサイズで割り切れるサイズとは限らないので、割り切れない場合はブロックのサイズで割り切れるサイズになるように画像にパディングを加えます。

### 周波数解析

まずは前提知識として周波数解析とは何かということを解説しなければなりません。周波数解析とは語弊を恐れずに述べるのであれば世の中にあるありとあらゆる信号に対し、 **その対象の信号の周波数分布を調べるための数学** となります。

コンピューターの分野で身近な例としては静止画や動画、音声も信号の一種となり、これらの圧縮に対し周波数解析が応用されているものの例として静止画であれば、この記事で題材にしているJPEGもそうですし動画であればMPEG、音声であればMP3で、この周波数解析が利用されています。

<img src="./assets/周波数解析.png">

人間の目の特性としては **低い周波数の信号に対しては敏感** であり **高い周波数の信号に対しては鈍感** という特性があります。JPEGではこの特性を利用して高い周波数帯の信号に対し量子化により情報量を削ることでデータの圧縮率を高める事ができます。

#### 離散コサイン変換

JPEGで使用されている周波数解析としては **離散コサイン変換** と呼ばれるものが使用されています。

離散コサイン変換とは **N個の離散信号を同じくN個の異なる周波数の余弦関数 (cosine) の波に分解する変換** となります。この離散コサイン変換にはタイプ1からタイプ8まで定義されており、通常使用されるものはタイプ1からタイプ4となります。(タイプ1, 5はN個の離散信号をN+1の周波数帯に変換)

更にJPEGではエンコード時の離散信号から周波数領域への変換は離散コサイン変換タイプ2 (DCT-Ⅱ、またはDCT) が使用されており、デコード時の周波数領域から離散信号への変換には離散コサイン変換タイプ3 (DCT-Ⅲ、または逆DCT) が使用されています。

離散コサイン変換タイプ2 (DCT-Ⅱ、またはDCT)

```math
X_k = \sum_{n=0}^{N-1} x_n cos ( \frac{\pi}{N} (n + \frac{1}{2}) k ) \quad for \quad k = 0, ... N - 1
```

```JavaScript
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
```

離散コサイン変換タイプ3 (DCT-Ⅲ、または逆DCT)

```math
X_k = \frac{1}{2} x_0 \sum_{n=0}^{N-1} x_n cos (\frac{\pi}{N} (k + \frac{1}{2} n) ) \quad for \quad k = 0, ... N - 1
```

```JavaScript
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
```

#### 2次元の離散コサイン変換

前項で説明した離散コサイン変換ですがオリジナルの数式は1次元の離散信号を処理するものとなっています。しかしJPEGは静止画であり信号も2次元データになります。そこでJPEGの仕様では、このオリジナルの離散コサイン変換を2次元に拡張したものが定義されています。

<img src="./assets/2次元離散コサイン変換の例.png">

※図の周波数スペクトルの例では赤を大きい値、緑を中くらいの値、青を小さい値で表しています。また実際の値は正数、負数の両方が数値として現れますが図では絶対値の大きさで色分けして表しています。

<img src="./assets/２次元離散コサイン変換のイメージ.png">

※イメージとしては上記のようなX軸とY軸の2次元的なコサイン波へ分解を行い、それを8×8の64種類の2次元的なコサイン波の周波数スペクトルへ変換するものとなります。

JPEGの仕様書では下記のように数式が定義されています。オリジナルのりさんコサイン変換と異なり直交化のため直流成分に対し1/√2をかけたり、変換、逆変換に対して1/4の係数を掛けることで離散信号と周波数スペクトルの相互変換により絶対値が変化しないような数式が定義されています。

2次元拡張型、離散コサイン変換 (変形DCT-Ⅱ)

```math
\begin{aligned}
&S_{vu} = \frac{1}{4} \, C_u \, C_v \, \sum_{x=0}^7 \, \sum_{y=0}^7 \, s_{yx} \, cos \frac{(2x+1)uπ}{16} \, cos \frac{(2y+1)vπ}{16} \\
&\text{where} \\
&C_u, C_v = 1 / \sqrt{2} \quad for \quad u,v = 0 \\
&C_u, C_v = 1 \quad otherwise
\end{aligned}
```

```JavaScript
function dct2D(N, s) {
    const S = new Float32Array(N * N);
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
```

2次元拡張型、逆離散コサイン変換 (変形DCT-Ⅲ)

```math
\begin{aligned}
&s_{yx} = \frac{1}{4} \, \sum_{u=0}^{7} \, \sum_{v=0}^{7} \, C_u \, C_v S_{vu} \, cos \frac{(2x+1)uπ}{16} \, cos \frac{(2y+1)vπ}{16} \\
&\text{where} \\
&C_u, C_v = 1 / \sqrt{2} \quad for \quad u,v = 0 \\
&C_u, C_v = 1 \quad otherwise
\end{aligned}
```

```JavaScript
function idct2D(N, S) {
    const s = new Float32Array(N * N);
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
```

#### 離散コサイン変換の高速化

前項で説明した2次元に拡張された里サインコサイン変換ですが実は数式を素直に実装してしまうと要素数Nに対し O (N^4) のオーダーでの計算が必要となります。JPEGでは8×8の非常に小さの要素数であるものの、その処理には非常に計算量が多くなり低速になります。

そこでサンプルプログラムではLee方DCT ([A New Algorithm to Compute the
Discrete Cosine Transform - 
BYEONG GI LEE](https://www.nayuki.io/res/fast-discrete-cosine-transform-algorithms/lee-new-algo-discrete-cosine-transform.pdf)) と呼ばれるアルゴリズムを使用しています。

こちらのアルゴリズムの概要を簡単に説明すると前処理、後処理を行うことでN個の要素を持つ離散コサイン変換を2つんの1/2個の要素の離散コサイン変換に分解する事ができます。この処理を再帰的に行うことで O(N^2) から O(N log N) のオーダーまで計算量を抑えることができ高速です。

こちらのアルゴリズムですが1次元用なので2次元用に拡張を行い、これを用いることで O(N^4) から O(N^2 log N) のオーダーまで計算量を減らすことができます。8×8の要素に対し、この高速化アルゴリズムを適用することで※論理値としては20倍ほど高速化を行う事が出来る事ができます。

※サンプルプログラムの実装はループの冗長性を排除したことで実測値は40倍ほどのパフォーマンスが発揮されています。

### 量子化

JPEGにおける量子化とは周波数解析により算出された周波数スペクトルに対しエンコード時は係数で割り、デコード時はその係数を掛ける処理になります。これではただ単に数値の絶対値が変化しただけに思えますが、JPEGで使用されているエントロピー符号化では数値の絶対値が小さければ小さいほど圧縮率が高まる特性があります。

そのため、この量子化の処理では周波数スペクトルをエントロピー符号化に備えデータの数値の絶対値を小さくすることが目的となります。

<img src="./assets/量子化イメージ.png">

人の目は高周波数の情報には鈍感という特性があるので高周波数領域には特に大きな数値を設定し絶対値を小さくします。さらに色彩に関しては輝度よりもその傾向が大きいのでより中、高周波数に大きな値を設定します。

実際にJPEGのエンコードで使用される量子化テーブルは下記のようになります。

<img src="./assets/量子化テーブル例.png">

量子化

```math
Sq_{vu} = round \left( \frac{S_{vu}}{Q_{vu}} \right)
```

```JavaScript
quantizedSample[v][u] = Math.round(sample[v][u] / quantizationTable[v][u]);
```

再量子化

```math
R_{vu} = Sq_{vu} × Q_{vu}
```

```JavaScript
sample[v][u] = quantizedSample[v][u] * quantizationTable[v][u];
```

### 直流差分変換

ユニットの周波数スペクトルの中には縦方向にも横方向にも完全に直流の成分があり、この値は他の交流成分とは異なる処理が行われています。周波数スペクトルのデータはユニット単位で順々に、その値を直にエンコード、デコードを行うのですが直流成分だけは前の直流成分の差分を取り、その値を使用します。

<img src="./assets/直流差分変換.png">

これは差分パルス変調と呼ばれる手法であり、この直流成分の値は隣り合うユニットと値の差が小さい傾向がありこれを利用して差分を取ることで数値の絶対値が小さくすることで圧縮率を上げる処理となります。

エンコード時

```math
DIFF = DC_{i} - PRED
```

```JavaScript
diff = sample[0][0] - prev;
prev = sample[0][0];
```

デコード時

```math
DC_{i} = PREV + DIFF
```

```JavaScript
sample[0][0] = prev + diff;
prev = sample[0][0];
```

### データの転送方法

JPEGは1992年に発表された画像フォーマットであり、その当初はインターネットの回線も非常に低速であり画像ですらデータ転送に苦労していた時代でありました。このJPEGの仕様は、その当時の時代背景を反映するようなものがありデータを受信したものを逐次デコードしてレンダリングするための様々なデータ転送の手段が用意されていました。

#### ジグザグシーケンス

[A.3.6 Zig-zag sequence](https://www.w3.org/Graphics/JPEG/itu-t81.pdf#page=32)

まずは8×8の2次元配列のユニット単体に対しどのような順番でデータを出力するのかを解説します。

データを順次出力しレンダリングを行う関係上、人の目にとって情報量の多い低い周波数のデータから情報の少ない高い周波数に向かって順番に出力するために図のようにジグザグに周波数スペクトルのデータの転送を行います。これはジグザグシーケンスと呼ばれています。

<img src="./assets/ジグザグシーケンス.png">

また、このジグザグシーケンスですが量子化によって高周波数領域の絶対値を小さくする関係上、後半に行けば行くほど0が連続したデータに変換されれJPEGのエントロピー符号化の特性として圧縮率が高くなります。

ジグザグシーケンスの順番の定義

```JavaScript
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
```

2次元配列からジグザグシーケンスに並べ替え

```JavaScript
function orderZigzagSequence(dst, src) {
    for (let i = 0; i < 64; ++i) {
        dst[zigzagSequenceIndices[i]] = src[i];
    }
}
```

ジグザグシーケンスから2次元配列に戻す

```JavaScript
export function reorderZigzagSequence(dst, src) {
    for (let i = 0; i < 64; ++i) {
        dst[i] = src[zigzagSequenceIndices[i]];
    }
}
```

##### ベースラインJPEG

ベースラインJPEGとはJPEGで最も基本的なデータ転送方式となり、単純に画像の左上から右に向かって順次、データの転送を行っていき左端に到達したら左側に戻り次の行のデータをまた左から右に向かって順次、データを転送するといった方式になります。

<img src="./assets/ベースラインJPEGの例.png">

このような特性上、回線速度が遅い場合に順次レンダリング際は上から下に向かって徐々に画像が現れるような形になります。

##### プログレッシブJPEG

プログレッシブJPEGはデータを色要素別、周波数別、ビット深度別と様々な方式で分割し、組み合わせることで最初は大まかなデータから転送を行い、徐々に詳細なデータを順次転送する方式になります。画像全体を素早くレンダリングすることが出来、後から詳細なデータを受信し順次レンダリングする事が出来ます。

<img src="./assets/プログレッシブJPEG例.png">

こちらの転送方法に関しては様々あり、例としては直流データから送り、低周波数、高周波数と周波数帯域を分割して転送を行う。輝度要素を先に送り、色彩要素を後から転送を行う。色彩要素の上位ビットを送り、下位ビットを後から転送する。等の制御が可能でありプログレッシブではこれらの異なる転送方式任意で組み合わせスキャンと呼ばれる転送単位により制御する仕様があります。

<img src="./assets/プログレッシブのデータ転送順の例.png">

こちらの図は転送の制御の一例となります。

[Figure G.1 – Spectral selection and successive approximation progressive processes](https://www.w3.org/Graphics/JPEG/itu-t81.pdf#page=124)

#### コンポーネント

各要素をJPEGではコンポーネントと呼びます。基本的な仕様ではコンポーネント1が輝度 (Y) 、コンポーネント2が青 - 輝度 (Cb) 、コンポーネント3が赤 - 輝度 (Cr) となります。

<img src="./assets/コンポーネントの例.png">

#### スキャン

スキャンとはデータ転送における制御単位となります。
ベースラインでは単一のスキャンになり、プログレッシブでは、これらのスキャンが複数あり複数回にわたり徐々にデータの細部を順次、このスキャン単位で転送する。

プログレッシブのスキャンの制御の例としてGIMPで生成したプログレッシブJPEGは下記のような10個のスキャンを持つデータを生成します。

1. Y, Cb, Crの直流成分 (0番目) の転送
1. Yの低周波数成分 (1～5番目) の転送
1. Cbの交流成分 (1～63番目) の転送
1. Crの交流成分 (1～63番目) の転送
1. Yの中、高周波数成分 (6～63番目) の転送
1. Y, Cb, Crの交流成分 (1～63番目) の下位2ビット目の1ビットの転送
1. Yの直流成分 (0番目) の下位1ビット目の1ビットの転送
1. Crの交流成分 (1～63番目) の下位1ビット目の転送
1. Cbの交流成分 (1～63番目) の下位1ビット目の転送
1. Yの交流成分 (1～63番目) の下位1ビット目の1ビットの転送

#### インターリーブ

[4.8.1 Interleaving multiple components](https://www.w3.org/Graphics/JPEG/itu-t81.pdf#page=23)

1回のスキャンで複数の色情報を転送する方式になります。この際、色の間引きを行っている際、各コンポーネントのユニットの画像のサイズの倍率が一致しなくなるので後述する最小符号化単位 (MCU) での転送を行います。

<img src="./assets/間引きなしのインターリブの例.png">

##### 最小符号化単位

[4.8.2 Minimum coded unit](https://www.w3.org/Graphics/JPEG/itu-t81.pdf#page=25)

JPEGでは画像の左上の処理単位から水平方向に右に向かって順々にデータを書き出し右端に到達したら1行下のデータを順々にデータを書き出し左下に到達したら書き出し終了となります。

個別の色要素の画像を転送する非インターリーブあれば単純にユニット単位で転送を行えばよいのですが複数の色要素の画像を転送するインターリーブの場合で且つ色の間引きにより Y, Cb, Cr のサイズが異なる場合は転送順を考える必要があります。

そこで導入される MCU (Minimum Coded Unit : 最小符号化単位) と呼ばれる仕組みとなります。これは複数のユニットを収納できる処理単位をMCUとして定義し解像度の異なる複数の色情報の転送順を工夫した仕様となります。

<img src="./assets/間引きありのインターリブの例.png">

#### 非インターリーブ

スキャンで転送されてくるコンポーネントが単一の場合は各コンポーネントのユニットのサイズを考慮する必要がなくなりしたがってMCUも使用する必要がなくなるのでユニット単位でのデータ転送になります。

<img src="./assets/非インターリーブの例.png">

#### 逐次近似 (Successive Approximation)

逐次近似では最初に上位ビットのデータを送り、後に残りの未転送の下位ビットの情報を1ビットずつ送る転送になります。

#### エントロピー符号化

JPEGではスキャンデータに対しハフマン符号化を周波数成分の1要素単位で掛けていきます。また周波数成分の係数で連続して0が続く場合はそれらに対し特殊なコードを与え読み込みをスキップする機能があります。

こちらのエントロピー符号化は直流成分と交流成分の2つのモードがあります。

##### ハフマン符号化

JPEGで標準的に使用されているエントロピー符号化となります。よく出現するコードには短いビット列をあまり出現しないコードには長いビット列を割り当てます。

<img src="./assets/ハフマン符号化の例.png">

※余談にはなりますが図に書かれているハフマン木の末端に書かれているRRRRSSSSですがはRRRRが仕様書だとランレングス (run length) と呼ばれるデータで周波数帯の係数に0が続く場合のその係数0の個数が定義されています。またSSSSが仕様書だと追加ビット (additional bits) と記載されていてデータとして読み込むべきビット数が定義されています。こちらの値は箇所によってカテゴリ、逐次近似の場合はカテゴリや逐次近似に使用する生の数値の二通りのデータが入っています。

JPEGのではハフマンテーブルと呼ばれており実際には下記のような値のテーブルがデータの中に定義されています。

直流用のハフマンテーブルの例

|コード長|コードワード|追加読み込み|
|:--|:--|:--|
|2|00|5|
|2|01|6|
|3|100|4|
|3|101|7|
|4|1100|3|
|4|1101|8|
|5|11100|0|
|5|11101|1|
|5|11110|2|
|6|111110|9|
|7|1111110|10|

交流用のハフマンテーブルの例

|コード長|コードワード|ランレングス|追加読み込み|
|:--|:--|:--|:--|
|2|00|0|1|
|3|010|1|1|
|3|011|2|1|
|4|1000|0|2|
|4|1001|0|4|
|4|1010|0|5|
|4|1011|3|1|
|5|11000|0|0 (EOB or EOB0)|
|5|11001|4|1|
|5|11010|5|1|
|6|110110|0|3|
|6|110111|0|6|
|6|111000|1|2|
|6|111001|6|1|
|6|111010|7|1|
|7|1110110|0|7|
続く・・・

##### 算術符号化

こちらはJPEGの仕様で定義されているものの2002年頃に特許が執行したもののハフマン符号化が主流となり尚且つ計算コストが高くほとんど使用されていないので説明は省きます。

## JPEGのエンコード、デコードに必要なアルゴリズム

この章ではJPEGのエンコード、デコードに必要な基礎的なアルゴリズムの実装に関する解説を行います。また具体的なJPEGのデータ構造に根差したエンコード、デコードの処理方法に関しては次の章で解説を行います。

解説する項目としては色空間変換、画像分割、周波数解析、

### JPEGの基本構造

この章では前々章で解説したJPEGのエンコード、デコードに必要な基礎的なアルゴリズムの解説を元に、よりJPEGのデータ構造に根差したのエンコード、デコードに必要な具体的な構造や実装に言及した解説を行います。

<img src="./assets/JPEGのデータ構造の例.png">

- SOI (Start of image marker: 画像スタートマーカー)
- EOI (End of image marker: 画像終了マーカー)
- DQT (Define quantization table marker: 量子化テーブル定義マーカー)
- DHT (Define Huffman table marker: ハフマンテーブル定義マーカー)
- SOF (Start of frame marker: フレームスタートマーカー)
- SOS (Start of scan marker: スキャンマーカー)

JPEGのデータはSOIマーカーから始まりEOIマーカーで終わります。

#### マーカー定義

[Table B.1 – Marker code assignments](https://www.w3.org/Graphics/JPEG/itu-t81.pdf#page=36)

マーカー一覧

|マーカー|値|説明|
|:--|:--|:--|
|SOF0|0xFFC0|ハフマン符号化を用いた差分なしベースラインDCT|
|SOF1|0xFFC1|ハフマン符号化を用いた差分なし拡張シーケンシャルDCT|
|SOF2|0xFFC2|ハフマン符号化を用いた差分なしプログレッシブDCT|
|SOF3|0xFFC3|ハフマン符号化を用いた差分なし可逆圧縮 (シーケンシャル)|
|SOF5|0xFFC5|ハフマン符号化を用いた差分シーケンシャルDCT|
|SOF6|0xFFC6|ハフマン符号化を用いた差分プログレッシブDCT|
|SOF7|0xFFC7|ハフマン符号化を用いた差分可逆圧縮 (シーケンシャル)|
|JPG|0xFFC8|予約済みのJPEG拡張|
|SOF9|0xFFC9|算術符号化を用いた差分なし拡張シーケンシャルDCT|
|SOF10|0xFFCA|算術符号化を用いた差分なしプログレッシブDCT|
|SOF11|0xFFCB|算術符号化を用いた差分なし可逆圧縮 (シーケンシャル)|
|SOF13|0xFFCD|算術符号化を用いた差分シーケンシャルDCT|
|SOF14|0xFFCE|算術符号化を用いた差分プログレッシブDCT|
|SOF15|0xFFCF|算術符号化を用いた差分可逆圧縮 (シーケンシャル)|
|DHT|0xFFC4|ハフマンテーブル定義|
|DAC|0xFFCC|算術符号化条件定義|
|RSTm|0xFFD0～0xFFD7|リスタート|
|SOI|0xFFD8|イメージ開始|
|EOI|0xFFD9|イメージ終了|
|SOS|0xFFDA|スキャン開始|
|DQT|0xFFDB|量子化テーブル定義|
|DNL|0xFFDC|ライン数定義|
|DRI|0xFFDD|リセットインターバル定義|
|DHP|0xFFDE|階層プログレッシブ定義|
|EXP|0xFFDF|拡張リファレンスコンポーネント|
|APPn|0xFFE0～0xFFEF|アプリケーションセグメントの予約|
|JPGn|0xFFF0～0xFFFD|JPEGの拡張の予約|
|COM|0xFFFE|コメント|
|TEM|0xFF01|算術符号化の一時領域|
|RES|0xFF02～0xFFBF|予約済み|

実装例

```JavaScript
/**
 * JPEGのデコードを行う
 */
decode(callback) {
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
```

### DQTセグメントの解析

データ構造

|パラメータ|サイズ (bit数)|ベースライン|拡張シーケンシャル|プログレッシブ|説明|
|:--|:--|:--|:--|:--|:--|
|Lq|16|$$2 + \sum_{t=1}^{n} (65 + 64 × Pq(t))$$|||量子化テーブル定義の構造サイズ|
|Pq|4|0|0, 1|0, 1|数値の精度、0の場合は8bit、1の場合は16bit|
|Tq|4|0～3|0～3|0～3||量子化テーブルID|
|Qk|8, 16|1～255, 1～65535|1～255,1～65535|1～255,1～65535|ジグザグに並べられた係数|

実装例

```JavaScript
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
        
        // Tq: 量子化テーブルの登録先の識別子 (Quantization table destination identifier)
        table.T = Pq_Tq & 0x0f;
        
        // Qk: 量子化テーブルの要素 (Quantization table element)
        if (table.P === 0) {
            // 8bitの精度
            let Q = new Uint8Array(64);
            for (let k = 0; k < 64; ++k) {
                Q[k] = this._stream.readUint8();
            }
            table.Q = Q;
        } else if (table.P === 1) {
            // 16bitの精度
            let Q = new Uint16Array(64);
            for (let k = 0; k < 64; ++k) {
                Q[k] = this._stream.readUint16();
            }
            table.Q = Q;
        }
        segment.tables.push(table);

        readSize += 65 + 64 * table.P;
    }

    return segment;
}
```

### DHTセグメントの解析

データ構造

|パラメータ|サイズ (bit数)|ベースライン|拡張シーケンシャル|プログレッシブ|説明|
|:--|:--|:--|:--|:--|:--|
|Lh|16|$$2 + \sum_{t=1}^{n}(17 + m_t)$$|||ハフマンテーブル定義の構造サイズ|
|Tc|4|0,1|0,1|0,1|テーブルクラス、DC用のテーブルなら0、AC用テーブルなら1|
|Th|4|0,1|0～3|0～3|ハフマンテーブル識別子|
|Li|8|0～255|0～255|0～255|添字iのビット数のハフマンコードの個数|
|Vi,j|8|0～255|0～255|0～255|ハフマンコードに対応する値|

実装例

```JavaScript
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

        // Th: ハフマンテーブルの識別子 (Huffman table destination identifier)
        table.Th = 0xf & Tc_Th;

        // L_i: 長さiのハフマンコード数 (Number of Huffman codes of length i)
        table.L = new Uint8Array(16);
        this._stream.readUint8Array(table.L, 0, 16);

        // V_{i, j}: 各ハフマンコードの値 (Value associated with each Huffman code)
        table.V = new Array(16);
        for (let i = 0; i < 16; ++i) {
            let L = table.L[i];
            let V = new Uint8Array(L);
            this._stream.readUint8Array(V, 0, L);
            table.V[i] = V;

            readSize += L;
        }

        readSize += 17;
        segment.tables.push(table);
    }
}
```

#### ビットデータストリームの実装

```JavaScript
/**
 * 指定長のビット配列を読み込む
 * @param {uint} len 読み込むビット長
 * @return {uint} 読み込んだビット配列
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
```

#### マグニチュードカテゴリ

|SSSS|value|
|:--:|:--:|
|0|0|
|1|–1, 1|
|2|–3～–2, 2～3|
|3|–7～–4, 4～7|
|4|–15～–8, 8～15|
|5|–31～–16, 16～31|
|6|–63～–32, 32～63|
|7|–127～–64, 64～127|
|8|–255～–128, 128～255|
|9|–511～–256, 256～511|
|10|–1023～–512, 512～1023|
|11|–2047～–1024, 1024～2047|
|11|–2047～–1 024, 1024～2047|
|12|–4095～–2 048, 2048～4095|
|13|–8191～–4 096, 4096～8191|
|14|–16383～–8 192, 8192～16383|

### SOF

データ構造

|パラメータ|サイズ (bit)|ベースライン|拡張シーケンシャル|プログレッシブ|説明|
|:--|:--|:--|:--|:--|:--|
|Lf|16|8 + 3 × Nf|〃|〃|フレームヘッダー長|
|P|8|8|8,12|〃|サンプル精度 (ビット数)|
|Y|16|0～65535|〃|〃|ライン数 (縦のサイズ)|
|X|16|1～65535|〃|〃|ラインあたりのサンプル数 (横のサイズ)|
|Nf|8|1～255|〃|1～4|フレームのコンポーネント数|
|$C_i$|8|0～255|〃|〃|コンポーネント識別子|
|$H_i$|4|1～4|〃|〃|水平方向のサンプリング|
|$V_i$|4|1～4|〃|〃|垂直方向のサンプリング|
|$Tq_i$|8|0～3|〃|〃|量子化テーブルセレクター|

実装例

```JavaScript
/**
 * フレームの開始セグメントの解析
 */
 _parseSOF(marker) {
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

        segment.components[i] = component;
    }

    return segment;
}
```

### SOS

データ構造

|パラメータ|サイズ (bit)|ベースライン|拡張シーケンシャル|プログレッシブ|説明|
|:--|:--|:--|:--|:--|:--|
|Ls|16|6+2×Ns|||スキャン開始のサイズ|
|Ns|8|1～4|1～4|1～4|コンポーネント数|
|Csj|8|0～255|0～255|0～255|コンポーネントセレクター|
|Tdj|4|0～1|0～3|0～3|直流用のエントロピー符号化テーブルセレクター|
|Taj|4|0～1|0～3|0～3|交流用のエントロピー符号化テーブルセレクター|
|Ss|8|0|0|0～63|開始スペクトル|
|Se|8|63|63|Ss～63|終了スペクトル|
|Ah|4|0|0|0～13|逐次近似の上位ビット位置|
|Al|4|0|0|0～13|逐次近似の下位ビット位置|

実装例

```JavaScript
/**
 * スキャン開始セグメントの解析
 */
_parseSOS() {
    let segment = {};

    // Ls: スキャンヘッダーデータ長 (Scan header length)
    segment.Ls = this._stream.readUint16();

    // Ns: スキャンのイメージコンポーネント数 (Number of image components in scan)
    segment.Ns = this._stream.readUint8();

    segment.components = new Array(segment.Ns);
    for (let j = 0; j < segment.Ns; ++j) {
        let component = {};

        // Cs_j: スキャンコンポーネントのセレクター (Scan component selector)
        component.Cs = this._stream.readUint8();

        let Td_Ta = this._stream.readUint8();

        // Td_j: 直流エントロピーコーディングテーブルのセレクター (DC entropy coding table destination selector)
        component.Td = 0xf & (Td_Ta >> 4);

        // Ta_j: 交流エントロピーコーディングテーブルのセレクター (AC entropy coding table destination selector)
        component.Ta = 0xf & Td_Ta;

        segment.components[j] = component;
    }

    // Ss: スペクトルかプリディクターの開始セレクター (Start of spectral or predictor selection)
    segment.Ss = this._stream.readUint8();

    // Se: スペクトルの終了セレクター (End of spectral selection)
    segment.Se = this._stream.readUint8();

    let Ah_Al = this._stream.readUint8();

    // Ah: 逐次近似の上位のビットの位置 (Successive approximation bit position high)
    segment.Ah = 0xf & (Ah_Al >> 4);

    // Al: 逐次近似の下位のビットの位置もしくはピットの移動値 (Successive approximation bit position low or point transform)
    segment.Al = 0xf & Ah_Al;

    return segment;
}
```

#### インターリーブ、非インターリーブ

```JavaScript
if (segment.Ns > 1) {
    // インターリーブの場合
    for (let i = 0; i < this._frame.numMcus; ++i) {
        for (let j = 0; j < segment.Ns; ++j) {

        }
    }
} else {
    // 非インターリーブの場合
    for (let i = 0; i < this._frame.components[0]; ++i) {

    }
}
```

#### 

#### 逐次近似

## サンプルプログラム

## あとがき

JPEGの基本概念と実装の解説は如何でしたでしょうか？

筆者はJPEGの公式の仕様書を読みながらの実装は大変ではありましたが、そのノウハウをなるだけ分かりやすく解説に落とし込む作業の方が仕様の分量の関係上、凄く無謀な挑戦になってしまったと感じました。（笑）

日本語でもJPEGの解説を行っている記事やページは数多くありますが仕様を細かく解説されているものが、あまり見受けられなかったのは単純にJPEGの仕様の分量が多い事が起因して日本語の情報量が少ない事を原因を今回の記事の作成で痛感しました。

しかしながら、この記事を読んでくださった皆様が一人でも多くJPEGの仕様を全体的でも部分的にでも理解していただき信号処理や画像処理、画像圧縮などの分野に興味を持っていただけたのであれば幸いです。

## 参考

- [JPEG - Wikipedia](https://ja.wikipedia.org/wiki/JPEG)
- [ITU T.81](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)
- [JPEG File Interchange Format Version 1.02](https://www.w3.org/Graphics/JPEG/jfif3.pdf)
- [離散コサイン変換 - Wikipedia](https://ja.wikipedia.org/wiki/%E9%9B%A2%E6%95%A3%E3%82%B3%E3%82%B5%E3%82%A4%E3%83%B3%E5%A4%89%E6%8F%9B)
- [A New Algorithm to Compute the
Discrete Cosine Transform - 
BYEONG GI LEE](https://www.nayuki.io/res/fast-discrete-cosine-transform-algorithms/lee-new-algo-discrete-cosine-transform.pdf)
