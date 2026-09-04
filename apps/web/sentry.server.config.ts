import * as Sentry from '@sentry/nextjs';

import { createSentryOptions } from './lib/sentry';

Sentry.init(createSentryOptions('server'));
