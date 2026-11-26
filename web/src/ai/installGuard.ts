// Imported first by main.tsx. Static imports run in order, so Private mode's network guard wraps fetch before any other
// module (Firebase included) has run. (The Firebase AI SDK also looks fetch up at call time, which is why tests that
// install the guard later still hold.)
import { installPrivacyGuard } from './privacy';

installPrivacyGuard();
