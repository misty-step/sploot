import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GalleryPipeline } from '@/components/sploot/gallery-pipeline';

describe('GalleryPipeline', () => {
  it('keeps unavailable machine facts neutral', () => {
    render(<GalleryPipeline state="idle" query="" />);

    expect(screen.getAllByText('—')).toHaveLength(5);
    expect(screen.getByText('model')).toBeInTheDocument();
    expect(screen.queryByText('query')).not.toBeInTheDocument();
    expect(screen.queryByText('embed')).not.toBeInTheDocument();
    expect(screen.queryByText('matches')).not.toBeInTheDocument();
  });

  it('renders only API-backed search facts and human result counts', () => {
    render(
      <GalleryPipeline
        state="ready"
        query="cats yelling"
        resultCount={17}
        latencyMs={42}
        model="clip-v1"
        cached
      />
    );

    expect(screen.getByText('clip-v1')).toBeInTheDocument();
    expect(screen.getByText('17 matches')).toBeInTheDocument();
    expect(screen.getByText('42 ms')).toBeInTheDocument();
    expect(screen.getByText('cached')).toBeInTheDocument();
    expect(screen.queryByText(/cosine 0\./i)).not.toBeInTheDocument();
  });
});
