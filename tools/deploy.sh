#!/bin/zsh
# Put Codevember on the web at ericlevin.dev/codevember/: built with base /codevember/, its files under /codevember/
# in the `codevember` Vercel project, so the portfolio (PortfolioII, project portfolio-ii) hands ericlevin.dev/codevember/*
# straight through to it with a rewrite (vercel.json there, pointing at this project's production URL). The films
# aren't in the build: they're on R2 (public/footage/footage.json lists them; ~/codeprojects/footage/publish.mjs).
#   zsh tools/deploy.sh            build, deploy to production
#   zsh tools/deploy.sh --preview  a preview deployment instead
set -e
ROOT=${0:A:h:h}
OUT=$ROOT/deploy/vercel
cd $ROOT
npx tsc --noEmit
npx vite build --outDir $OUT/codevember --emptyOutDir | tail -3
cat > $OUT/vercel.json <<'JSON'
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "redirects": [
    { "source": "/", "destination": "/codevember/", "permanent": false },
    { "source": "/codevember", "destination": "/codevember/", "permanent": false },
    { "source": "/codevember/:day(\\d\\d)", "destination": "/codevember/:day/", "permanent": false },
    { "source": "/codevember/footage", "destination": "/codevember/footage/", "permanent": false }
  ],
  "headers": [
    { "source": "/codevember/assets/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] },
    { "source": "/codevember/footage/footage.json", "headers": [{ "key": "Cache-Control", "value": "public, max-age=60" }] }
  ]
}
JSON
cd $OUT
[[ -d .vercel ]] || npx -y vercel@latest link --yes --project codevember --scope ericrius1s-projects
if [[ $1 == --preview ]]; then npx -y vercel@latest deploy --yes; else npx -y vercel@latest deploy --prod --yes; fi
