import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-6">
      <p className="text-sm text-faint">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">ページが見つかりません</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        URL が間違っているか、ページが移動した可能性があります。
      </p>
      <Link href="/" className="mt-2 text-sm text-blue hover:underline">
        ダッシュボードに戻る
      </Link>
    </main>
  );
}
