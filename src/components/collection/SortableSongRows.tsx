import React, { createContext, useContext, useRef } from 'react';
import { Reorder, useDragControls, useReducedMotion } from 'motion/react';

const OrderContext = createContext<{ values: string[]; onReorder?: (keys: string[]) => void }>({ values: [] });

export function SortableSongRows({ as, values, onReorder, children, className }: {
  as: 'tbody' | 'div'; values: string[]; onReorder?: (keys: string[]) => void;
  children: React.ReactNode; className?: string;
}) {
  const contents = <OrderContext.Provider value={{ values, onReorder }}>{children}</OrderContext.Provider>;
  if (!onReorder) return React.createElement(as, { className }, contents);
  return <Reorder.Group as={as} axis="y" values={values} onReorder={onReorder} className={className}>
    {contents}
  </Reorder.Group>;
}

export function SortableSongRow({ as, rowKey, children, className, onContextMenu }: {
  as: 'tr' | 'div'; rowKey: string; children: React.ReactNode; className?: string;
  onContextMenu: React.MouseEventHandler<HTMLElement>;
}) {
  const { values, onReorder } = useContext(OrderContext);
  const controls = useDragControls();
  const reducedMotion = useReducedMotion();
  const dragged = useRef(false);
  if (!onReorder) return React.createElement(as, { className, onContextMenu }, children);
  return <Reorder.Item as={as} value={rowKey} data-song-row={rowKey}
    tabIndex={0} aria-label={`Song ${values.indexOf(rowKey) + 1}. Drag to reorder, or use Alt plus Arrow Up or Arrow Down.`}
    className={`${className ?? ''} relative cursor-grab select-none bg-[#232628] focus-visible:outline-2 focus-visible:outline-emerald-400 active:cursor-grabbing`}
    style={{ touchAction: 'pan-y' }}
    layout="position" dragListener={false} dragControls={controls} dragMomentum={false}
    transition={{ layout: reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 38 } }}
    whileDrag={{ backgroundColor: '#293c35', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', cursor: 'grabbing' }}
    onPointerDown={event => {
      dragged.current = false;
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button,a,input,select,textarea,[role="button"]'))) return;
      // Touch users can scroll the cards normally; the number/grip starts a drag.
      if (event.pointerType === 'touch' && !(event.target instanceof Element && event.target.closest('[data-song-drag-handle]'))) return;
      controls.start(event);
    }}
    onDragStart={() => { dragged.current = true; }}
    onClickCapture={event => {
      if (dragged.current) { event.preventDefault(); event.stopPropagation(); dragged.current = false; }
    }}
    onContextMenu={onContextMenu}
    onKeyDown={event => {
      if (event.target !== event.currentTarget || !event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const index = values.indexOf(rowKey);
      const target = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (target < 0 || target >= values.length) return;
      const next = [...values];
      next.splice(index, 1);
      next.splice(target, 0, rowKey);
      onReorder(next);
    }}
  >{children}</Reorder.Item>;
}
