import * as Sentry from '@sentry/nextjs';

import { createSentryOptions } from './lib/sentry';

Sentry.init(createSentryOptions('client'));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
