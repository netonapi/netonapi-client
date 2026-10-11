# NetonAPI 用户控制台镜像。构建约定与管理台镜像完全相同（父目录上下文、复刻布局、只 COPY 显式子路径），
# 说明见 newgate-front/Dockerfile 头部注释。
#   docker build -f NewGate/newgate-client/Dockerfile -t nanogate-console:latest .
FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
ENV NEXT_TELEMETRY_DISABLED=1

# ── canonical：共享工作区运行时（控制台复用管理台基仓里的这一个包）──
COPY Neton/neton-application-front/packages/front-workspace/package.json /src/Neton/neton-application-front/packages/front-workspace/package.json
COPY Neton/neton-application-front/packages/front-workspace/src          /src/Neton/neton-application-front/packages/front-workspace/src

# ── canonical 控制台模块（四个）──
COPY Neton/neton-application-client-gateway/package.json  /src/Neton/neton-application-client-gateway/package.json
COPY Neton/neton-application-client-gateway/tsconfig.json /src/Neton/neton-application-client-gateway/tsconfig.json
COPY Neton/neton-application-client-gateway/src           /src/Neton/neton-application-client-gateway/src
COPY Neton/neton-application-client-account/package.json  /src/Neton/neton-application-client-account/package.json
COPY Neton/neton-application-client-account/tsconfig.json /src/Neton/neton-application-client-account/tsconfig.json
COPY Neton/neton-application-client-account/src           /src/Neton/neton-application-client-account/src
COPY Neton/neton-application-client-member/package.json   /src/Neton/neton-application-client-member/package.json
COPY Neton/neton-application-client-member/tsconfig.json  /src/Neton/neton-application-client-member/tsconfig.json
COPY Neton/neton-application-client-member/src            /src/Neton/neton-application-client-member/src
COPY Neton/neton-application-client-payment/package.json  /src/Neton/neton-application-client-payment/package.json
COPY Neton/neton-application-client-payment/tsconfig.json /src/Neton/neton-application-client-payment/tsconfig.json
COPY Neton/neton-application-client-payment/src           /src/Neton/neton-application-client-payment/src

# ── 本仓（含树内基础包 packages/client-*）──
WORKDIR /src/NewGate/newgate-client
COPY NewGate/newgate-client/package.json NewGate/newgate-client/pnpm-workspace.yaml NewGate/newgate-client/pnpm-lock.yaml \
     NewGate/newgate-client/tsconfig.base.json NewGate/newgate-client/turbo.json ./
COPY NewGate/newgate-client/scripts ./scripts
COPY NewGate/newgate-client/packages/client-contract/package.json ./packages/client-contract/package.json
COPY NewGate/newgate-client/packages/client-contract/src          ./packages/client-contract/src
COPY NewGate/newgate-client/packages/client-kit/package.json      ./packages/client-kit/package.json
COPY NewGate/newgate-client/packages/client-kit/src               ./packages/client-kit/src
COPY NewGate/newgate-client/packages/client-resource/package.json ./packages/client-resource/package.json
COPY NewGate/newgate-client/packages/client-resource/src          ./packages/client-resource/src
COPY NewGate/newgate-client/packages/client-runtime/package.json  ./packages/client-runtime/package.json
COPY NewGate/newgate-client/packages/client-runtime/src           ./packages/client-runtime/src
COPY NewGate/newgate-client/apps/console/package.json NewGate/newgate-client/apps/console/next.config.ts \
     NewGate/newgate-client/apps/console/client.modules.ts NewGate/newgate-client/apps/console/postcss.config.mjs \
     NewGate/newgate-client/apps/console/tsconfig.json ./apps/console/
COPY NewGate/newgate-client/apps/console/public ./apps/console/public
COPY NewGate/newgate-client/apps/console/src    ./apps/console/src

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @neton/application-client-console build

WORKDIR /src/NewGate/newgate-client/apps/console
# 控制台的浏览器请求全部经本进程的 /api/backend 服务端代理转发（cookie → Bearer），
# 所以只需运行期的内网后端地址，不需要构建期的公网基址、也不涉及 CORS。
ENV NETON_BACKEND_URL=http://newgate:8800
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1
CMD ["pnpm", "exec", "next", "start", "-p", "3000"]
