'use client';

import { useState } from 'react';
import { MemeCell, TileActionRail } from '@/components/sploot';

/**
 * A real toy card with a working action rail — the heart toggles the banger
 * state so the catalog shows the interaction, not just a still. Lives inside the
 * transformed card shell so the rail rides along on card hover.
 */
export function TileActionDemo() {
  const [banger, setBanger] = useState(true);

  return (
    <div className="sploot-press sploot-shadow w-[260px] max-w-full overflow-hidden rounded-[var(--sploot-radius)] border-[3px] border-sploot-ink bg-sploot-panel">
      <MemeCell
        file="IMG_4471.png"
        index="v#00471"
        doodle="cat"
        caption="two cats arguing at a table"
        state="default"
        className="border-0"
      />
      <TileActionRail
        banger={banger}
        onToggleBanger={() => setBanger((v) => !v)}
        onShare={() => {}}
        onDelete={() => {}}
      />
    </div>
  );
}
