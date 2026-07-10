import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemeCell } from '@/components/sploot/meme-cell';

describe('MemeCell media', () => {
  it('renders real media uncropped when src is provided', () => {
    render(
      <MemeCell
        file="cats-arguing.jpg"
        src="/starter-pile/cats-arguing.jpg"
        mediaAlt="two cats arguing at a table"
        caption="two cats arguing at a table"
      />
    );

    const image = screen.getByAltText('two cats arguing at a table');
    expect(image).toHaveClass('object-contain');
    expect(image).not.toHaveClass('object-cover');
  });

  it('keeps the doodle API working for styleguide and state surfaces', () => {
    const { container } = render(
      <MemeCell file="legacy.png" doodle="cat" caption="legacy exhibit" />
    );

    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});

