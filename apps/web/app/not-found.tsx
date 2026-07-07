import type { Metadata } from 'next';
import { StateSurface } from '@/components/sploot/state-surface';

export const metadata: Metadata = {
  title: 'route 404 | sploot',
};

export default function NotFound() {
  return (
    <StateSurface
      eyebrow="route 404"
      title="no pile here."
      description="this route never made it into the index. open sploot and search the pile from the front door."
      primaryAction={{ href: '/', label: 'open sploot' }}
      secondaryAction={{ href: '/help', label: 'get help', variant: 'ghost' }}
      doodle="bubble"
      status={[
        { label: 'route', value: '404' },
        { label: 'index', value: 'miss' },
        { label: 'recovery', value: 'front door', ok: true },
      ]}
    />
  );
}
