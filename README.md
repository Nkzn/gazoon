# gazoon

Images on Your R2.

[English version here](README.en.md)

**スクショを撮る。アップロードする。URL をコピーする。それだけ。** — ただし画像が置かれるのは
**あなた自身の** Cloudflare アカウントです。gazoon というサービスも、その運営者も存在しません。
自分のインスタンスをデプロイして使うので、そのバケットを読めるのはあなただけです。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Nkzn/gazoon)

![アップロード直後の gazoon の画面。画像の URL がすでにクリップボードに入っている](docs/imgs/app-3-uploaded.png)

## できること

- ブラウザに画像をドロップ / ペースト / 選択すると、アップロードされて URL がクリップボードに入ります。
- アップロードした画像の一覧。ワンクリックで URL のコピーと削除ができます。
- どこにでも貼れる直リンク URL（`/i/<id>.jpg`）。

## なぜ自分で建てるのか

ホスト型のスクリーンショット共有サービスはよくできていて、たいていの用途ではそちらのほうが
快適です。ただ、どれを使うにせよ画像は預けた先に溜まっていきます。gazoon は「自分のデータは
自分の管理下に置いておきたい」という、それとは別の好みのための選択肢です。

Worker も R2 バケットも D1 データベースも、あなた自身の Cloudflare アカウントの中に作られます。
認証情報は、あなたが自分で生成したトークン 1 つだけです。どう動かすか、何を残すか、いつ消すかを
自分で決められます。そして同時に、その責任もあなたが引き受けることになります。

費用は Cloudflare の料金体系がそのまま適用されます。Workers・R2・D1 にはいずれも無料枠が
ありますが、実際にいくらかかるかは使い方次第ですし、料金体系そのものも変わります。金額を約束
することはできないので、[Workers](https://developers.cloudflare.com/workers/platform/pricing/) /
[R2](https://developers.cloudflare.com/r2/pricing/) /
[D1](https://developers.cloudflare.com/d1/platform/pricing/) の料金ページで最新の条件を確認して
ください。なお R2 の利用にはお支払い方法の登録が必要です。

## デプロイする

上のボタンを押してください。Cloudflare がこのリポジトリをあなたの GitHub / GitLab アカウントに
複製し、必要なリソースを作成して Worker をデプロイします。全体で 1 分ほどです。

Cloudflare アカウントで R2 を一度も使ったことがない場合は、バケットを作れるように先に
ダッシュボードで R2 を有効化しておいてください。

### 1. プロジェクト名を決める

Git アカウントとプロジェクト名を選びます。画像のメタデータを保存する D1 データベースは自動で
作られるので、**Create new** のままにしておいてください。

![Git アカウントを選択し、gazoon という名前の D1 データベースを新規作成するセットアップ画面](docs/imgs/setup-1-project.png)

### 2. バケット名を決める

画像ファイルそのものを保存する R2 バケットも同様です。

![gazoon-images という名前のバケットを新規作成するよう設定されたセットアップ画面の R2 セクション](docs/imgs/setup-2-bucket.png)

### 3. アップロードトークンを設定する

トークンを生成して `UPLOAD_TOKEN` に貼り付けます。

```sh
openssl rand -hex 32
```

これがインスタンスの唯一の認証情報です。これを持っている人は誰でもアップロード・一覧取得・削除が
できてしまうので、パスワードと同じように扱ってください。

**Protect with Cloudflare Access** は OFF のままにしてください。これはホスト名全体を保護する
ため、ONにすると画像の URL にもログインが要求されてしまいます。画像リンクを壊さずに Access を
使う方法は[デプロイしたあとに](#デプロイしたあとに)を参照してください。

![UPLOAD_TOKEN が入力され、デプロイコマンドが npm run deploy になっているセットアップ画面](docs/imgs/setup-3-token.png)

### 4. ビルドを待つ

`npm run deploy` がデータベースのマイグレーションを適用してからデプロイします。初回ビルドでも
1 分かかりません。

![成功した Cloudflare のビルドログ](docs/imgs/setup-4-build.png)

### 5. Worker の URL を有効にする

Cloudflare が Worker の URL を無効な状態で作成することが確認されています。デプロイ自体は成功
しているのに、開くべき URL がどこにもない、という状態になります。こうなっているときの画面が
これです（右端のトグルが OFF になっています）。

![2 つの Worker URL がどちらも無効になっている Domains タブ](docs/imgs/setup-5-url-off.png)

production の Worker URL を ON にすると、URL が応答するようになります。

![production の Worker URL が有効になった Domains タブ](docs/imgs/setup-6-url-on.png)

## 初回の起動

`*.workers.dev` の URL を開き、セットアップ時に設定したのと同じトークンを貼り付けます。トークンは
そのブラウザの `localStorage` に保存され、以降は bearer トークンとして送られます。あなた自身の
インスタンス以外には、どこにも送られません。

![アップロードトークンの入力を求める gazoon のロック画面](docs/imgs/app-1-unlock.png)

あとは枠の上に画像をドロップするか、クリップボードからペーストするか、クリックしてファイルを
選ぶだけです。アップロードが終わった時点で URL がコピーされています。

![画像の一覧が空の状態の gazoon の画面](docs/imgs/app-2-empty.png)

その URL は、送った相手なら誰でもログインなしで開けます。それがこのツールの目的です。
シークレットウィンドウで試してみてください。

## デプロイしたあとに

- **独自ドメイン。** ダッシュボードで Worker にルートを追加します。デプロイボタンはあなたが
  どのゾーンを持っているか知りようがないため、自動では設定されません。
- **Cloudflare Access。** `/` と `/api/*` に Zero Trust のポリシーを設定すると、管理画面に
  トークンだけでなく本人確認も要求できます。必ずパス単位でスコープを切り、`/i/*` は対象から
  外してください。外さないと、他の人から画像リンクが見えなくなります。デプロイ画面にある
  ホスト名全体のトグルがここでは使えないのは、これが理由です。
- **プレビュー URL。** デプロイフローは production 以外のブランチ用に
  `*-<worker>.workers.dev` も公開します。同じバケットとデータベースに繋がっているので、画像を
  配信する公開ホスト名が 2 つある状態が気になる場合は **Domains** で無効にしてください。
- **トークンのローテーション。** `wrangler secret put UPLOAD_TOKEN` を実行し、画面で入力し
  直してください。

## セキュリティについて

このプロジェクトが実際に守ろうとしている性質なので、はっきり書いておきます。

- **ID は CSPRNG の 128 ビット出力**で、URL セーフな 22 文字です。画像の URL は推測できません。
  だからこそ、限定共有の URL を安心して貼れます。
- **画像の URL は公開かつ永続**で、削除するまで有効です。リンクを知っていれば誰でも見られます
  — それが目的です — が、一覧できる手段はありません。
- **一覧取得と削除にはトークンが必要**です。一覧を見られるのはあなただけです。
- **クライアントが申告した Content-Type は無視します。** アップロードされたデータはマジック
  バイトで判定し、PNG / JPEG / GIF / WebP / AVIF だけを保存します。SVG は意図的に拒否して
  います。スクリプトを埋め込める形式であり、画像はトークンを保持している画面と同じオリジンから
  配信されるためです。
- `/i/*` のレスポンスには `X-Content-Type-Options: nosniff` と
  `default-src 'none'; sandbox` の CSP を付けています。
- 元のファイル名は保存キーに一切使いません。EXIF の除去は未実装です（下記参照）。

## まだできていないこと

v0.1 は意図的に小さく作ってあります。次に予定しているものは以下です。

- デスクトップのキャプチャクライアント。ホットキー → 範囲選択 → アップロード → URL がクリップボードへ。
- アップロード時の EXIF 除去。
- `private` / `unlisted` の区別と、有効期限付き URL。
- ブラウザ拡張。

## ローカル開発

```sh
npm install
cp .dev.vars.example .dev.vars   # UPLOAD_TOKEN を埋める
npm run db:migrations:apply:local
npm run dev
```

シェルからアップロードする場合:

```sh
curl -X POST http://localhost:8787/api/upload \
  -H "Authorization: Bearer $UPLOAD_TOKEN" \
  -H "Content-Type: image/png" \
  --data-binary @screenshot.png
```

## ライセンス

MIT

## Buy me a coffee

gazoon は無料で、常にセルフホストです。売るものが何もありません。スクリーンショットを誰かに
預けてお金を払う必要がなくなったなら、コーヒー 1 杯がちょうどいいお礼になります。

[![Buy Me a Coffee](https://img.shields.io/badge/Buy_Me_a_Coffee-nkzn-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/nkzn)
