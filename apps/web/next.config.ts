import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 워크스페이스 패키지는 src/*.ts 를 그대로 내보내므로 Next가 컴파일해야 한다
  transpilePackages: ['@nara/api', '@nara/db', 'worker'],
  // pnpm 모노레포: 파일 트레이싱 루트를 저장소 루트로
  outputFileTracingRoot: path.join(process.cwd(), '../..'),
  // 네이티브/드라이버 패키지는 번들하지 않는다
  serverExternalPackages: ['postgres'],
  // 린트는 oxlint 로 별도 실행한다
  eslint: { ignoreDuringBuilds: true },
}

export default nextConfig
