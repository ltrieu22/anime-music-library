import type { ReactNode, KeyboardEventHandler } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';

export function QueueTile({ id, children, onDragStart, onDragEnd, onKeyDown }: {
  id: string;
  children: ReactNode;
  onDragStart: () => void;
  onDragEnd: () => void;
  onKeyDown: KeyboardEventHandler<HTMLLIElement>;
}) {
  const controls = useDragControls();
  const reducedMotion = useReducedMotion();

  return (
    <Reorder.Item
      as="li" value={id} data-queue-item={id} tabIndex={0}
      aria-describedby="queue-reorder-help"
      className="queue-row relative flex cursor-grab select-none items-center gap-2.5 rounded-xl border border-neutral-800 bg-[#202123] p-2 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-emerald-400 active:cursor-grabbing"
      style={{ touchAction: 'pan-x' }}
      dragListener={false} dragControls={controls} dragMomentum={false}
      layout="position"
      transition={{ layout: reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 } }}
      whileDrag={{
        scale: reducedMotion ? 1 : 1.02,
        borderColor: '#34d399',
        boxShadow: '0 12px 28px rgba(0, 0, 0, 0.45)',
        cursor: 'grabbing',
      }}
      onPointerDown={event => {
        if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
        controls.start(event);
      }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
    >{children}</Reorder.Item>
  );
}
