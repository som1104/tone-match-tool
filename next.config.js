/** @type {import('next').NextConfig} */
const nextConfig = {
  // 서버 기능이 없는 순수 클라이언트 앱이라, 정적 파일(out/)로 빌드해서
  // 어디든 정적 호스팅(예: Render Static Site)에 올릴 수 있게 한다.
  output: "export",
};
module.exports = nextConfig;
