# S05.1 Validation Plan

1. Protected-main CI: run the repository Validate workflow through the pull request (`npm ci`, `npm run check`, high-severity audit).
2. Confirm S05.1 contract test passes and no S04 API/runtime tests regress.
3. After merge, deploy DEV only using the existing dev build/deploy path.
4. Verify Cloudflare Access still protects the private HQ/API surface.
5. Open Setup Finder in DEV and verify:
   - current opportunities load from the same-origin private API;
   - status/ticker filters behave predictably;
   - selecting an opportunity loads canonical instrument identity, provider provenance, lifecycle transitions, source event identifiers, and TradingView link;
   - empty/error/loading states are usable;
   - no mutation controls or live-trade actions exist.
6. Keep PROD untouched during S05.1 acceptance.
