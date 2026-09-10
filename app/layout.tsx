// 여러 페이지가 공유하는 공통 틀. html / body 태그 그리기. 브라우저 속성 결정.
// 모든 페이지가 이 파일을 거쳐서 랜더링 됨. 지금은 단일 페이지라 골격만 잡아주는 최소 형태.

import "./globals.css";

export const metadata = {
  title: "TONEMATE — 톤 매칭 이미지 보정 툴",
  description: "레퍼런스 이미지에 맞춰 여러 장의 이미지 톤을 자동으로 통일합니다.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 리디자인 타이포 - Archivo (Google Fonts). 한국어는 시스템 산세리프(Pretendard 있으면 사용)로 폴백. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
