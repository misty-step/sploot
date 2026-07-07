import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DeadShareLinkState, StateSurface } from '@/components/sploot/state-surface';

describe('StateSurface', () => {
  it('renders Sploot terminal-state chrome with one heading and a functional CTA', () => {
    render(
      <StateSurface
        eyebrow="route 404"
        title="no pile here."
        description="this route never made it into the index."
        primaryAction={{ href: '/', label: 'open sploot' }}
        status={[
          { label: 'route', value: '404' },
          { label: 'recovery', value: 'front door', ok: true },
        ]}
      />
    );

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'no pile here.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'open sploot' })).toHaveAttribute('href', '/');
    expect(screen.getByLabelText('system status')).toHaveTextContent('recovery');
  });

  it('gives a dead meme share URL voice without duplicating the raw not-found heading', () => {
    render(<DeadShareLinkState kind="meme" />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'this meme left the pile.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'open sploot' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/^Meme not found$/)).not.toBeInTheDocument();
  });
});
